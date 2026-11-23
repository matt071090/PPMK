package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Setup / cut off: bandingkan data setup dari DB sumber dengan DB tujuan, lalu upload ke tujuan lewat Service Layer.
 * <ul>
 *   <li>GET  /api/setup/steps            daftar langkah (classpath:setup/steps.json)</li>
 *   <li>GET  /api/setup/sources          DB sumber: company di server yang sama + koneksi server lain (setup.sources)</li>
 *   <li>GET  /api/setup/{step}?src=...   hasil query langkah di tujuan dan (kalau src diisi) di sumber</li>
 *   <li>GET  /api/setup/{step}/sql       teks query langkah (untuk review mapping kolom DB -> field Service Layer)</li>
 *   <li>POST /api/setup/{step}/upload    tulis ke tujuan lewat Service Layer, hanya kalau docs.edit.enabled</li>
 * </ul>
 * Sumber hanya dibaca (koneksi JDBC terpisah, read-only). Tujuan hanya ditulis lewat Service Layer, tidak pernah lewat SQL.
 * src: "same:SCHEMA" (server yang sama, user & password datasource) atau "conn:NAMA" (setup.source.NAMA.url/username/password).
 * DB sumber di server yang sama dideklarasikan di setup.source-dbs (cukup nama DB-nya, dipisah koma).
 */
@RestController
@RequestMapping("/api/setup")
public class SetupController {
    private static final Logger log = LoggerFactory.getLogger(SetupController.class);
    private static final Pattern SCHEMA = Pattern.compile("[A-Za-z0-9_]{1,127}");

    private final JdbcTemplate jdbc;
    private final ServiceLayerClient sl;
    private final Environment env;
    private final ObjectMapper json;
    private final SetupAccessController access;
    private final String dsUrl, dsUser, dsPass, schemaFilter;
    private final List<String> sourceDbs, otherSources;

    public SetupController(JdbcTemplate jdbc, ServiceLayerClient sl, Environment env, ObjectMapper json,
                           SetupAccessController access,
                           @Value("${spring.datasource.url}") String dsUrl,
                           @Value("${spring.datasource.username}") String dsUser,
                           @Value("${spring.datasource.password}") String dsPass,
                           // DB sumber di server yang sama: daftar nama DB (schema), login memakai user & password datasource
                           @Value("${setup.source-dbs:}") String sourceDbs,
                           // dipakai kalau setup.source-dbs kosong: regex nama schema; kosong = nama schema tujuan + apa saja
                           @Value("${setup.same-server.schema-filter:}") String schemaFilter,
                           @Value("${setup.sources:}") String otherSources) {
        this.jdbc = jdbc;
        this.sl = sl;
        this.env = env;
        this.json = json;
        this.access = access;
        this.dsUrl = dsUrl;
        this.dsUser = dsUser;
        this.dsPass = dsPass;
        this.schemaFilter = schemaFilter;
        this.sourceDbs = csv(sourceDbs);
        this.otherSources = csv(otherSources);
    }

    private static List<String> csv(String s) {
        List<String> out = new ArrayList<>();
        for (String n : s.split(",")) if (!n.trim().isEmpty()) out.add(n.trim());
        return out;
    }

    // Semua endpoint setup (termasuk baca DB sumber) hanya untuk sesi yang Setup-nya terbuka: mode debug, atau war
    // setelah password docs.setup.password benar (SetupAccessController). @ModelAttribute jalan sebelum setiap handler di sini.
    @ModelAttribute
    public void requireSetupAccess(javax.servlet.http.HttpServletRequest req) {
        access.require(req);
    }

    // pesan error dikirim ke browser sebagai {message} (default Spring Boot menyembunyikan pesan error)
    @ExceptionHandler(ResponseStatusException.class)
    public org.springframework.http.ResponseEntity<Map<String, String>> error(ResponseStatusException e) {
        return org.springframework.http.ResponseEntity.status(e.getStatus()).body(Collections.singletonMap("message", e.getReason()));
    }

    // ---------- langkah ----------
    @GetMapping("/steps")
    public JsonNode steps() throws IOException {
        try (InputStream in = new ClassPathResource("setup/steps.json").getInputStream()) {
            return json.readTree(in);
        }
    }

    private JsonNode step(String id) throws IOException {
        for (JsonNode s : steps()) if (s.path("id").asText().equals(id)) return s;
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Langkah setup '" + id + "' tidak dikenal");
    }

    /** Langkah "data" (dan "ref", referensi tersembunyi) punya query; langkah "setting" dicek manual di halaman dokumentasi. */
    private static void requireData(JsonNode step) {
        String kind = step.path("kind").asText("data");
        if (!"data".equals(kind) && !"ref".equals(kind))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Langkah '" + step.path("id").asText() + "' adalah setting, dicek manual");
    }

