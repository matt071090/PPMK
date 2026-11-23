package com.stem.cvppmk.docs;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Types;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Count Document "Daftar Query": menjalankan SATU query (bawaan dari manifest, atau buatan pengguna) dan menyimpan status cek manual.
 * <ul>
 *   <li>GET  /api/countdoc/queries                 daftar query + SQL baca-saja (tanda :from :to) + konfigurasi query buatan</li>
 *   <li>POST /api/countdoc/query/run               {id, company, from, to} -> {columns, rows, truncated, ms} atau {error}</li>
 *   <li>GET  /api/countdoc/query-checks            status cek semua query</li>
 *   <li>PUT  /api/countdoc/query-checks/{id}       {rev, status, note}; rev lama = 409</li>
 * </ul>
 * Query BUATAN (Tahap B/C; MATI default, countdoc.custom.enabled=false; semua endpoint di bawah menolak 403 saat mati):
 * <ul>
 *   <li>POST   /api/countdoc/custom                  {name, group, sql, note} -> 201 item</li>
 *   <li>PUT    /api/countdoc/custom/{id}             {rev, name, group, sql, note}; rev lama = 409</li>
 *   <li>DELETE /api/countdoc/custom/{id}</li>
 *   <li>POST   /api/countdoc/custom/test             {sql, company, from, to}: jalankan draf tanpa menyimpan</li>
 *   <li>POST   /api/countdoc/custom/import/preview   berkas ekspor -> pratinjau per query (tidak menulis)</li>
 *   <li>POST   /api/countdoc/custom/import           {includeChecks, entries:[{action,name,group,sql,note,check}]}</li>
 *   <li>POST   /api/countdoc/query/run               juga menerima id query buatan (SQL diambil dari penyimpanan dan DIVALIDASI ULANG)</li>
 * </ul>
 * Setiap SQL buatan lewat CountDocSqlValidator (SELECT tunggal, :from/:to saja) sebelum dieksekusi, lalu gerbang yang sama dengan query bawaan.
 * Tidak ada token CSRF di proyek ini; endpoint tulis mewajibkan Content-Type application/json (form lintas-situs tidak bisa mengirimnya tanpa preflight CORS).
 * Gerbang sama dengan CountDocController: countdoc.enabled (default MATI) + SetupAccessController.require, company dari whitelist,
 * tanggal di-bind (?), koneksi read-only, timeout, batas baris, antrean terbatas (memakai POOL 2 thread bersama), error generik.
 */
@RestController
@RequestMapping("/api/countdoc")
public class CountDocQueryController {
    private static final Logger log = LoggerFactory.getLogger(CountDocQueryController.class);
    private static final Logger accessLog = LoggerFactory.getLogger("countdoc.access");
    /** Permintaan yang boleh menunggu/berjalan sekaligus (POOL hanya 2 thread); sisanya ditolak 429. */
    private static final int MAX_INFLIGHT = 6;
    static final int MAX_BODY = 128 * 1024, MAX_IMPORT_BODY = 1024 * 1024;
    private static final ObjectMapper BODY = new ObjectMapper().configure(JsonParser.Feature.STRICT_DUPLICATE_DETECTION, true);
    private static final List<String> FROM_TO = Collections.unmodifiableList(Arrays.asList("from", "to"));
    private static final Set<String> SAVE_FIELDS = new HashSet<>(Arrays.asList("rev", "name", "group", "sql", "note"));
    private static final Set<String> TEST_FIELDS = new HashSet<>(Arrays.asList("sql", "company", "from", "to"));
    private static final Set<String> IMPORT_FIELDS = new HashSet<>(Arrays.asList("includeChecks", "entries"));
    private final Semaphore inflight = new Semaphore(MAX_INFLIGHT);

    private final CountDocController base;
    private final CountDocQueryCatalog catalog;
    private final CountDocCheckStore checks;
    private final CountDocCustomStore custom;
    private final SetupAccessController access;
    private final boolean enabled, customEnabled;
    private final int queryTimeout, maxRows;

