package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;
import java.io.IOException;
import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.cert.X509Certificate;
import java.time.Duration;
import java.util.Map;

/**
 * Client Service Layer SAP B1, khusus baca. Login sekali, session (cookie B1SESSION) dipakai ulang,
 * login ulang otomatis kalau session habis (HTTP 401).
 * Konfigurasi di ./application.properties: sap.sl.url, sap.sl.company-db, sap.sl.username, sap.sl.password.
 */
@Component
public class ServiceLayerClient {
    private static final Logger log = LoggerFactory.getLogger(ServiceLayerClient.class);

    private final String baseUrl, companyDb, username, password;
    private final boolean trustAllCerts;
    private final ObjectMapper json;
    private HttpClient http;

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
    public JsonNode post(String path) throws IOException, InterruptedException {
        return call("POST", path, null, true);
    }

    /** POST dengan body JSON, untuk action baca yang butuh parameter (mis. CompanyService_GetPeriod). */
    public JsonNode post(String path, Object body) throws IOException, InterruptedException {
        return call("POST", path, json.writeValueAsString(body), true);
    }

    public JsonNode get(String path) throws IOException, InterruptedException {
        return call("GET", path, null, true);
    }

    private synchronized JsonNode call(String method, String path, String body, boolean retry)
            throws IOException, InterruptedException {
        if (!configured()) throw new IllegalStateException("Service Layer belum dikonfigurasi (sap.sl.* di application.properties)");
        if (http == null) login();
        HttpResponse<String> res = http.send(request(method, path, body), HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() == 401 && retry) {
            log.debug("Session Service Layer habis, login ulang");
            login();
            return call(method, path, body, false);
        }
        if (res.statusCode() >= 400) throw new IOException("Service Layer " + res.statusCode() + ": " + errorMessage(res.body()));
        return res.body().isBlank() ? json.createObjectNode() : json.readTree(res.body());
    }

    private void login() throws IOException, InterruptedException {
        http = newClient();
        String body = json.writeValueAsString(Map.of("CompanyDB", companyDb, "UserName", username, "Password", password));
        HttpResponse<String> res = http.send(request("POST", "Login", body), HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() >= 400) {
            http = null;
            throw new IOException("Login Service Layer gagal (" + res.statusCode() + "): " + errorMessage(res.body()));
        }
        log.info("Login Service Layer {} sebagai {} berhasil", companyDb, username);
    }

    private HttpRequest request(String method, String path, String body) {
        return HttpRequest.newBuilder(URI.create(baseUrl + "/" + path))
                .timeout(Duration.ofSeconds(60))
                .header("Content-Type", "application/json")
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body))
                .build();
    }

    private String errorMessage(String body) {
        try {
            JsonNode msg = json.readTree(body).path("error").path("message");
            return msg.isTextual() ? msg.asText() : msg.path("value").asText(body);
        } catch (IOException e) {
            return body;
        }
    }

    private HttpClient newClient() {
        HttpClient.Builder b = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(15))
                .cookieHandler(new CookieManager());
        if (trustAllCerts) b.sslContext(trustAll()); // Service Layer umumnya pakai sertifikat self-signed
        return b.build();
    }

    private static SSLContext trustAll() {
        // Hostname verification ikut dimatikan; property ini hanya dibaca HttpClient JDK.
        System.setProperty("jdk.internal.httpclient.disableHostnameVerification", "true");
        try {
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, new TrustManager[]{new X509TrustManager() {
                public void checkClientTrusted(X509Certificate[] c, String a) { }
                public void checkServerTrusted(X509Certificate[] c, String a) { }
                public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
            }}, null);
            return ctx;
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
