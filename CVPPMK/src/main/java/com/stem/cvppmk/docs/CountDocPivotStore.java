package com.stem.cvppmk.docs;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Penyimpanan definisi pivot tool Count Document: satu berkas JSON per pivot di
 * {docs.data.dir}/countdoc/pivots/{id}.json (lokasi data-dir sama dengan ReviewController, lewat DataFiles.dir).
 * - Hanya DEFINISI pivot (spec) yang disimpan, bukan angka hasil.
 * - ID dibuat server (32 hex). Nama dari klien tidak pernah jadi nama berkas; path di-resolve + normalize + startsWith(dir).
 * - Tulis atomic (.tmp unik lalu ATOMIC_MOVE) di dalam satu lock per toko. rev naik tiap simpan, rev lama = konflik (409).
 * - Hapus = pindah ke countdoc/trash/{id}-{waktu}.json; trash > 30 hari dibersihkan saat start dan sesekali.
 * - Aplikasi tidak punya login per orang: owner hanyalah label informasi, BUKAN kontrol akses.
 */
@Component
public class CountDocPivotStore {
    private static final Logger log = LoggerFactory.getLogger(CountDocPivotStore.class);

    public static final int MAX_FILE_BYTES = 64 * 1024;
    public static final int MAX_FILES = 200;
    static final int MAX_NAME = 80, MAX_DESC = 300, MAX_ROWS = 3, MAX_COLS = 2, MAX_FILTERS = 6, MAX_VALUES = 200;
    static final int MAX_JSON_DEPTH = 12;
    static final long TRASH_DAYS = 30;
    static final Set<String> FIELDS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "group", "objType", "userCode", "userName", "date", "week", "month", "year", "status", "role", "dateKind")));
    static final Set<String> AGGS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList("sum", "count", "distinct")));
    static final Set<String> OPS = Collections.unmodifiableSet(new HashSet<>(Arrays.asList("in", "notIn", "eq", "ne")));
    static final Pattern ID = Pattern.compile("^[a-f0-9]{32}$");
    static final Pattern VALUE_FIELD = Pattern.compile("^[A-Za-z][A-Za-z0-9_]{0,39}$");
    static final Pattern WORD = Pattern.compile("^[A-Za-z0-9_-]{1,40}$");
    static final String PRESET_DATE = "preset-per-tanggal", PRESET_USER = "preset-per-user";

    // ---------- DTO bertipe ----------
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class Filter { public String field; public String op; public List<String> values; }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class ValueDef { public String agg; public String field; }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class DateRange { public String type; public String preset; public Integer days; public String from; public String to; }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    @JsonPropertyOrder({"view", "rows", "cols", "filters", "value", "dateRange", "options"})
    public static class Spec {
        public String view;
        public List<String> rows, cols;
        public List<Filter> filters;
        public ValueDef value;
        public DateRange dateRange;
        public Map<String, Object> options;
    }

    /** Isi body POST/PUT dari klien. */
    public static class Input { public String name, description, scope; public Integer rev; public Spec spec; }

    @JsonPropertyOrder({"v", "id", "rev", "name", "description", "owner", "scope", "builtin", "createdAt", "updatedAt", "spec"})
    public static class Pivot {
        public int v = 1;
        public String id;
        public int rev;
        public String name, description, owner, scope;
        public boolean builtin;
        public String createdAt, updatedAt;
        public Spec spec;
    }

    /** Kesalahan yang aman dikirim ke klien (pesan sudah ramah). current terisi untuk 409. */
    public static class PivotException extends RuntimeException {
        public final int status;
        public final Map<String, Object> current;
        public PivotException(int status, String message) { this(status, message, null); }
        public PivotException(int status, String message, Map<String, Object> current) { super(message); this.status = status; this.current = current; }
    }

    private final ObjectMapper mapper = new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, true);
    private final ReentrantLock lock = new ReentrantLock();
    private final Path pivots, trash;
    private volatile long lastPurge;

    @Autowired
    public CountDocPivotStore(@Value("${docs.data.dir:}") String dataDir) throws IOException {
        this(DataFiles.dir(dataDir).resolve("countdoc"));
    }

    /** Dipakai tes: root = folder countdoc. */
    CountDocPivotStore(Path root) throws IOException {
        Path r = root.toAbsolutePath().normalize();
        this.pivots = r.resolve("pivots");
        this.trash = r.resolve("trash");
        Files.createDirectories(pivots);
        Files.createDirectories(trash);
        purge(true);
    }

    // ---------- baca ----------
    public List<Map<String, Object>> list(String scope, String owner, String caller) {
        String sc = scope == null || scope.isEmpty() ? "all" : scope;
        if (!sc.equals("mine") && !sc.equals("team") && !sc.equals("all")) throw new PivotException(400, "Filter scope harus mine, team, atau all.");
        lock.lock();
        try {
            List<Pivot> all = new ArrayList<>();
            for (Path p : files()) {
                try { all.add(read(p)); } catch (Exception e) { log.warn("Berkas pivot rusak dilewati: {} ({})", p.getFileName(), e.toString()); }
            }
            List<Map<String, Object>> out = new ArrayList<>();
            all.stream()
                    .filter(x -> sc.equals("mine") ? x.owner.equals(caller)
                            : sc.equals("team") ? "team".equals(x.scope)
                            // catatan jujur: "private" hanya disaring di daftar, bukan keamanan (GET /{id} tetap bisa kalau tahu id-nya)
                            : "team".equals(x.scope) || x.owner.equals(caller))
                    .filter(x -> owner == null || owner.isEmpty() || x.owner.equals(owner))
                    .sorted((a, b) -> b.updatedAt.compareTo(a.updatedAt))
                    .forEach(x -> out.add(summary(x)));
            return out;
        } finally { lock.unlock(); }
    }

    public Pivot get(String id) {
        Pivot preset = preset(id);
        if (preset != null) return preset;
        lock.lock();
        try { return read(path(id)); } finally { lock.unlock(); }
    }

    public List<Pivot> presets() { return Arrays.asList(preset(PRESET_DATE), preset(PRESET_USER)); }

    // ---------- tulis ----------
    public Pivot create(String owner, Input in) {
        Input v = validate(in, false);
        lock.lock();
        try {
            if (files().size() >= MAX_FILES) throw new PivotException(422, "Jumlah pivot tersimpan sudah mencapai batas " + MAX_FILES + ". Hapus yang tidak dipakai dulu.");
            String now = now();
            Pivot p = new Pivot();
            p.id = UUID.randomUUID().toString().replace("-", "");
            p.rev = 1;
            p.name = v.name; p.description = v.description; p.owner = owner; p.scope = v.scope;
            p.createdAt = now; p.updatedAt = now; p.spec = v.spec;
            write(p);
            purge(false);
            return p;
        } finally { lock.unlock(); }
    }

    public Pivot update(String id, String caller, Input in) {
        if (preset(id) != null) throw new PivotException(403, "Preset bawaan tidak bisa diubah. Duplikat dulu untuk membuat salinan sendiri.");
        Input v = validate(in, true);
        lock.lock();
        try {
            Pivot cur = read(path(id));
            if (cur.rev != v.rev) throw conflict(cur);
            cur.rev = cur.rev + 1;
            cur.name = v.name; cur.description = v.description; cur.scope = v.scope; cur.spec = v.spec;
            cur.updatedAt = now();
            write(cur);
            return cur;
        } finally { lock.unlock(); }
    }

    public Pivot duplicate(String id, String owner) {
        lock.lock();
        try {
            Pivot src = get(id);
            String suffix = " (salinan)";
            String name = src.name.length() + suffix.length() > MAX_NAME ? src.name.substring(0, MAX_NAME - suffix.length()) + suffix : src.name + suffix;
            Input in = new Input();
            in.name = name; in.description = src.description; in.scope = "private"; in.spec = src.spec;
            return create(owner, in);
        } finally { lock.unlock(); }
    }

    public void delete(String id) {
        if (preset(id) != null) throw new PivotException(403, "Preset bawaan tidak bisa dihapus.");
        lock.lock();
        try {
            Path p = path(id);
            if (!Files.exists(p)) throw new PivotException(404, "Pivot tidak ditemukan.");
            move(p, trash.resolve(id + "-" + System.currentTimeMillis() + ".json"));
            purge(false);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        } finally { lock.unlock(); }
    }

    // ---------- parse + validasi ----------
    /** Parse body klien: batas ukuran, kedalaman, lalu Jackson bertipe (properti tak dikenal ditolak). */
    public Input parse(byte[] body) {
        if (body.length > MAX_FILE_BYTES) throw new PivotException(413, "Isi permintaan terlalu besar (maks 64 KB).");
        if (body.length == 0) throw new PivotException(400, "Isi permintaan kosong.");
        if (depth(body) > MAX_JSON_DEPTH) throw new PivotException(400, "Struktur JSON terlalu dalam.");
        try {
            Input in = mapper.readValue(body, Input.class);
            if (in == null) throw new PivotException(400, "Isi permintaan kosong.");
            return in;
        } catch (IOException e) {
            log.info("JSON pivot ditolak: {}", e.getMessage() == null ? e.toString() : e.getMessage().split("\n")[0]);
            throw new PivotException(400, "Format JSON tidak sesuai. Cek nama field dan tipe datanya.");
        }
    }

    static int depth(byte[] b) {
        int d = 0, max = 0;
        boolean str = false, esc = false;
        for (byte c : b) {
            if (str) { if (esc) esc = false; else if (c == '\\') esc = true; else if (c == '"') str = false; }
            else if (c == '"') str = true;
            else if (c == '{' || c == '[') { if (++d > max) max = d; }
            else if (c == '}' || c == ']') d--;
        }
        return max;
    }

    static String text(String s, String label, int max, boolean required) {
        String t = s == null ? "" : s.trim();
        if (t.isEmpty()) {
            if (required) throw new PivotException(400, label + " wajib diisi.");
            return "";
        }
        if (t.length() > max) throw new PivotException(400, label + " maksimal " + max + " karakter.");
        for (int i = 0; i < t.length(); i++) {
            char c = t.charAt(i);
            if (c < 0x20 || c == 0x7f || (c >= 0x80 && c < 0xa0)) throw new PivotException(400, label + " tidak boleh berisi karakter kontrol.");
        }
        return t;
    }

    Input validate(Input in, boolean needRev) {
        if (in == null) throw new PivotException(400, "Isi permintaan kosong.");
        Input o = new Input();
        o.name = text(in.name, "Nama", MAX_NAME, true);
        // nama tidak pernah jadi nama berkas, tapi tetap ditolak bila menyerupai path agar tidak membingungkan di tempat lain
        if (o.name.indexOf('/') >= 0 || o.name.indexOf('\\') >= 0 || o.name.indexOf('<') >= 0 || o.name.indexOf('>') >= 0)
            throw new PivotException(400, "Nama tidak boleh memuat karakter / \\ < >.");
        o.description = text(in.description, "Deskripsi", MAX_DESC, false);
        String sc = in.scope == null ? "private" : in.scope.trim();
        if (!sc.equals("private") && !sc.equals("team")) throw new PivotException(400, "Scope harus private atau team.");
        o.scope = sc;
        if (needRev) {
            if (in.rev == null) throw new PivotException(400, "rev wajib diisi (rev terakhir yang Anda baca).");
            o.rev = in.rev;
        }
        o.spec = spec(in.spec);
        return o;
    }

    private static List<String> fieldList(List<String> l, String label, int max) {
        List<String> out = new ArrayList<>();
        if (l == null) return out;
        if (l.size() > max) throw new PivotException(400, "Maksimal " + max + " field untuk " + label + ".");
        for (String f : l) {
            String t = f == null ? "" : f.trim();
            if (!FIELDS.contains(t)) throw new PivotException(400, "Field '" + shorten(t) + "' tidak diizinkan untuk " + label + ".");
            out.add(t);
        }
        return out;
    }

    private static String shorten(String s) { String t = s.length() > 30 ? s.substring(0, 30) : s; return t.replaceAll("[\\p{Cntrl}]", "?"); }

    static Spec spec(Spec in) {
        if (in == null) throw new PivotException(400, "spec wajib diisi.");
        Spec s = new Spec();
        if (in.view != null && !in.view.trim().isEmpty()) {
            s.view = in.view.trim();
            if (!WORD.matcher(s.view).matches()) throw new PivotException(400, "view tidak valid.");
        }
        s.rows = fieldList(in.rows, "baris", MAX_ROWS);
        s.cols = fieldList(in.cols, "kolom", MAX_COLS);
        for (String c : s.cols) if (s.rows.contains(c)) throw new PivotException(400, "Field '" + c + "' dipakai di baris dan kolom sekaligus.");
        if (new HashSet<>(s.rows).size() != s.rows.size() || new HashSet<>(s.cols).size() != s.cols.size())
            throw new PivotException(400, "Field tidak boleh dobel di baris/kolom.");
        s.filters = new ArrayList<>();
        if (in.filters != null) {
            if (in.filters.size() > MAX_FILTERS) throw new PivotException(400, "Maksimal " + MAX_FILTERS + " filter.");
            for (Filter f : in.filters) {
                if (f == null) throw new PivotException(400, "Filter kosong.");
                Filter n = new Filter();
                n.field = f.field == null ? "" : f.field.trim();
                if (!FIELDS.contains(n.field)) throw new PivotException(400, "Field filter '" + shorten(n.field) + "' tidak diizinkan.");
                n.op = f.op == null ? "in" : f.op.trim();
                if (!OPS.contains(n.op)) throw new PivotException(400, "Operator filter tidak diizinkan.");
                n.values = new ArrayList<>();
                if (f.values != null) {
                    if (f.values.size() > MAX_VALUES) throw new PivotException(400, "Maksimal " + MAX_VALUES + " nilai per filter.");
                    for (String v : f.values) n.values.add(text(v, "Nilai filter", 100, true));
                }
                s.filters.add(n);
            }
        }
        if (in.value == null) throw new PivotException(400, "value (agregasi) wajib diisi.");
        ValueDef v = new ValueDef();
        v.agg = in.value.agg == null ? "" : in.value.agg.trim();
        if (!AGGS.contains(v.agg)) throw new PivotException(400, "Agregasi harus sum, count, atau distinct.");
        v.field = in.value.field == null ? null : in.value.field.trim();
        if (v.field != null && !v.field.isEmpty() && !VALUE_FIELD.matcher(v.field).matches()) throw new PivotException(400, "Nama field nilai tidak valid.");
        if (v.field != null && v.field.isEmpty()) v.field = null;
        s.value = v;
        if (in.dateRange != null) {
            DateRange d = new DateRange(), r = in.dateRange;
            d.type = r.type == null ? "" : r.type.trim();
            if (d.type.equals("relative")) {
                if (r.preset != null && !r.preset.trim().isEmpty()) {
                    d.preset = r.preset.trim();
                    if (!WORD.matcher(d.preset).matches()) throw new PivotException(400, "preset tanggal tidak valid.");
                }
                if (r.days != null) {
                    if (r.days < 1 || r.days > 3660) throw new PivotException(400, "days harus 1..3660.");
                    d.days = r.days;
                }
                if (d.preset == null && d.days == null) throw new PivotException(400, "Rentang relatif butuh preset atau days.");
            } else if (d.type.equals("absolute")) {
                try {
                    LocalDate a = LocalDate.parse(r.from == null ? "" : r.from.trim()), b = LocalDate.parse(r.to == null ? "" : r.to.trim());
                    if (a.isAfter(b)) throw new PivotException(400, "Tanggal awal setelah tanggal akhir.");
                    d.from = a.toString(); d.to = b.toString();
                } catch (java.time.format.DateTimeParseException e) {
                    throw new PivotException(400, "Tanggal harus berformat yyyy-MM-dd.");
                }
            } else throw new PivotException(400, "dateRange.type harus relative atau absolute.");
            s.dateRange = d;
        }
        s.options = new LinkedHashMap<>();
        if (in.options != null) {
            if (in.options.size() > 20) throw new PivotException(400, "Maksimal 20 opsi.");
            for (Map.Entry<String, Object> e : in.options.entrySet()) {
                String k = e.getKey() == null ? "" : e.getKey().trim();
                if (!WORD.matcher(k).matches()) throw new PivotException(400, "Nama opsi tidak valid.");
                Object val = e.getValue();
                if (val instanceof String) val = text((String) val, "Nilai opsi", MAX_NAME, false);
                else if (!(val == null || val instanceof Boolean || val instanceof Integer || val instanceof Long || val instanceof Double))
                    throw new PivotException(400, "Nilai opsi harus teks, angka, atau true/false.");
                s.options.put(k, val);
            }
        }
        return s;
    }

    // ---------- berkas ----------
    private Path path(String id) {
        if (id == null || !ID.matcher(id).matches()) throw new PivotException(404, "Pivot tidak ditemukan.");
        Path p = pivots.resolve(id + ".json").normalize();
        if (!p.startsWith(pivots) || !pivots.equals(p.getParent())) throw new PivotException(404, "Pivot tidak ditemukan.");
        return p;
    }

    private List<Path> files() {
        try (Stream<Path> s = Files.list(pivots)) {
            return s.filter(p -> {
                String n = p.getFileName().toString();
                return n.endsWith(".json") && ID.matcher(n.substring(0, n.length() - 5)).matches();
            }).collect(Collectors.toList());
        } catch (IOException e) { throw new IllegalStateException(e); }
    }

    private Pivot read(Path p) {
        try {
            if (!Files.exists(p)) throw new PivotException(404, "Pivot tidak ditemukan.");
            if (Files.size(p) > MAX_FILE_BYTES) throw new IllegalStateException("berkas terlalu besar: " + p.getFileName());
            Pivot x = mapper.readValue(Files.readAllBytes(p), Pivot.class);
            if (x.id == null || x.owner == null || x.updatedAt == null) throw new IllegalStateException("berkas tidak lengkap: " + p.getFileName());
            return x;
        } catch (IOException e) { throw new IllegalStateException(e); }
    }

    /** Wajib dipanggil di dalam lock. */
    private void write(Pivot p) {
        try {
            byte[] data = mapper.writeValueAsBytes(p);
            if (data.length > MAX_FILE_BYTES) throw new PivotException(413, "Definisi pivot terlalu besar (maks 64 KB).");
            Path dest = path(p.id);
            Path tmp = pivots.resolve(p.id + "." + UUID.randomUUID().toString().replace("-", "") + ".tmp");
            try {
                Files.write(tmp, data);
                move(tmp, dest);
            } finally { Files.deleteIfExists(tmp); }
        } catch (IOException e) { throw new IllegalStateException(e); }
    }

    private static void move(Path from, Path to) throws IOException {
        try { Files.move(from, to, StandardCopyOption.ATOMIC_MOVE); }
        catch (AtomicMoveNotSupportedException e) { Files.move(from, to, StandardCopyOption.REPLACE_EXISTING); }
    }

    /** Bersihkan trash > 30 hari dan .tmp sisa > 1 jam; dijalankan saat start dan paling sering sekali per jam. */
    private void purge(boolean force) {
        long nowMs = System.currentTimeMillis();
        if (!force && nowMs - lastPurge < 3600_000L) return;
        lastPurge = nowMs;
        sweep(trash, Instant.now().minus(TRASH_DAYS, ChronoUnit.DAYS), null);
        sweep(pivots, Instant.now().minus(1, ChronoUnit.HOURS), ".tmp");
    }

    private static void sweep(Path dir, Instant before, String suffix) {
        try (Stream<Path> s = Files.list(dir)) {
            s.filter(p -> suffix == null || p.getFileName().toString().endsWith(suffix)).forEach(p -> {
                try {
                    if (Files.isRegularFile(p) && Files.getLastModifiedTime(p).toInstant().isBefore(before)) {
                        Files.delete(p);
                        log.info("Berkas lama dibersihkan: {}", p.getFileName());
                    }
                } catch (IOException e) { log.warn("Gagal bersihkan {}: {}", p.getFileName(), e.getMessage()); }
            });
        } catch (IOException e) { log.warn("Gagal membaca {}: {}", dir, e.getMessage()); }
    }

    // ---------- util ----------
    private static String now() { return Instant.now().truncatedTo(ChronoUnit.MILLIS).toString(); }

    private static PivotException conflict(Pivot cur) {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("rev", cur.rev); c.put("updatedAt", cur.updatedAt); c.put("name", cur.name);
        return new PivotException(409, "Pivot ini sudah diubah sesi lain. Muat ulang atau simpan sebagai salinan.", c);
    }

    private static Map<String, Object> summary(Pivot x) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", x.id); m.put("name", x.name); m.put("description", x.description); m.put("owner", x.owner);
        m.put("scope", x.scope); m.put("rev", x.rev); m.put("updatedAt", x.updatedAt);
        return m;
    }

    private static Pivot preset(String id) {
        if (!PRESET_DATE.equals(id) && !PRESET_USER.equals(id)) return null;
        boolean byDate = PRESET_DATE.equals(id);
        Pivot p = new Pivot();
        p.id = id; p.rev = 1; p.builtin = true; p.owner = "system"; p.scope = "team";
        p.name = byDate ? "Per tanggal" : "Per user";
        p.description = byDate ? "Jumlah dokumen per grup/jenis, kolom per tanggal." : "Jumlah dokumen per grup/jenis, kolom per user.";
        p.createdAt = "2026-01-01T00:00:00.000Z";
        p.updatedAt = p.createdAt;
        Spec s = new Spec();
        s.rows = new ArrayList<>(Arrays.asList("group", "objType"));
        s.cols = new ArrayList<>(Collections.singletonList(byDate ? "date" : "userCode"));
        s.filters = new ArrayList<>();
        s.value = new ValueDef(); s.value.agg = "sum"; s.value.field = "Counted";
        DateRange d = new DateRange(); d.type = "relative"; d.days = 30;
        s.dateRange = d;
        s.options = new LinkedHashMap<>();
        p.spec = s;
        return p;
    }
}
