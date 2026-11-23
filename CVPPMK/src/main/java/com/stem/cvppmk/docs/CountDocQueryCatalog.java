package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Daftar query bawaan Count Document (Tahap A "Daftar Query"): satu query per objek di manifest classpath:countdoc/objects.json.
 * Klien hanya boleh menyebut id; SQL SELALU dari berkas classpath (tidak pernah dari klien). Setiap SQL divalidasi:
 * diawali SELECT, tanpa ';', tepat 2 parameter '?' (tanggal awal, tanggal akhir). Aturan sama dengan CountDocController.
 */
@Component
public class CountDocQueryCatalog {
    /** Id manifest boleh berisi spasi/tanda kurung (mis. "Closed_PO (tgl diubah)"), tanpa karakter kontrol; pencarian hanya lewat peta manifest. */
    static final Pattern ID = Pattern.compile("[^\\p{Cntrl}]{1,100}");

    /** Satu query bawaan. sql = untuk dieksekusi (tanda ?), displaySql = untuk ditampilkan (:from :to). */
    public static final class Query {
        public final String id, label, group, role, dateKind, source, sql, displaySql;
        public final boolean approval;

        Query(String id, String label, String group, String role, String dateKind, String source, boolean approval, String sql) {
            this.id = id; this.label = label; this.group = group; this.role = role; this.dateKind = dateKind; this.source = source;
            this.approval = approval; this.sql = sql; this.displaySql = display(sql);
        }
    }

    private final ObjectMapper json;
    private final String base;
    private volatile List<Query> queries;
    private volatile Map<String, Query> byId;

    @Autowired
    public CountDocQueryCatalog(ObjectMapper json) { this(json, "countdoc/"); }

    /** Dipakai tes: base = folder classpath yang memuat objects.json dan sql/. */
    CountDocQueryCatalog(ObjectMapper json, String base) { this.json = json; this.base = base; }

    /** Buang komentar baris (driver HANA di Java 8 menganggap query berawalan komentar bukan SELECT) lalu validasi. */
    static String clean(String id, String raw) {
        String sql = raw.replaceAll("(?m)^\\s*--.*$", "").trim();
        if (!sql.regionMatches(true, 0, "SELECT", 0, 6)) throw new IllegalStateException("SQL bukan SELECT: " + id);
        if (sql.indexOf(';') >= 0) throw new IllegalStateException("SQL tidak boleh memuat ';': " + id);
        if (sql.chars().filter(c -> c == '?').count() != 2) throw new IllegalStateException("SQL harus punya tepat 2 parameter: " + id);
        return sql;
    }

    /** Tampilan baca-saja: parameter pertama jadi :from, kedua :to. */
    static String display(String sql) {
        int i = sql.indexOf('?');
        int j = sql.indexOf('?', i + 1);
        return sql.substring(0, i) + ":from" + sql.substring(i + 1, j) + ":to" + sql.substring(j + 1);
    }

    private void load() throws IOException {
        if (queries != null) return;
        synchronized (this) {
            if (queries != null) return;
            List<Query> out = new ArrayList<>();
            Map<String, Query> map = new LinkedHashMap<>();
            ClassLoader cl = CountDocQueryCatalog.class.getClassLoader();
            try (InputStream in = cl.getResourceAsStream(base + "objects.json")) {
                if (in == null) throw new IOException("Manifest tidak ditemukan: " + base + "objects.json");
                Set<String> ids = new HashSet<>();
                for (JsonNode n : json.readTree(in).path("objects")) {
                    String id = n.path("id").asText();
                    if (!ID.matcher(id).matches() || !ids.add(id)) throw new IllegalStateException("ID query kosong/ganda/tidak valid di manifest: " + id);
                    String file = n.path("file").asText();
                    if (!file.matches("[A-Za-z0-9_.-]+\\.sql")) throw new IllegalStateException("Nama berkas SQL tidak valid: " + id);
                    String raw;
                    try (InputStream s = cl.getResourceAsStream(base + "sql/" + file)) {
                        if (s == null) throw new IllegalStateException("Berkas SQL tidak ada: " + file);
                        ByteArrayOutputStream bo = new ByteArrayOutputStream();
                        byte[] buf = new byte[8192];
                        int r;
                        while ((r = s.read(buf)) > 0) bo.write(buf, 0, r);
                        raw = new String(bo.toByteArray(), StandardCharsets.UTF_8);
                    }
                    Query q = new Query(id, n.path("label").asText(id), n.path("group").asText(), n.path("role").asText(),
                            n.path("dateKind").asText(), n.path("source").asText(), n.path("approval").asBoolean(), clean(id, raw));
                    out.add(q);
                    map.put(id, q);
                }
            }
            byId = Collections.unmodifiableMap(map);
            queries = Collections.unmodifiableList(out);
        }
    }

    public List<Query> all() throws IOException { load(); return queries; }

    /** null bila id tidak valid atau tidak ada di manifest. */
    public Query find(String id) throws IOException {
        if (id == null || !ID.matcher(id).matches()) return null;
        load();
        return byId.get(id);
    }

    /** "timeout" | "tidak_tersedia" (HANA 259 tabel / 260 kolom tidak ada: UDT/UDF belum ada di DB ini) | "gagal". */
    public static String errorKind(SQLException e) {
        if (e instanceof SQLTimeoutException) return "timeout";
        return e.getErrorCode() == 259 || e.getErrorCode() == 260 ? "tidak_tersedia" : "gagal";
    }
}
