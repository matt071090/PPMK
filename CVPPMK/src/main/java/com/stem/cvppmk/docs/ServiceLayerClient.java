package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.cert.X509Certificate;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Client Service Layer SAP B1, khusus baca. Login sekali, session (cookie B1SESSION, ROUTEID) dipakai ulang,
 * login ulang otomatis kalau session habis (HTTP 401).
 * Konfigurasi di ./application.properties: sap.sl.url, sap.sl.company-db, sap.sl.username, sap.sl.password.
 * Pakai HttpURLConnection (bukan java.net.http) supaya tetap jalan di Java 8.
 */
@Component
public class ServiceLayerClient {
    private static final Logger log = LoggerFactory.getLogger(ServiceLayerClient.class);

    private final String baseUrl, companyDb, username, password;
    private final boolean trustAllCerts;
    private final ObjectMapper json;
    private SSLSocketFactory trustAllFactory;
    private String cookies; // null = belum login

    public ServiceLayerClient(@Value("${sap.sl.url:}") String baseUrl,
                              @Value("${sap.sl.company-db:}") String companyDb,
                              @Value("${sap.sl.username:}") String username,
                              @Value("${sap.sl.password:}") String password,
                              @Value("${sap.sl.trust-all-certs:true}") boolean trustAllCerts,
                              ObjectMapper json) {
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.companyDb = companyDb;
        this.username = username;
        this.password = password;
        this.trustAllCerts = trustAllCerts;
        this.json = json;
    }

    public boolean configured() {
        return !baseUrl.isEmpty() && !companyDb.isEmpty() && !username.isEmpty();
    }

    /** POST tanpa body, untuk action seperti CompanyService_GetAdminInfo. */
    public JsonNode post(String path) throws IOException {
        return call("POST", path, null, true);
    }

    /** POST dengan body JSON, untuk action baca yang butuh parameter (mis. CompanyService_GetPeriod). */
    public JsonNode post(String path, Object body) throws IOException {
        return call("POST", path, json.writeValueAsString(body), true);
    }

    public JsonNode get(String path) throws IOException {
        return call("GET", path, null, true);
    }

    private synchronized JsonNode call(String method, String path, String body, boolean retry) throws IOException {
        if (!configured()) throw new IllegalStateException("Service Layer belum dikonfigurasi (sap.sl.* di application.properties)");
        if (cookies == null) login();
        Response res = send(method, path, body);
        if (res.status == 401 && retry) {
            log.debug("Session Service Layer habis, login ulang");
            login();
            return call(method, path, body, false);
        }
        if (res.status >= 400) throw new IOException("Service Layer " + res.status + ": " + errorMessage(res.body));
        return res.body.trim().isEmpty() ? json.createObjectNode() : json.readTree(res.body);
    }

    private void login() throws IOException {
        cookies = null;
        Map<String, String> creds = new LinkedHashMap<>();
        creds.put("CompanyDB", companyDb);
        creds.put("UserName", username);
        creds.put("Password", password);
        Response res = send("POST", "Login", json.writeValueAsString(creds));
        if (res.status >= 400) throw new IOException("Login Service Layer gagal (" + res.status + "): " + errorMessage(res.body));
        // simpan cookie session (B1SESSION, ROUTEID) untuk request berikutnya
        StringBuilder sb = new StringBuilder();
        for (String c : res.setCookies) sb.append(sb.length() == 0 ? "" : "; ").append(c.split(";", 2)[0]);
        cookies = sb.toString();
        log.info("Login Service Layer {} sebagai {} berhasil", companyDb, username);
    }

    private static class Response {
        int status;
        String body;
        List<String> setCookies;
    }

    private Response send(String method, String path, String body) throws IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(baseUrl + "/" + path).openConnection();
        if (trustAllCerts && con instanceof HttpsURLConnection) { // Service Layer umumnya pakai sertifikat self-signed
            ((HttpsURLConnection) con).setSSLSocketFactory(trustAll());
            ((HttpsURLConnection) con).setHostnameVerifier((host, session) -> true);
        }
        con.setConnectTimeout(15_000);
        con.setReadTimeout(60_000);
        con.setRequestMethod(method);
        con.setRequestProperty("Content-Type", "application/json");
        if (cookies != null) con.setRequestProperty("Cookie", cookies);
        try {
            if (body != null || "POST".equals(method)) {
                con.setDoOutput(true);
                try (OutputStream out = con.getOutputStream()) {
                    if (body != null) out.write(body.getBytes(StandardCharsets.UTF_8));
                }
            }
            Response res = new Response();
            res.status = con.getResponseCode();
            InputStream in = res.status >= 400 ? con.getErrorStream() : con.getInputStream();
            res.body = in == null ? "" : StreamUtils.copyToString(in, StandardCharsets.UTF_8);
            List<String> sc = con.getHeaderFields().get("Set-Cookie");
            res.setCookies = sc == null ? Collections.<String>emptyList() : sc;
            return res;
        } finally {
            con.disconnect();
        }
    }

    private String errorMessage(String body) {
        try {
            JsonNode msg = json.readTree(body).path("error").path("message");
            return msg.isTextual() ? msg.asText() : msg.path("value").asText(body);
        } catch (IOException e) {
            return body;
        }
    }

    private SSLSocketFactory trustAll() {
        if (trustAllFactory != null) return trustAllFactory;
        try {
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, new TrustManager[]{new X509TrustManager() {
                public void checkClientTrusted(X509Certificate[] c, String a) { }
                public void checkServerTrusted(X509Certificate[] c, String a) { }
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            }}, null);
            return trustAllFactory = ctx.getSocketFactory();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