    public CountDocQueryController(CountDocController base, CountDocQueryCatalog catalog, CountDocCheckStore checks, CountDocCustomStore custom, SetupAccessController access,
                                   @Value("${countdoc.enabled:false}") boolean enabled,
                                   @Value("${countdoc.custom.enabled:false}") boolean customEnabled,
                                   @Value("${countdoc.query-timeout-seconds:60}") int queryTimeout,
                                   @Value("${countdoc.query-max-rows:5000}") int maxRows) {
        this.base = base;
        this.catalog = catalog;
        this.checks = checks;
        this.custom = custom;
        this.access = access;
        this.enabled = enabled;
        this.customEnabled = customEnabled;
        this.queryTimeout = queryTimeout;
        this.maxRows = maxRows;
    }

    // Gerbang semua endpoint di kelas ini (sama dengan CountDocController): dinyalakan eksplisit, lalu sesi Setup harus terbuka.
    // @ModelAttribute berlaku per controller, jadi endpoint lain di /api/countdoc tidak terpengaruh.
    @ModelAttribute
    public void gate(HttpServletRequest req) {
        if (!enabled)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Count Document belum diaktifkan. Set countdoc.enabled=true di application.properties lalu jalankan ulang aplikasi.");
        access.require(req);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> status(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatus()).cacheControl(CacheControl.noStore()).body(Collections.singletonMap("message", e.getReason()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> badBody(HttpMessageNotReadableException e) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).cacheControl(CacheControl.noStore()).body(Collections.singletonMap("message", "Isi permintaan tidak valid."));
    }

    @ExceptionHandler(CountDocCheckStore.CheckException.class)
    public ResponseEntity<Map<String, Object>> check(CountDocCheckStore.CheckException e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("message", e.getMessage());
        if (e.current != null) m.put("current", e.current);
        return ResponseEntity.status(HttpStatus.valueOf(e.status)).cacheControl(CacheControl.noStore()).body(m);
    }

    @ExceptionHandler(CountDocCustomStore.Conflict.class)
    public ResponseEntity<Map<String, Object>> conflict(CountDocCustomStore.Conflict e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("message", e.getMessage());
        m.put("current", customView(e.current));
        return ResponseEntity.status(HttpStatus.CONFLICT).cacheControl(CacheControl.noStore()).body(m);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> unexpected(Exception e) {
        String code = CountDocController.newCode();
        log.error("[countdoc:{}] kesalahan tak terduga", code, e);
        Map<String, String> body = new LinkedHashMap<>();
        body.put("message", "Terjadi kesalahan di server. Hubungi administrator dan sebutkan kode ini.");
        body.put("code", code);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).cacheControl(CacheControl.noStore()).body(body);
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    // ---------- query buatan: gerbang, tampilan, baca body ----------
    private void requireCustom() {
        if (!customEnabled)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Fitur query buatan dimatikan. Untuk menyalakan: set countdoc.custom.enabled=true di application.properties lalu jalankan ulang aplikasi. "
                    + "Perhatian: ini mengizinkan SQL SELECT bebas; sebaiknya dinyalakan setelah ada akun HANA SELECT-only.");
    }

    static Map<String, Object> customView(CountDocCustomStore.Item it) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", it.id);
        m.put("label", it.name);
        m.put("group", "Buatan saya");
        m.put("kelompok", it.group);
        m.put("role", "");
        m.put("dateKind", "");
        m.put("source", "");
        m.put("approval", false);
        m.put("sql", it.sql);
        m.put("note", it.note);
        m.put("custom", true);
        m.put("rev", it.rev);
        m.put("createdAt", it.createdAt);
        m.put("updatedAt", it.updatedAt);
        return m;
    }

