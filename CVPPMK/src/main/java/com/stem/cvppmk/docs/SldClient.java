package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.cert.X509Certificate;
import java.util.List;

/**
 * Client baca OData License Server / System Landscape Directory (SLD) SAP B1, mis. https://host:40000/sld/sld0100.svc.
 * Dipakai untuk jumlah license per tipe (LicenseModules) dan file license (LicenseFiles); data ini tidak ada di database company.
 * Konfigurasi di ./application.properties: sap.sld.url, sap.sld.username, sap.sld.password. Hanya GET.
 * Login seperti Control Center: POST /sld/sld.svc/LogonByNamedUser (B1SiteUser) atau LogonBySystemUser (user lain) dengan
 * {Account, Password}, lalu cookie sesi (JSESSIONID) dipakai ulang; SLD tidak menerima Basic auth. Login ulang otomatis kalau HTTP 401.
 */
@Component
public class SldClient {
    private final String baseUrl, username, password;
    private final boolean trustAllCerts;
    private final ObjectMapper json;
    private SSLSocketFactory trustAllFactory;
    private String cookies;

    public SldClient(@Value("${sap.sld.url:}") String baseUrl,
                     @Value("${sap.sld.username:}") String username,
                     @Value("${sap.sld.password:}") String password,
                     @Value("${sap.sld.trust-all-certs:true}") boolean trustAllCerts,
                     ObjectMapper json) {
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.username = username;
        this.password = password;
        this.trustAllCerts = trustAllCerts;
        this.json = json;
    }

    public boolean configured() {
        return !baseUrl.isEmpty() && !username.isEmpty();
    }

    /** GET entity set OData v2, hasil = array baris (d.results). */
    public synchronized JsonNode list(String entitySet) throws IOException {
        if (!configured()) throw new IllegalStateException("License Server belum dikonfigurasi (sap.sld.* di application.properties)");
        String url = baseUrl + "/" + entitySet + "?$format=json";
        if (cookies == null) login();
        Response res = send("GET", url, null);
        if (res.status == 401) {   // sesi habis: login ulang sekali
            login();
            res = send("GET", url, null);
        }
        if (res.status == 401) throw new IOException("License Server menolak akses (HTTP 401). Cek sap.sld.username / sap.sld.password.");
        if (res.status >= 400) throw new IOException("License Server HTTP " + res.status + ": " + res.body.replaceAll("\\s+", " ").trim());
        JsonNode d = json.readTree(res.body).path("d");
        return d.has("results") ? d.path("results") : d;
    }

    private void login() throws IOException {
        cookies = null;
        String fn = "b1siteuser".equalsIgnoreCase(username) ? "LogonByNamedUser" : "LogonBySystemUser";
        String body = json.createObjectNode().put("Account", username).put("Password", password).toString();
        // fungsi login ada di sld.svc (layanan yang dipakai Control Center), satu folder dengan sld0100.svc
        Response res = send("POST", baseUrl.replaceAll("/[^/]+$", "") + "/sld.svc/" + fn, body);
        boolean ok = res.status < 300 && !res.body.isEmpty() && json.readTree(res.body).path("d").path(fn).asBoolean(false);
        if (!ok || res.cookies == null)
            throw new IOException("Login License Server gagal (HTTP " + res.status + "). Cek sap.sld.username / sap.sld.password.");
        cookies = res.cookies;
    }

    private static class Response {
        int status;
        String body, cookies;
    }

    private Response send(String method, String url, String body) throws IOException {
        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        if (trustAllCerts && con instanceof HttpsURLConnection) { // SLD umumnya pakai sertifikat self-signed
            ((HttpsURLConnection) con).setSSLSocketFactory(trustAll());
            ((HttpsURLConnection) con).setHostnameVerifier((host, session) -> true);
        }
        con.setConnectTimeout(15_000);
        con.setReadTimeout(30_000);
        con.setRequestMethod(method);
        con.setRequestProperty("Accept", "application/json");
        if (cookies != null) con.setRequestProperty("Cookie", cookies);
        if (body != null) {
            con.setDoOutput(true);
            con.setRequestProperty("Content-Type", "application/json");
            con.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
        }
        try {
            Response r = new Response();
            r.status = con.getResponseCode();
            InputStream in = r.status >= 400 ? con.getErrorStream() : con.getInputStream();
            r.body = in == null ? "" : StreamUtils.copyToString(in, StandardCharsets.UTF_8);
            // simpan cookie sesi (JSESSIONID) untuk request berikutnya
            List<String> set = con.getHeaderFields().get("Set-Cookie");
            if (set != null && !set.isEmpty()) {
                StringBuilder sb = new StringBuilder();
                for (String c : set) sb.append(sb.length() == 0 ? "" : "; ").append(c.split(";", 2)[0]);
                r.cookies = sb.toString();
            }
            return r;
        } finally {
            con.disconnect();
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