    @GetMapping(value = "/{id:[a-z0-9-]+}/sql", produces = "text/plain;charset=UTF-8")
    public String sql(@PathVariable String id) throws IOException {
        requireData(step(id));
        return StreamUtils.copyToString(new ClassPathResource("setup/sql/" + id + ".sql").getInputStream(), StandardCharsets.UTF_8);
    }

    private String stepSql(String id) throws IOException {
        ClassPathResource r = new ClassPathResource("setup/sql/" + id + ".sql");
        // baris komentar dibuang: driver HANA di Java 8 menganggap query yang diawali komentar bukan SELECT
        return StreamUtils.copyToString(r.getInputStream(), StandardCharsets.UTF_8).replaceAll("(?m)^\\s*--.*$", "").trim();
    }

    // ---------- sumber ----------
    private String targetSchema() {
        return jdbc.queryForObject("SELECT CURRENT_SCHEMA FROM DUMMY", String.class);
    }

    /**
     * Company SAP B1 di server yang sama yang boleh jadi sumber: yang dideklarasikan di setup.source-dbs (urutan dipertahankan),
     * atau kalau kosong, yang cocok dengan setup.same-server.schema-filter. Hanya schema yang benar-benar company DB (punya OADM),
     * dan DB tujuan sendiri tidak pernah ikut.
     */
    private List<String> sameServerSchemas(String target) {
        List<String> companies = jdbc.queryForList("SELECT SCHEMA_NAME FROM SYS.TABLES WHERE TABLE_NAME = 'OADM' ORDER BY SCHEMA_NAME", String.class);
        List<String> out = new ArrayList<>();
        if (!sourceDbs.isEmpty()) {
            for (String s : sourceDbs) if (!s.equals(target) && companies.contains(s)) out.add(s);
            return out;
        }
        Pattern filter = Pattern.compile(schemaFilter.isEmpty() ? Pattern.quote(target) + ".*" : schemaFilter);
        for (String s : companies) if (!s.equals(target) && filter.matcher(s).matches()) out.add(s);
        return out;
    }

    /** DB yang dideklarasikan tapi tidak ditemukan sebagai company DB di server ini (salah ketik / belum ada). */
    private List<String> missingSourceDbs(String target) {
        List<String> found = sameServerSchemas(target), out = new ArrayList<>();
        for (String s : sourceDbs) if (!found.contains(s) && !s.equals(target)) out.add(s);
        return out;
    }

    @GetMapping("/sources")
    public Map<String, Object> sources() {
        String target = targetSchema();
        List<Map<String, Object>> same = new ArrayList<>();
        for (String s : sameServerSchemas(target)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", "same:" + s);
            m.put("schema", s);
            try {
                m.put("company", jdbc.queryForObject("SELECT \"CompnyName\" FROM \"" + s + "\".OADM", String.class));
            } catch (DataAccessException e) {
                m.put("error", e.getMostSpecificCause().getMessage());
            }
            same.add(m);
        }
        List<Map<String, Object>> others = new ArrayList<>();
        for (String n : otherSources) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", "conn:" + n);
            m.put("name", n);
            // host & schema saja, user/password tidak pernah dikirim ke browser
            m.put("url", env.getProperty("setup.source." + n + ".url", "").replaceAll("^jdbc:sap://", ""));
            others.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("target", target);
        out.put("declared", !sourceDbs.isEmpty());
        out.put("missing", missingSourceDbs(target));
        out.put("same", same);
        out.put("others", others);
        return out;
    }

    /** Koneksi JDBC ke DB sumber, read-only. Dicek dulu terhadap daftar yang diizinkan. */
    private Connection openSource(String src) throws SQLException {
        Connection con;
        if (src.startsWith("same:")) {
            String schema = src.substring(5);
            if (!SCHEMA.matcher(schema).matches() || !sameServerSchemas(targetSchema()).contains(schema))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Schema sumber '" + schema + "' tidak diizinkan");
            String url = dsUrl.matches("(?i).*[?&]currentschema=.*")
                    ? dsUrl.replaceAll("(?i)([?&]currentschema=)[^&]*", "$1" + schema)
                    : dsUrl + (dsUrl.contains("?") ? "&" : "?") + "currentschema=" + schema;
            con = DriverManager.getConnection(url, dsUser, dsPass);
        } else if (src.startsWith("conn:") && otherSources.contains(src.substring(5))) {
            String p = "setup.source." + src.substring(5) + ".";
            con = DriverManager.getConnection(env.getRequiredProperty(p + "url"), env.getProperty(p + "username"), env.getProperty(p + "password"));
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sumber '" + src + "' tidak dikenal");
        }
        con.setReadOnly(true);
        return con;
    }