    /** Baca body JSON dengan batas ukuran (tanpa percaya Content-Length), wajib application/json, kunci ganda ditolak. */
    static JsonNode readJson(String contentType, long contentLength, InputStream in, int limit) throws IOException {
        if (contentType == null || !contentType.toLowerCase(Locale.ROOT).startsWith("application/json"))
            throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Permintaan harus berformat application/json.");
        if (contentLength > limit) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Isi permintaan terlalu besar (maks " + (limit / 1024) + " KB).");
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int r;
        while ((r = in.read(buf)) > 0) {
            bo.write(buf, 0, r);
            if (bo.size() > limit) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Isi permintaan terlalu besar (maks " + (limit / 1024) + " KB).");
        }
        try {
            JsonNode n = BODY.readTree(bo.toByteArray());
            if (n == null || !n.isObject()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Isi permintaan tidak valid.");
            return n;
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Isi permintaan tidak valid.");
        }
    }

    private JsonNode body(HttpServletRequest req, int limit) throws IOException {
        return readJson(req.getContentType(), req.getContentLengthLong(), req.getInputStream(), limit);
    }

    static String str(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) {
            if (required) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Field \"" + f + "\" wajib diisi.");
            return null;
        }
        if (!v.isTextual()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Field \"" + f + "\" harus berupa teks.");
        return v.asText();
    }

    static void only(JsonNode n, Set<String> allowed) {
        for (Iterator<String> it = n.fieldNames(); it.hasNext(); )
            if (!allowed.contains(it.next())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Isi permintaan tidak valid (field asing).");
    }

    private static Integer intOrNull(JsonNode n, String f) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) return null;
        if (!v.isInt()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Field \"" + f + "\" harus bilangan bulat.");
        return v.asInt();
    }

    private void audit(HttpServletRequest req, String action, String id, String extra) {
        accessLog.info("{} ip={} custom={} id={} {}", LocalDateTime.now().withNano(0), req.getRemoteAddr(), action, id, extra);
    }

    // ---------- daftar ----------
    @GetMapping("/queries")
    public ResponseEntity<Map<String, Object>> queries() throws IOException {
        List<Map<String, Object>> list = new ArrayList<>();
        for (CountDocQueryCatalog.Query q : catalog.all()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", q.id);
            m.put("label", q.label);
            m.put("group", q.group);
            m.put("role", q.role);
            m.put("dateKind", q.dateKind);
            m.put("source", q.source);
            m.put("approval", q.approval);
            m.put("sql", q.displaySql);
            m.put("custom", false);
            list.add(m);
        }
        if (customEnabled) for (CountDocCustomStore.Item it : custom.all()) list.add(customView(it));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("queries", list);
        Map<String, Object> cm = new LinkedHashMap<>();
        cm.put("enabled", customEnabled);
        cm.put("max", CountDocCustomStore.MAX_ITEMS);
        cm.put("maxSql", CountDocSqlValidator.MAX_SQL);
        cm.put("maxName", CountDocCustomStore.MAX_NAME);
        cm.put("maxGroup", CountDocCustomStore.MAX_GROUP);
        cm.put("maxNote", CountDocCustomStore.MAX_NOTE);
        cm.put("maxImportBytes", MAX_IMPORT_BODY);
        cm.put("maxImportQueries", CountDocCustomStore.MAX_IMPORT);
        cm.put("timeout", queryTimeout);
        out.put("customConfig", cm);
        out.put("maxRows", maxRows);
        out.put("maxDays", CountDocController.MAX_DAYS);
        return noStore(out);
    }

    // ---------- jalankan ----------
    /** Validasi rentang tanggal (default bulan berjalan; maks MAX_DAYS hari). Hasil: [awal, akhir]. */
    static LocalDate[] range(String from, String to, LocalDate today) {
        LocalDate f, t;
        try {
            f = from == null || from.isEmpty() ? today.withDayOfMonth(1) : LocalDate.parse(from);
            t = to == null || to.isEmpty() ? today : LocalDate.parse(to);
        } catch (DateTimeParseException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Format tanggal harus yyyy-MM-dd.");
        }
        if (f.isAfter(t)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tanggal awal harus sebelum atau sama dengan tanggal akhir.");
        if (ChronoUnit.DAYS.between(f, t) + 1 > CountDocController.MAX_DAYS)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rentang maksimal " + CountDocController.MAX_DAYS + " hari.");
        return new LocalDate[]{f, t};
    }

    static String columnType(int sqlType) {
        switch (sqlType) {
            case Types.TINYINT: case Types.SMALLINT: case Types.INTEGER: case Types.BIGINT:
            case Types.DECIMAL: case Types.NUMERIC: case Types.FLOAT: case Types.REAL: case Types.DOUBLE:
                return "num";
            case Types.DATE: case Types.TIMESTAMP:
                return "date";
            default:
                return "text";
        }
    }

    /** Nilai sel -> nilai JSON (angka tetap angka, tanggal ISO, lainnya teks). */
    static Object cell(Object v) {
        if (v == null) return null;
        if (v instanceof BigDecimal) {
            BigDecimal b = ((BigDecimal) v).stripTrailingZeros();
            if (b.scale() <= 0 && b.precision() - b.scale() <= 18) return b.longValueExact();
            return b.doubleValue();
        }
        if (v instanceof Number) return v;
        if (v instanceof java.sql.Timestamp) return ((java.sql.Timestamp) v).toLocalDateTime().withNano(0).toString().replace('T', ' ');
        if (v instanceof java.sql.Date) return ((java.sql.Date) v).toLocalDate().toString();
        return String.valueOf(v);
    }

    /** params = urutan "from"/"to" untuk tiap tanda ? di sql. */
    private Map<String, Object> exec(String qid, String sql, List<String> params, String schema, LocalDate f, LocalDate t) {
        long t0 = System.nanoTime();
        Map<String, Object> out = new LinkedHashMap<>();
        try (Connection con = base.open(schema); PreparedStatement ps = con.prepareStatement(sql)) {
            ps.setQueryTimeout(queryTimeout);
            ps.setMaxRows(maxRows + 1);
            for (int i = 0; i < params.size(); i++) ps.setDate(i + 1, java.sql.Date.valueOf("from".equals(params.get(i)) ? f : t));
            try (ResultSet rs = ps.executeQuery()) {
                ResultSetMetaData md = rs.getMetaData();
                int n = md.getColumnCount();
                List<Map<String, String>> cols = new ArrayList<>();
                for (int i = 1; i <= n; i++) {
                    Map<String, String> c = new LinkedHashMap<>();
                    c.put("name", md.getColumnLabel(i));
                    c.put("type", columnType(md.getColumnType(i)));
                    cols.add(c);
                }
                List<Object> rows = new ArrayList<>();
                boolean truncated = false;
                while (rs.next()) {
                    if (rows.size() >= maxRows) { truncated = true; break; }
                    List<Object> r = new ArrayList<>(n);
                    for (int i = 1; i <= n; i++) r.add(cell(rs.getObject(i)));
                    rows.add(r);
                }
                out.put("columns", cols);
                out.put("rows", rows);
                out.put("rowCount", rows.size());
                out.put("truncated", truncated);
            }
        } catch (SQLException e) {
            String code = CountDocController.newCode();
            String kind = CountDocQueryCatalog.errorKind(e);
            // detail hanya di log; ke klien: jenis + kode korelasi
            log.warn("[countdoc:{}] query {} {}: {} (sqlstate {}, code {})", code, qid, kind, e.getMessage(), e.getSQLState(), e.getErrorCode());
            out.clear();
            out.put("error", kind);
            out.put("code", code);
        }
        out.put("ms", (System.nanoTime() - t0) / 1_000_000L);
        return out;
    }

    private String schemaOf(String company) {
        String schema = company == null || company.isEmpty() ? base.activeSchema() : company;
        if (!CountDocController.SCHEMA.matcher(schema).matches() || !base.allowedSchemas().contains(schema))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Company tidak diizinkan.");
        return schema;
    }

    /** Jalankan lewat POOL + semafor + timeout, catat audit (id, company, durasi, jumlah baris; tanpa isi baris), susun respons. */
    private Map<String, Object> runGated(String qid, String kind, String sql, List<String> params, String schema, LocalDate[] r, HttpServletRequest req) {
        if (!inflight.tryAcquire())
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Server sedang menjalankan banyak query. Coba lagi sebentar lagi.");
        Map<String, Object> out;
        try {
            Future<Map<String, Object>> fu = CountDocController.POOL.submit(() -> exec(qid, sql, params, schema, r[0], r[1]));
            try {
                out = fu.get(queryTimeout + 15L, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                fu.cancel(true);
                out = new LinkedHashMap<>();
                out.put("error", "timeout");
                out.put("code", CountDocController.newCode());
                out.put("ms", (queryTimeout + 15L) * 1000L);
            } catch (InterruptedException | ExecutionException e) {
                String code = CountDocController.newCode();
                log.warn("[countdoc:{}] query {} gagal dijalankan", code, qid, e);
                out = new LinkedHashMap<>();
                out.put("error", "gagal");
                out.put("code", code);
                out.put("ms", 0L);
            }
        } finally {
            inflight.release();
        }
        accessLog.info("{} ip={} {}={} company={} range={}..{} ms={} rows={} result={}", LocalDateTime.now().withNano(0), req.getRemoteAddr(), kind, qid, schema,
                r[0], r[1], out.get("ms"), out.get("rowCount"), out.containsKey("error") ? out.get("error") : "ok");
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("id", qid);
        res.put("company", schema);
        res.put("from", r[0].toString());
        res.put("to", r[1].toString());
        res.putAll(out);
        return res;
    }

    @PostMapping("/query/run")
    public ResponseEntity<Map<String, Object>> run(@RequestBody Map<String, String> body, HttpServletRequest req) throws IOException {
        String id = body.get("id");
        if (CountDocCustomStore.isCustomId(id)) {
            requireCustom();
            CountDocCustomStore.Item it = custom.get(id);
            if (it == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Query buatan tidak ditemukan (mungkin sudah dihapus).");
            // jangan percaya yang tersimpan: validasi ulang, eksekusi hanya teks kanonik hasil validator
            CountDocSqlValidator.Result v = CountDocSqlValidator.validate(it.sql);
            if (!v.ok) {
                log.warn("query buatan {} tersimpan tetapi tidak lolos validasi: {}", id, v.message());
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "SQL query ini tidak lolos validasi: " + v.message());
            }
            String schema = schemaOf(body.get("company"));
            LocalDate[] r = range(body.get("from"), body.get("to"), LocalDate.now());
            return noStore(runGated(id, "custom-query", v.sql, v.params, schema, r, req));
        }
        CountDocQueryCatalog.Query q = catalog.find(id);
        if (q == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Query tidak dikenal.");
        String schema = schemaOf(body.get("company"));
        LocalDate[] r = range(body.get("from"), body.get("to"), LocalDate.now());
        return noStore(runGated(q.id, "query", q.sql, FROM_TO, schema, r, req));
    }

    // ---------- query buatan: CRUD ----------
    @PostMapping("/custom/test")
    public ResponseEntity<Map<String, Object>> customTest(HttpServletRequest req) throws IOException {
        requireCustom();
        JsonNode b = body(req, MAX_BODY);
        only(b, TEST_FIELDS);
        CountDocSqlValidator.Result v = CountDocSqlValidator.validate(str(b, "sql", true));
        if (!v.ok) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, v.message());
        String schema = schemaOf(str(b, "company", false));
        LocalDate[] r = range(str(b, "from", false), str(b, "to", false), LocalDate.now());
        return noStore(runGated("(draf)", "custom-test", v.sql, v.params, schema, r, req));
    }

    @PostMapping("/custom")
    public ResponseEntity<Object> customCreate(HttpServletRequest req) throws IOException {
        requireCustom();
        JsonNode b = body(req, MAX_BODY);
        only(b, SAVE_FIELDS);
        CountDocCustomStore.Item it = custom.create(str(b, "name", true), str(b, "group", false), str(b, "sql", true), str(b, "note", false));
        audit(req, "create", it.id, "nameLen=" + it.name.length() + " sqlLen=" + it.sql.length());
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore()).body(customView(it));
    }

    @PutMapping("/custom/{id}")
    public ResponseEntity<Object> customUpdate(@PathVariable String id, HttpServletRequest req) throws IOException {
        requireCustom();
        JsonNode b = body(req, MAX_BODY);
        only(b, SAVE_FIELDS);
        CountDocCustomStore.Item it = custom.update(id, intOrNull(b, "rev"), str(b, "name", true), str(b, "group", false), str(b, "sql", true), str(b, "note", false));
        audit(req, "update", it.id, "rev=" + it.rev + " sqlLen=" + it.sql.length());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(customView(it));
    }

    @DeleteMapping("/custom/{id}")
    public ResponseEntity<Object> customDelete(@PathVariable String id, HttpServletRequest req) {
        requireCustom();
        if (!custom.delete(id)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Query buatan tidak ditemukan (mungkin sudah dihapus).");
        checks.remove(id);
        audit(req, "delete", id, "");
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Collections.singletonMap("deleted", id));
    }

    // ---------- query buatan: impor ----------
    @PostMapping("/custom/import/preview")
    public ResponseEntity<Map<String, Object>> importPreview(HttpServletRequest req) throws IOException {
        requireCustom();
        JsonNode q = CountDocCustomStore.checkBundle(body(req, MAX_IMPORT_BODY));
        List<Map<String, Object>> rows = new ArrayList<>();
        for (CountDocCustomStore.Preview p : custom.preview(q)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("index", p.index);
            m.put("name", p.name);
            m.put("group", p.group);
            m.put("ok", p.ok);
            m.put("error", p.error);
            m.put("conflict", p.conflict);
            m.put("suggested", p.suggested);
            m.put("hasCheck", p.hasCheck);
            m.put("params", p.params);
            rows.add(m);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("entries", rows);
        out.put("existing", custom.all().size());
        out.put("max", CountDocCustomStore.MAX_ITEMS);
        return noStore(out);
    }

    @PostMapping("/custom/import")
    public ResponseEntity<Map<String, Object>> importCommit(HttpServletRequest req) throws IOException {
        requireCustom();
        JsonNode b = body(req, MAX_IMPORT_BODY);
        only(b, IMPORT_FIELDS);
        JsonNode arr = b.get("entries");
        if (arr == null || !arr.isArray()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Daftar \"entries\" tidak ada.");
        if (arr.size() > CountDocCustomStore.MAX_IMPORT)
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Terlalu banyak entri (maks " + CountDocCustomStore.MAX_IMPORT + ").");
        boolean withChecks = b.path("includeChecks").asBoolean(false);
        List<CountDocCustomStore.Entry> entries = new ArrayList<>();
        List<String> errs = new ArrayList<>();
        for (JsonNode n : arr) {
            try { entries.add(CountDocCustomStore.parseEntry(n, true)); errs.add(null); }
            catch (CountDocCheckStore.CheckException e) { entries.add(null); errs.add(e.getMessage()); }
        }
        List<Map<String, Object>> res = new ArrayList<>();
        int imported = 0, skipped = 0, failed = 0;
        for (CountDocCustomStore.Outcome o : custom.importEntries(entries, errs)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("index", o.index);
            m.put("name", o.name);
            if (o.ok) {
                imported++;
                m.put("id", o.id);
                if (withChecks && o.entry.checkStatus != null) {
                    try { checks.put(o.id, 0, o.entry.checkStatus, o.entry.checkNote); }
                    catch (CountDocCheckStore.CheckException e) { m.put("checkError", e.getMessage()); }
                }
            } else if (o.skipped) skipped++;
            else { failed++; m.put("error", o.error); }
            m.put("status", o.ok ? "imported" : o.skipped ? "skipped" : "failed");
            res.add(m);
        }
        audit(req, "import", "-", "imported=" + imported + " skipped=" + skipped + " failed=" + failed);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("imported", imported);
        out.put("skipped", skipped);
        out.put("failed", failed);
        out.put("results", res);
        return noStore(out);
    }

    // ---------- status cek ----------
    @GetMapping("/query-checks")
    public ResponseEntity<Map<String, Object>> checksAll() {
        return noStore(Collections.<String, Object>singletonMap("checks", checks.all()));
    }

    @PutMapping("/query-checks/{id}")
    public ResponseEntity<Object> checksPut(@PathVariable String id, @RequestBody Map<String, Object> body) throws IOException {
        boolean known = CountDocCustomStore.isCustomId(id) ? customEnabled && custom.get(id) != null : catalog.find(id) != null;
        if (!known) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Query tidak dikenal.");
        Object rev = body.get("rev"), st = body.get("status"), note = body.get("note");
        if (!(rev == null || rev instanceof Integer) || !(st == null || st instanceof String) || !(note == null || note instanceof String))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Isi permintaan tidak valid.");
        CountDocCheckStore.Item it = checks.put(id, (Integer) rev, (String) st, (String) note);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(it);
    }
}
