package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Pattern;

/**
 * Count Document: menghitung dokumen SAP yang DIBUAT per objek, user, dan tanggal (bukan alat BI, bukan ukuran kinerja).
 * <ul>
 *   <li>GET /api/countdoc/companies  company yang boleh dipilih (schema aktif + whitelist countdoc.schemas)</li>
 *   <li>GET /api/countdoc/meta       manifest objek (classpath:countdoc/objects.json)</li>
 *   <li>GET /api/countdoc/data?company=&amp;from=&amp;to=&amp;objects=   hasil ringkas per objek, satu query per objek</li>
 * </ul>
 * Hanya SELECT: SQL dari berkas classpath:countdoc/sql/*.sql (SENGAJA bukan di resources/sql yang dijalankan SectionController tanpa gerbang),
 * nilai lewat parameter ?, objek lewat whitelist manifest. Koneksi lewat DriverManager (di luar pool Hikari yang hanya 2 koneksi), read-only.
 * Gerbang: countdoc.enabled harus true (default MATI) dan Setup harus terbuka (SetupAccessController).
 */
@RestController
@RequestMapping("/api/countdoc")
public class CountDocController {
    private static final Logger log = LoggerFactory.getLogger(CountDocController.class);
    private static final Logger accessLog = LoggerFactory.getLogger("countdoc.access");
    private static final Pattern SCHEMA = Pattern.compile("[A-Za-z0-9_]{1,127}");
    private static final int MAX_DAYS = 400;
    /** Satu kumpulan pekerja bersama (2 thread): query semua request antre, tidak pernah lebih dari 2 query berjalan. */
    private static final ExecutorService POOL = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "countdoc-query");
        t.setDaemon(true);
        return t;
    });

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final SetupAccessController access;
    private final String dsUrl, dsUser, dsPass;
    private final boolean enabled;
    private final List<String> extraSchemas;
    private final int queryTimeout, maxRows;

    private volatile List<Obj> manifest;

    /** Satu objek di manifest beserta SQL-nya (sudah divalidasi hanya SELECT dan tepat 2 parameter). */
    private static final class Obj {
        String id, label, group, role, dateKind, source;
        boolean approval;
        String sql;
    }

    private static final class Row {
        final int user;
        final String date, status;
        final long counted;
        Row(int user, String date, long counted, String status) { this.user = user; this.date = date; this.counted = counted; this.status = status; }
    }

    private static final class Result {
        final List<Row> rows = new ArrayList<>();
        String error; // "timeout" | "gagal"
        String code;
        boolean truncated;
    }

    public CountDocController(JdbcTemplate jdbc, ObjectMapper json, SetupAccessController access,
                              @Value("${spring.datasource.url}") String dsUrl,
                              @Value("${spring.datasource.username}") String dsUser,
                              @Value("${spring.datasource.password}") String dsPass,
                              @Value("${countdoc.enabled:false}") boolean enabled,
                              // whitelist company lain (nama schema, dipisah koma); kosong = hanya schema aktif
                              @Value("${countdoc.schemas:}") String schemas,
                              @Value("${countdoc.query-timeout-seconds:60}") int queryTimeout,
                              @Value("${countdoc.max-rows:200000}") int maxRows) {
        this.jdbc = jdbc;
        this.json = json;
        this.access = access;
        this.dsUrl = dsUrl;
        this.dsUser = dsUser;
        this.dsPass = dsPass;
        this.enabled = enabled;
        this.queryTimeout = queryTimeout;
        this.maxRows = maxRows;
        List<String> l = new ArrayList<>();
        for (String s : schemas.split(",")) if (!s.trim().isEmpty()) l.add(s.trim());
        this.extraSchemas = l;
    }

    // Gerbang semua endpoint: fitur harus dinyalakan eksplisit (tolak sebagai default), lalu sesi Setup harus terbuka.
    @ModelAttribute
    public void gate(HttpServletRequest req) {
        if (!enabled)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Count Document belum diaktifkan. Set countdoc.enabled=true di application.properties lalu jalankan ulang aplikasi.");
        access.require(req);
    }

    // pesan validasi ke browser sebagai {message}; kesalahan tak terduga: pesan generik + kode korelasi (detail hanya di log)
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> error(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatus()).cacheControl(CacheControl.noStore()).body(Collections.singletonMap("message", e.getReason()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> unexpected(Exception e) {
        String code = newCode();
        log.error("[countdoc:{}] kesalahan tak terduga", code, e);
        Map<String, String> body = new LinkedHashMap<>();
        body.put("message", "Terjadi kesalahan di server. Hubungi administrator dan sebutkan kode ini.");
        body.put("code", code);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).cacheControl(CacheControl.noStore()).body(body);
    }

    private static String newCode() {
        return Long.toString(System.currentTimeMillis() % 1000000000L, 36).toUpperCase() + Integer.toString(ThreadLocalRandom.current().nextInt(36 * 36), 36).toUpperCase();
    }

    // ---------- manifest ----------
    private List<Obj> manifest() throws IOException {
        List<Obj> m = manifest;
        if (m != null) return m;
        synchronized (this) {
            if (manifest != null) return manifest;
            List<Obj> out = new ArrayList<>();
            Set<String> ids = new HashSet<>();
            try (InputStream in = new ClassPathResource("countdoc/objects.json").getInputStream()) {
                for (JsonNode n : json.readTree(in).path("objects")) {
                    Obj o = new Obj();
                    o.id = n.path("id").asText();
                    o.label = n.path("label").asText(o.id);
                    o.group = n.path("group").asText();
                    o.role = n.path("role").asText();
                    o.dateKind = n.path("dateKind").asText();
                    o.source = n.path("source").asText();
                    o.approval = n.path("approval").asBoolean();
                    if (o.id.isEmpty() || !ids.add(o.id)) throw new IllegalStateException("ID objek kosong/ganda di manifest: " + o.id);
                    // buang baris komentar: driver HANA di Java 8 menganggap query yang diawali komentar bukan SELECT
                    String sql = StreamUtils.copyToString(new ClassPathResource("countdoc/sql/" + n.path("file").asText()).getInputStream(), StandardCharsets.UTF_8)
                            .replaceAll("(?m)^\\s*--.*$", "").trim();
                    if (!sql.regionMatches(true, 0, "SELECT", 0, 6)) throw new IllegalStateException("SQL bukan SELECT: " + o.id);
                    if (sql.indexOf(';') >= 0) throw new IllegalStateException("SQL tidak boleh memuat ';': " + o.id);
                    if (sql.chars().filter(c -> c == '?').count() != 2) throw new IllegalStateException("SQL harus punya tepat 2 parameter: " + o.id);
                    o.sql = sql;
                    out.add(o);
                }
            }
            manifest = Collections.unmodifiableList(out);
            return manifest;
        }
    }

    @GetMapping("/meta")
    public ResponseEntity<Map<String, Object>> meta() throws IOException {
        List<Map<String, Object>> objs = new ArrayList<>();
        for (Obj o : manifest()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", o.id);
            m.put("label", o.label);
            m.put("group", o.group);
            m.put("role", o.role);
            m.put("dateKind", o.dateKind);
            m.put("approval", o.approval);
            m.put("source", o.source);
            objs.add(m);
        }
        return noStore(Collections.singletonMap("objects", objs));
    }

    // ---------- company ----------
    private String activeSchema() {
        return jdbc.queryForObject("SELECT CURRENT_SCHEMA FROM DUMMY", String.class);
    }

    /** Schema yang boleh dipilih: schema aktif + whitelist countdoc.schemas; keduanya divalidasi regex dan harus punya OADM. */
    private List<String> allowedSchemas() {
        List<String> out = new ArrayList<>();
        List<String> cand = new ArrayList<>();
        cand.add(activeSchema());
        cand.addAll(extraSchemas);
        for (String s : cand) {
            if (s == null || !SCHEMA.matcher(s).matches() || out.contains(s)) continue;
            Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM SYS.TABLES WHERE SCHEMA_NAME = ? AND TABLE_NAME = 'OADM'", Integer.class, s);
            if (n != null && n > 0) out.add(s);
        }
        return out;
    }

    private String companyName(String schema) {
        try {
            return jdbc.queryForObject("SELECT \"CompnyName\" FROM \"" + schema + "\".OADM", String.class);
        } catch (DataAccessException e) {
            log.warn("[countdoc] nama company {} gagal dibaca: {}", schema, e.getMostSpecificCause().getMessage());
            return null;
        }
    }

    @GetMapping("/companies")
    public ResponseEntity<Map<String, Object>> companies() {
        String active = activeSchema();
        List<Map<String, Object>> list = new ArrayList<>();
        for (String s : allowedSchemas()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("schema", s);
            m.put("name", companyName(s));
            m.put("active", s.equals(active));
            list.add(m);
        }
        return noStore(Collections.singletonMap("companies", list));
    }

    // ---------- data ----------
    private Connection open(String schema) throws SQLException {
        String url = dsUrl.matches("(?i).*[?&]currentschema=.*")
                ? dsUrl.replaceAll("(?i)([?&]currentschema=)[^&]*", "$1" + schema)
                : dsUrl + (dsUrl.contains("?") ? "&" : "?") + "currentschema=" + schema;
        Connection con = DriverManager.getConnection(url, dsUser, dsPass);
        con.setReadOnly(true);
        return con;
    }

    private Result runOne(Obj o, String schema, LocalDate from, LocalDate to, java.util.concurrent.atomic.AtomicInteger budget,
                          Map<String, Integer> userIdx, List<String[]> users) {
        Result r = new Result();
        try (Connection con = open(schema); PreparedStatement ps = con.prepareStatement(o.sql)) {
            ps.setQueryTimeout(queryTimeout);
            ps.setDate(1, java.sql.Date.valueOf(from));
            ps.setDate(2, java.sql.Date.valueOf(to));
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    if (budget.decrementAndGet() < 0) { r.truncated = true; break; }
                    String code = rs.getString(1), name = rs.getString(2);
                    java.sql.Date d = rs.getDate(3);
                    String date = null;
                    if (d != null) {
                        LocalDate ld = d.toLocalDate();
                        if (ld.getYear() > 1900) date = ld.toString(); // 1900 = "tanggal kosong" di SAP: diperlakukan tanpa tanggal
                    }
                    String status = rs.getString(5);
                    String key = (code == null ? "\u0000" : code) + "\u0001" + (name == null ? "\u0000" : name);
                    int ui;
                    synchronized (userIdx) {
                        Integer ix = userIdx.get(key);
                        if (ix == null) { ix = users.size(); userIdx.put(key, ix); users.add(new String[]{code, name}); }
                        ui = ix;
                    }
                    r.rows.add(new Row(ui, date, rs.getLong(4), status == null ? "" : status.trim()));
                }
            }
        } catch (SQLException e) {
            r.code = newCode();
            r.error = e instanceof SQLTimeoutException ? "timeout" : "gagal";
            r.rows.clear();
            log.warn("[countdoc:{}] objek {} {}: {} (sqlstate {}, code {})", r.code, o.id, r.error, e.getMessage(), e.getSQLState(), e.getErrorCode());
        }
        return r;
    }

    @GetMapping("/data")
    public ResponseEntity<Map<String, Object>> data(@RequestParam(required = false) String company,
                                                    @RequestParam(required = false) String from,
                                                    @RequestParam(required = false) String to,
                                                    @RequestParam(required = false) String objects,
                                                    HttpServletRequest req) throws IOException {
        List<String> allowed = allowedSchemas();
        String schema = company == null || company.isEmpty() ? activeSchema() : company;
        if (!SCHEMA.matcher(schema).matches() || !allowed.contains(schema))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Company tidak diizinkan.");
        LocalDate f, t;
        try {
            LocalDate today = LocalDate.now();
            f = from == null || from.isEmpty() ? today.withDayOfMonth(1) : LocalDate.parse(from);
            t = to == null || to.isEmpty() ? today : LocalDate.parse(to);
        } catch (DateTimeParseException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Format tanggal harus yyyy-MM-dd.");
        }
        if (f.isAfter(t)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tanggal awal harus sebelum atau sama dengan tanggal akhir.");
        if (ChronoUnit.DAYS.between(f, t) + 1 > MAX_DAYS) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rentang maksimal " + MAX_DAYS + " hari.");

        List<Obj> all = manifest(), pick = new ArrayList<>();
        if (objects == null || objects.trim().isEmpty()) pick.addAll(all);
        else {
            Set<String> want = new LinkedHashSet<>();
            for (String s : objects.split(",")) if (!s.trim().isEmpty()) want.add(s.trim());
            for (String id : want) {
                Obj found = null;
                for (Obj o : all) if (o.id.equals(id)) found = o;
                if (found == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Objek tidak dikenal: " + id);
                pick.add(found);
            }
        }
        accessLog.info("{} ip={} company={} range={}..{} objects={}", LocalDateTime.now().withNano(0), req.getRemoteAddr(), schema, f, t, pick.size());

        java.util.concurrent.atomic.AtomicInteger budget = new java.util.concurrent.atomic.AtomicInteger(maxRows);
        Map<String, Integer> userIdx = new HashMap<>();
        List<String[]> users = new ArrayList<>();
        List<Future<Result>> futures = new ArrayList<>();
        final String sch = schema;
        final LocalDate ff = f, tt = t;
        for (Obj o : pick) futures.add(POOL.submit(() -> runOne(o, sch, ff, tt, budget, userIdx, users)));

        List<Object> rows = new ArrayList<>(), errors = new ArrayList<>(), ids = new ArrayList<>();
        boolean truncated = false;
        for (int i = 0; i < pick.size(); i++) {
            Obj o = pick.get(i);
            ids.add(o.id);
            Result r;
            try {
                r = futures.get(i).get();
            } catch (InterruptedException | ExecutionException e) {
                r = new Result();
                r.error = "gagal";
                r.code = newCode();
                log.warn("[countdoc:{}] objek {} gagal dijalankan", r.code, o.id, e);
            }
            if (r.error != null) {
                Map<String, Object> er = new LinkedHashMap<>();
                er.put("object", o.id);
                er.put("reason", r.error);
                er.put("code", r.code);
                errors.add(er);
            }
            truncated |= r.truncated;
            for (Row row : r.rows) rows.add(Arrays.asList(i, row.user, row.date, row.counted, row.status));
        }
        List<Object> us = new ArrayList<>();
        for (String[] u : users) us.add(Arrays.asList(u[0], u[1]));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("company", schema);
        out.put("companyName", companyName(schema));
        out.put("from", f.toString());
        out.put("to", t.toString());
        out.put("generatedAt", LocalDateTime.now().withNano(0).toString());
        out.put("truncated", truncated);
        out.put("errors", errors);
        out.put("objects", ids);
        out.put("users", us);
        out.put("rows", rows);
        return noStore(out);
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