    // ---------- data langkah ----------
    @GetMapping("/{id:[a-z0-9-]+}")
    public Map<String, Object> data(@PathVariable String id, @RequestParam(required = false) String src) throws IOException {
        JsonNode step = step(id);
        requireData(step);
        String sql = stepSql(id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("generatedAt", LocalDateTime.now().withNano(0).toString());
        out.put("target", runTarget(sql));
        if (src != null && !src.isEmpty()) {
            try (Connection con = openSource(src)) {
                out.put("source", run(con, sql));
            } catch (SQLException e) {
                log.warn("[setup:{}] sumber {} gagal: {}", id, src, e.getMessage());
                out.put("source", Collections.singletonMap("error", e.getMessage()));
            }
        }
        // akun posting di tujuan, untuk cek referensi akun sebelum upload
        if (step.has("accounts"))
            out.put("targetAccounts", jdbc.queryForList("SELECT \"AcctCode\" FROM OACT WHERE \"Postable\" = 'Y'", String.class));
        return out;
    }

    private Map<String, Object> runTarget(String sql) {
        try {
            return jdbc.execute((ConnectionCallback<Map<String, Object>>) con -> run(con, sql));
        } catch (DataAccessException e) {
            return Collections.singletonMap("error", e.getMostSpecificCause().getMessage());
        }
    }

    private static Map<String, Object> run(Connection con, String sql) throws SQLException {
        long start = System.currentTimeMillis();
        try (Statement st = con.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            ResultSetMetaData md = rs.getMetaData();
            List<String> columns = new ArrayList<>();
            for (int i = 1; i <= md.getColumnCount(); i++) columns.add(md.getColumnLabel(i));
            List<List<String>> rows = new ArrayList<>();
            while (rs.next()) {
                List<String> row = new ArrayList<>(columns.size());
                for (int i = 1; i <= columns.size(); i++) row.add(rs.getString(i));
                rows.add(row);
            }
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("columns", columns);
            m.put("rows", rows);
            m.put("ms", System.currentTimeMillis() - start);
            return m;
        }
    }

    // ---------- upload ----------
    /**
     * Body: {"rows": [{"action": "create" | "update", "key": "<key tujuan, untuk update>", "data": {field SL: nilai}}]}.
     * Dikirim satu per satu supaya baris yang gagal tidak membatalkan baris lain. Hasil: [{ok, message}] urut sama dengan input.
     */
    @PostMapping("/{id:[a-z0-9-]+}/upload")
    public Map<String, Object> upload(@PathVariable String id, @RequestBody JsonNode body) throws IOException {
        JsonNode step = step(id);
        requireData(step);
        String entity = step.path("entity").asText();
        if (!step.path("upload").asBoolean(true) || entity.isEmpty())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Langkah '" + id + "' belum bisa di-upload (bandingkan & export saja)");
        boolean keyString = step.path("keyString").asBoolean(false);
        // langkah lewat aksi service (mis. SeriesService_AddSeries) dan bukan entity: body dibungkus, key ikut di dalam body
        JsonNode svc = step.path("action");
        List<Map<String, Object>> results = new ArrayList<>();
        for (JsonNode r : body.path("rows")) {
            Map<String, Object> res = new LinkedHashMap<>();
            String action = r.path("action").asText();
            try {
                if (svc.isObject() && ("create".equals(action) || "update".equals(action))) {
                    ObjectNode data = r.path("data").isObject() ? ((ObjectNode) r.path("data")).deepCopy() : json.createObjectNode();
                    if ("update".equals(action)) data.put(step.path("keyField").asText(), r.path("key").asLong());
                    JsonNode out = sl.write("POST", svc.path(action).asText(), json.createObjectNode().set(svc.path("wrap").asText(), data));
                    if ("create".equals(action)) res.put("key", out.path(step.path("keyField").asText()).asText(null));
                } else if ("create".equals(action)) {
                    JsonNode created = sl.write("POST", entity, r.path("data"));
                    res.put("key", created.path(step.path("keyField").asText()).asText(null));
                } else if ("update".equals(action)) {
                    String key = r.path("key").asText();
                    // key teks (mis. kode akun 101070501) selalu dikutip walaupun isinya angka
                    if (keyString || !key.matches("-?\\d+")) key = "'" + key.replace("'", "''") + "'";
                    sl.write("PATCH", entity + "(" + key + ")", r.path("data"));
                } else {
                    throw new IllegalArgumentException("Aksi '" + action + "' tidak dikenal");
                }
                res.put("ok", true);
            } catch (Exception e) {
                res.put("ok", false);
                res.put("message", e.getMessage());
            }
            results.add(res);
        }
        log.info("[setup:{}] upload {} baris ke {}, {} gagal", id, results.size(), entity,
                results.stream().filter(m -> !Boolean.TRUE.equals(m.get("ok"))).count());
        return Collections.singletonMap("results", results);
    }
}
