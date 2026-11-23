package com.stem.cvppmk.docs;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Pattern;

/**
 * Query buatan Count Document (Tahap B/C): satu berkas {docs.data.dir}/countdoc/queries/custom/queries.json.
 * Meniru CountDocCheckStore: tulis .tmp unik lalu ATOMIC_MOVE di dalam lock, rev per item (rev lama = 409), batas ukuran/jumlah,
 * id dibuat server ("custom-" + 12 hex). SQL divalidasi (CountDocSqlValidator) saat simpan; yang tersimpan tidak dipercaya, pemanggil
 * HARUS memvalidasi ulang saat menjalankan. Berkas rusak tidak ditimpa (500).
 */
@Component
public class CountDocCustomStore {
    public static final int MAX_ITEMS = 200, MAX_NAME = 80, MAX_GROUP = 60, MAX_NOTE = 1000;
    public static final int MAX_FILE_BYTES = 8 * 1024 * 1024;
    public static final int MAX_IMPORT = 500;
    public static final String FORMAT = "cvppmk-countdoc-queries";
    public static final Pattern ID = Pattern.compile("custom-[0-9a-f]{12}");

    public static boolean isCustomId(String id) { return id != null && ID.matcher(id).matches(); }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Item {
        public String id, name, group = "", sql, note = "", createdAt, updatedAt;
        public int rev;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class Doc {
        public int v = 1;
        public Map<String, Item> items = new LinkedHashMap<>();
    }

    /** Satu baris query dari berkas impor / permintaan impor (sudah lolos pemeriksaan bentuk, SQL belum tentu valid). */
    public static final class Entry {
        public String name, group = "", sql, note = "", checkStatus, checkNote = "";
        public int index = -1;
        public String action = "import";
    }

    public static final class Preview {
        public int index;
        public String name, group, error, suggested;
        public boolean ok, conflict, hasCheck;
        public List<String> params = Collections.emptyList();
    }

    public static final class Outcome {
        public int index;
        public boolean ok, skipped;
        public String error, id, name;
        public Entry entry;
    }

    /** rev lama (409): membawa versi terkini supaya klien bisa memuatnya. */
    public static class Conflict extends RuntimeException {
        public final Item current;

        public Conflict(Item current) { super("Query ini sudah diubah orang lain. Muat ulang lalu simpan lagi."); this.current = current; }
    }

    private final ObjectMapper mapper = new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private final ReentrantLock lock = new ReentrantLock();
    private final Path dir, file;

    @Autowired
    public CountDocCustomStore(@Value("${docs.data.dir:}") String dataDir, DataFiles files) throws IOException {
        this(files.dir(dataDir).resolve("countdoc"));
    }

    /** Dipakai tes: root = folder countdoc. */
    CountDocCustomStore(Path root) throws IOException {
        this.dir = root.toAbsolutePath().normalize().resolve("queries").resolve("custom");
        this.file = dir.resolve("queries.json");
        Files.createDirectories(dir);
    }

    private static CountDocCheckStore.CheckException bad(String m) { return new CountDocCheckStore.CheckException(400, m); }

    private Doc read() {
        if (!Files.exists(file)) return new Doc();
        try {
            Doc d = mapper.readValue(Files.readAllBytes(file), Doc.class);
            if (d == null || d.items == null) throw new IOException("kosong");
            return d;
        } catch (IOException e) {
            throw new CountDocCheckStore.CheckException(500, "Berkas query buatan rusak dan tidak ditimpa. Hubungi administrator.");
        }
    }

    private void write(Doc d) throws IOException {
        byte[] bytes = mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(d);
        if (bytes.length > MAX_FILE_BYTES) throw new CountDocCheckStore.CheckException(413, "Berkas query buatan terlalu besar.");
        Path tmp = dir.resolve("queries.json." + UUID.randomUUID().toString().replace("-", "") + ".tmp");
        try {
            Files.write(tmp, bytes);
            try { Files.move(tmp, file, StandardCopyOption.ATOMIC_MOVE); }
            catch (AtomicMoveNotSupportedException e) { Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING); }
        } finally { Files.deleteIfExists(tmp); }
    }

    public List<Item> all() {
        lock.lock();
        try { return new ArrayList<>(read().items.values()); } finally { lock.unlock(); }
    }

    public Item get(String id) {
        if (!isCustomId(id)) return null;
        lock.lock();
        try { return read().items.get(id); } finally { lock.unlock(); }
    }

