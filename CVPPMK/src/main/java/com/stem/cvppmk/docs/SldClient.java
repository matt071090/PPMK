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
import java.util.Base64;

/**
 * Client baca OData License Server / System Landscape Directory (SLD) SAP B1, mis. https://host:40000/sld/sld0100.svc.
 * Dipakai untuk jumlah license per tipe (LicenseModules) dan file license (LicenseFiles); data ini tidak ada di database company.
 * Konfigurasi di ./application.properties: sap.sld.url, sap.sld.username, sap.sld.password. Hanya GET.
 */
@Component
public class SldClient {
    private final String baseUrl, username, password;
    private final boolean trustAllCerts;
    private final ObjectMapper json;
    private SSLSocketFactory trustAllFactory;

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
    public JsonNode list(String entitySet) throws IOException {
        if (!configured()) throw new IllegalStateException("License Server belum dikonfigurasi (sap.sld.* di application.properties)");
        HttpURLConnection con = (HttpURLConnection) new URL(baseUrl + "/" + entitySet + "?$format=json").openConnection();
        if (trustAllCerts && con instanceof HttpsURLConnection) { // SLD umumnya pakai sertifikat self-signed
            ((HttpsURLConnection) con).setSSLSocketFactory(trustAll());
            ((HttpsURLConnection) con).setHostnameVerifier((host, session) -> true);
        }
        con.setConnectTimeout(15_000);
        con.setReadTimeout(30_000);
        con.setRequestProperty("Accept", "application/json");
        con.setRequestProperty("Authorization", "Basic " + Base64.getEncoder()
                .encodeToString((username + ":" + password).getBytes(StandardCharsets.UTF_8)));
        try {
            int status = con.getResponseCode();
            InputStream in = status >= 400 ? con.getErrorStream() : con.getInputStream();
            String body = in == null ? "" : StreamUtils.copyToString(in, StandardCharsets.UTF_8);
            if (status == 401) throw new IOException("License Server menolak login (HTTP 401). Cek sap.sld.username / sap.sld.password.");
            if (status >= 400) throw new IOException("License Server HTTP " + status + ": " + body.replaceAll("\\s+", " ").trim());
            JsonNode d = json.readTree(body).path("d");
            return d.has("results") ? d.path("results") : d;
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