    // ---------- pembersihan field ----------
    private static boolean hasControl(String s) {
        for (int i = 0; i < s.length(); i++) {
            int t = Character.getType(s.charAt(i));
            if (t == Character.CONTROL || t == Character.FORMAT || t == Character.LINE_SEPARATOR || t == Character.PARAGRAPH_SEPARATOR) return true;
        }
        return false;
    }

    static String cleanName(String name) {
        String s = name == null ? "" : name.trim().replaceAll("\\s+", " ");
        if (s.isEmpty()) throw bad("Nama wajib diisi.");
        if (s.length() > MAX_NAME) throw bad("Nama terlalu panjang (maks " + MAX_NAME + " karakter).");
        if (hasControl(s)) throw bad("Nama tidak boleh memuat karakter kontrol.");
        return s;
    }

    static String cleanGroup(String g) {
        String s = g == null ? "" : g.trim().replaceAll("\\s+", " ");
        if (s.length() > MAX_GROUP) throw bad("Kelompok terlalu panjang (maks " + MAX_GROUP + " karakter).");
        if (hasControl(s)) throw bad("Kelompok tidak boleh memuat karakter kontrol.");
        return s;
    }

    static String cleanNote(String note) {
        if (note == null) return "";
        String s = note.replace("\r\n", "\n").replace('\r', '\n').trim();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            int t = Character.getType(c);
            if (c != '\n' && c != '\t' && (t == Character.CONTROL || t == Character.FORMAT || t == Character.LINE_SEPARATOR || t == Character.PARAGRAPH_SEPARATOR))
                throw bad("Catatan tidak boleh memuat karakter kontrol.");
        }
        if (s.length() > MAX_NOTE) throw bad("Catatan terlalu panjang (maks " + MAX_NOTE + " karakter).");
        return s;
    }

    /** Validasi SQL (dipakai simpan dan impor); mengembalikan teks asli yang dirapikan barisnya, melempar 400 bila tidak lolos. */
    static String cleanSql(String sql) {
        CountDocSqlValidator.Result r = CountDocSqlValidator.validate(sql);
        if (!r.ok) throw bad(r.message());
        return sql.replace("\r\n", "\n").replace('\r', '\n').trim();
    }

    private static String key(String name) { return name.toLowerCase(Locale.ROOT); }

    private static Set<String> names(Doc d, String exceptId) {
        Set<String> s = new HashSet<>();
        for (Item it : d.items.values()) if (!it.id.equals(exceptId)) s.add(key(it.name));
        return s;
    }

    /** "Nama (2)", "Nama (3)", ... yang belum dipakai (dan tetap muat di MAX_NAME). */
    static String suggestName(Set<String> taken, String name) {
        for (int i = 2; i < 1000; i++) {
            String suffix = " (" + i + ")";
            String base = name.length() + suffix.length() > MAX_NAME ? name.substring(0, MAX_NAME - suffix.length()) : name;
            String cand = base + suffix;
            if (!taken.contains(key(cand))) return cand;
        }
        return name + " " + UUID.randomUUID().toString().substring(0, 6);
    }

    private static String newId(Doc d) {
        for (;;) {
            String id = "custom-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
            if (!d.items.containsKey(id)) return id;
        }
    }

    // ---------- CRUD ----------
    public Item create(String name, String group, String sql, String note) {
        String n = cleanName(name), g = cleanGroup(group), q = cleanSql(sql), nt = cleanNote(note);
        lock.lock();
        try {
            Doc d = read();
            if (d.items.size() >= MAX_ITEMS) throw new CountDocCheckStore.CheckException(413, "Jumlah query buatan sudah mencapai batas (" + MAX_ITEMS + "). Hapus sebagian dulu.");
            if (names(d, null).contains(key(n))) throw bad("Nama \"" + n + "\" sudah dipakai query buatan lain.");
            Item it = new Item();
            it.id = newId(d); it.name = n; it.group = g; it.sql = q; it.note = nt; it.rev = 1;
            it.createdAt = it.updatedAt = LocalDateTime.now().withNano(0).toString();
            d.items.put(it.id, it);
            write(d);
            return it;
        } catch (IOException e) {
            throw new CountDocCheckStore.CheckException(500, "Gagal menyimpan query buatan.");
        } finally { lock.unlock(); }
    }

    public Item update(String id, Integer rev, String name, String group, String sql, String note) {
        if (!isCustomId(id)) throw new CountDocCheckStore.CheckException(404, "Query buatan tidak ditemukan.");
        if (rev == null || rev < 1) throw bad("Nilai rev wajib diisi.");
        String n = cleanName(name), g = cleanGroup(group), q = cleanSql(sql), nt = cleanNote(note);
        lock.lock();
        try {
            Doc d = read();
            Item cur = d.items.get(id);
            if (cur == null) throw new CountDocCheckStore.CheckException(404, "Query buatan tidak ditemukan (mungkin sudah dihapus).");
            if (rev != cur.rev) throw new Conflict(cur);
            if (names(d, id).contains(key(n))) throw bad("Nama \"" + n + "\" sudah dipakai query buatan lain.");
            Item it = new Item();
            it.id = id; it.name = n; it.group = g; it.sql = q; it.note = nt; it.rev = cur.rev + 1;
            it.createdAt = cur.createdAt; it.updatedAt = LocalDateTime.now().withNano(0).toString();
            d.items.put(id, it);
            write(d);
            return it;
        } catch (IOException e) {
            throw new CountDocCheckStore.CheckException(500, "Gagal menyimpan query buatan.");
        } finally { lock.unlock(); }
    }

    /** true bila ada dan terhapus. */
    public boolean delete(String id) {
        if (!isCustomId(id)) return false;
        lock.lock();
        try {
            Doc d = read();
            if (d.items.remove(id) == null) return false;
            write(d);
            return true;
        } catch (IOException e) {
            throw new CountDocCheckStore.CheckException(500, "Gagal menghapus query buatan.");
        } finally { lock.unlock(); }
    }

    // ---------- impor ----------
    private static final Set<String> ENTRY_FIELDS = new HashSet<>(Arrays.asList("id", "name", "group", "sql", "note", "check"));
    private static final Set<String> COMMIT_FIELDS = new HashSet<>(Arrays.asList("id", "name", "group", "sql", "note", "check", "index", "action"));
    private static final Set<String> CHECK_FIELDS = new HashSet<>(Arrays.asList("status", "note"));

    private static void onlyFields(JsonNode n, Set<String> allowed, String what) {
        for (Iterator<String> it = n.fieldNames(); it.hasNext(); ) {
            String f = it.next();
            if (!allowed.contains(f)) throw bad("Field asing di " + what + ": \"" + (f.length() > 30 ? f.substring(0, 30) + "..." : f).replaceAll("[\\p{Cntrl}]", "?") + "\".");
        }
    }

    private static String text(JsonNode n, String f, boolean required) {
        JsonNode v = n.get(f);
        if (v == null || v.isNull()) { if (required) throw bad("Field \"" + f + "\" wajib diisi."); return null; }
        if (!v.isTextual()) throw bad("Field \"" + f + "\" harus berupa teks.");
        return v.asText();
    }

    /** Bentuk satu entri (bukan isi SQL). Melempar CheckException(400) berisi alasan. */
    public static Entry parseEntry(JsonNode n, boolean commit) {
        if (n == null || !n.isObject()) throw bad("Entri harus berupa objek.");
        onlyFields(n, commit ? COMMIT_FIELDS : ENTRY_FIELDS, "entri");
        Entry e = new Entry();
        e.name = text(n, "name", true);
        String g = text(n, "group", false), nt = text(n, "note", false);
        e.group = g == null ? "" : g;
        e.note = nt == null ? "" : nt;
        e.sql = text(n, "sql", true);
        text(n, "id", false); // informasi saja; id selalu dibuat ulang
        JsonNode c = n.get("check");
        if (c != null && !c.isNull()) {
            if (!c.isObject()) throw bad("Field \"check\" harus berupa objek.");
            onlyFields(c, CHECK_FIELDS, "check");
            e.checkStatus = text(c, "status", true);
            if (!CountDocCheckStore.STATUSES.contains(e.checkStatus)) throw bad("Status cek tidak dikenal.");
            String cn = text(c, "note", false);
            e.checkNote = cn == null ? "" : cn;
        }
        if (commit) {
            JsonNode a = n.get("action");
            if (a != null && !a.isNull()) {
                if (!a.isTextual() || !("import".equals(a.asText()) || "skip".equals(a.asText()))) throw bad("Aksi harus \"import\" atau \"skip\".");
                e.action = a.asText();
            }
            JsonNode ix = n.get("index");
            if (ix != null && !ix.isNull()) { if (!ix.isInt()) throw bad("Field \"index\" harus bilangan bulat."); e.index = ix.asInt(); }
        }
        return e;
    }

    /** Periksa pembungkus berkas ekspor; mengembalikan array queries. */
    public static JsonNode checkBundle(JsonNode root) {
        if (root == null || !root.isObject()) throw bad("Berkas bukan objek JSON.");
        onlyFields(root, new HashSet<>(Arrays.asList("format", "version", "exportedAt", "queries")), "berkas");
        if (!root.hasNonNull("format") || !FORMAT.equals(root.get("format").asText())) throw bad("Bukan berkas ekspor query Count Document (format salah).");
        JsonNode v = root.get("version");
        if (v == null || !v.isInt()) throw bad("Versi berkas tidak ada.");
        if (v.asInt() != 1) throw bad("Versi berkas " + v.asInt() + " tidak didukung (hanya versi 1).");
        JsonNode q = root.get("queries");
        if (q == null || !q.isArray()) throw bad("Daftar \"queries\" tidak ada.");
        if (q.size() > MAX_IMPORT) throw new CountDocCheckStore.CheckException(413, "Berkas memuat " + q.size() + " query; maksimal " + MAX_IMPORT + " per impor.");
        return q;
    }

    /** Pratinjau: validasi tiap entri dan bentrok nama (terhadap yang tersimpan dan entri sebelumnya di berkas). Tidak menulis apa pun. */
    public List<Preview> preview(JsonNode queries) {
        lock.lock();
        try {
            Doc d = read();
            Set<String> taken = names(d, null);
            List<Preview> out = new ArrayList<>();
            int i = 0;
            for (JsonNode n : queries) {
                Preview p = new Preview();
                p.index = i++;
                try {
                    Entry e = parseEntry(n, false);
                    p.name = e.name.length() > 200 ? e.name.substring(0, 200) : e.name;
                    p.group = e.group.length() > 200 ? e.group.substring(0, 200) : e.group;
                    p.hasCheck = e.checkStatus != null;
                    String nm = cleanName(e.name);
                    p.name = nm;
                    cleanGroup(e.group); cleanNote(e.note);
                    CountDocSqlValidator.Result r = CountDocSqlValidator.validate(e.sql);
                    if (!r.ok) throw bad(r.message());
                    p.params = r.params;
                    p.ok = true;
                    if (taken.contains(key(nm))) { p.conflict = true; p.suggested = suggestName(taken, nm); }
                    else taken.add(key(nm));
                } catch (CountDocCheckStore.CheckException ex) {
                    p.ok = false; p.error = ex.getMessage();
                }
                out.add(p);
            }
            return out;
        } finally { lock.unlock(); }
    }

    /**
     * Impor sungguhan: tiap entri divalidasi ULANG seperti saat simpan; entri action=skip dilewati; bentrok nama atau batas jumlah
     * menggagalkan entri itu saja. Satu kali tulis berkas. Pemanggil menerapkan status cek untuk Outcome.ok.
     */
    public List<Outcome> importEntries(List<Entry> entries, List<String> parseErrors) {
        lock.lock();
        try {
            Doc d = read();
            Set<String> taken = names(d, null);
            List<Outcome> out = new ArrayList<>();
            boolean changed = false;
            for (int i = 0; i < entries.size(); i++) {
                Entry e = entries.get(i);
                Outcome o = new Outcome();
                o.index = e == null || e.index < 0 ? i : e.index;
                if (e == null) { o.error = parseErrors.get(i); out.add(o); continue; }
                o.entry = e;
                if ("skip".equals(e.action)) { o.skipped = true; o.name = e.name; out.add(o); continue; }
                try {
                    String n = cleanName(e.name), g = cleanGroup(e.group), q = cleanSql(e.sql), nt = cleanNote(e.note);
                    if (d.items.size() >= MAX_ITEMS) throw new CountDocCheckStore.CheckException(413, "Batas " + MAX_ITEMS + " query buatan tercapai.");
                    if (taken.contains(key(n))) throw bad("Nama \"" + n + "\" sudah dipakai.");
                    Item it = new Item();
                    it.id = newId(d); it.name = n; it.group = g; it.sql = q; it.note = nt; it.rev = 1;
                    it.createdAt = it.updatedAt = LocalDateTime.now().withNano(0).toString();
                    d.items.put(it.id, it);
                    taken.add(key(n));
                    o.ok = true; o.id = it.id; o.name = n;
                    changed = true;
                } catch (CountDocCheckStore.CheckException ex) {
                    o.error = ex.getMessage();
                }
                out.add(o);
            }
            if (changed) write(d);
            return out;
        } catch (IOException e) {
            throw new CountDocCheckStore.CheckException(500, "Gagal menyimpan hasil impor.");
        } finally { lock.unlock(); }
    }
}
