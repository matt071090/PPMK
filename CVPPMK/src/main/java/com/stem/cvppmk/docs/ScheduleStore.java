package com.stem.cvppmk.docs;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.*;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.concurrent.locks.ReentrantLock;

/** Satu dokumen, satu rev. Lock berlaku untuk satu instance aplikasi/JVM. */
@Component
public class ScheduleStore {
    public static final int MAX_BYTES = 256 * 1024;
    private final ObjectMapper mapper = new ObjectMapper()
            .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    private final ReentrantLock lock = new ReentrantLock();
    private final Path dir, file;
    private final String seed;
    private volatile Set<String> fixedPics;
    public static class Document {
        public int rev;
        public String updatedAt;
        public JsonNode data;
    }
    public static class ScheduleException extends RuntimeException {
        public final int status;
        public final Document current;
        ScheduleException(int status, String message) { this(status, message, null); }
        ScheduleException(int status, String message, Document current) {
            super(message); this.status = status; this.current = current;
        }
    }
    @Autowired
    public ScheduleStore(@Value("${docs.data.dir:}") String dataDir, DataFiles files,
                         @Value("${docs.schedule.seed:schedule/default.json}") String seed) throws IOException {
        this(files.dir(dataDir), seed);
    }
    /** root = hasil DataFiles.dir; juga dapat dipakai pengujian di PC. */
    ScheduleStore(Path root) throws IOException {
        this(root, "schedule/default.json");
    }
    ScheduleStore(Path root, String seed) throws IOException {
        this.seed = seed;
        dir = root.toAbsolutePath().normalize().resolve("schedule");
        file = dir.resolve("schedule.json");
        Files.createDirectories(dir);
    }
    /** Role markers come from the configured seed, independently of edits to a saved schedule. */
    Set<String> fixedPicIds() throws IOException {
        if (fixedPics != null) return fixedPics;
        Set<String> ids = new LinkedHashSet<>();
        try (InputStream in = ScheduleStore.class.getClassLoader().getResourceAsStream(seed)) {
            if (in == null) throw new IOException("Seed tidak tersedia");
            for (JsonNode it : mapper.readTree(bounded(in)).path("items"))
                if ("STEM".equals(it.path("pic").asText())) ids.add(it.path("id").asText());
        }
        return fixedPics = Collections.unmodifiableSet(ids);
    }
    private static void require(boolean ok, String message) {
        if (!ok) throw new ScheduleException(400, message);
    }
    private static void text(JsonNode n, String field, int max) {
        require(n.has(field) && n.get(field).isTextual() && n.get(field).textValue().length() <= max,
                "Kolom " + field + " wajib berupa teks, maks " + max + " karakter.");
    }
    private static void date(JsonNode n, String field) {
        text(n, field, 10);
        String s = n.get(field).textValue();
        require(s.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}") && !s.startsWith("0000"), "Tanggal harus YYYY-MM-DD.");
        try { LocalDate.parse(s); }
        catch (DateTimeParseException e) { throw new ScheduleException(400, "Tanggal tidak valid: " + field); }
    }
    private static void fields(JsonNode n, String... allowed) {
        Set<String> keys = new HashSet<>(Arrays.asList(allowed));
        n.fieldNames().forEachRemaining(k -> require(keys.contains(k), "Kolom tidak dikenal: " + k));
    }
    static void validate(JsonNode data) {
        require(data != null && data.isObject(), "data wajib berupa objek.");
        fields(data, "project", "rules", "items");
        JsonNode project = data.path("project"), rules = data.path("rules"), items = data.path("items");
        require(project.isObject(), "project wajib berupa objek.");
        fields(project, "name", "goLiveDate"); text(project, "name", 200); date(project, "goLiveDate");
        require(rules.isArray() && rules.size() <= 20, "rules wajib berupa daftar (maks 20).");
        rules.forEach(r -> require(r.isTextual() && r.textValue().length() <= 2000, "Aturan terlalu panjang/tidak valid."));
        require(items.isArray() && items.size() > 0 && items.size() <= 200, "items wajib 1 sampai 200 kegiatan.");
        Set<String> ids = new HashSet<>();
        for (JsonNode item : items) {
            require(item.isObject(), "Kegiatan wajib berupa objek.");
            fields(item, "id", "section", "title", "startDate", "endDate", "status", "pic", "note", "group", "cutover", "cutoffDate", "handoverDate", "uploadDate", "handoverTime", "uploadTime");
            text(item, "id", 80); text(item, "section", 20); text(item, "title", 200);
            text(item, "status", 10); text(item, "pic", 200); text(item, "note", 2000);
            require(item.path("id").asText().matches("[a-zA-Z0-9_-]+") && ids.add(item.path("id").asText()), "ID tidak valid atau ganda.");
            require(!item.path("title").asText().trim().isEmpty(), "Judul wajib diisi.");
            require(Arrays.asList("milestone", "master", "training", "balance").contains(item.path("section").asText()), "Bagian tidak valid.");
            require(Arrays.asList("belum", "proses", "selesai").contains(item.path("status").asText()), "Status simpan hanya belum, proses, selesai. Telat dihitung UI.");
            date(item, "startDate"); date(item, "endDate");
            require(item.path("startDate").asText().compareTo(item.path("endDate").asText()) <= 0, "Tanggal mulai melewati tanggal akhir.");
            if (item.has("group")) text(item, "group", 20);
            if (item.has("cutover")) require(item.get("cutover").isBoolean(), "cutover harus boolean.");
            if ("balance".equals(item.path("section").asText())) {
                for (String key : Arrays.asList("cutoffDate", "handoverDate", "uploadDate")) date(item, key);
                require(item.path("cutoffDate").asText().compareTo(item.path("handoverDate").asText()) <= 0 && item.path("handoverDate").asText().compareTo(item.path("uploadDate").asText()) <= 0, "Urutan cut off, serah, upload tidak valid.");
                require(item.path("startDate").equals(item.path("cutoffDate")) && item.path("endDate").equals(item.path("uploadDate")), "Rentang balance harus mengikuti cut off dan upload.");
                for (String key : Arrays.asList("handoverTime", "uploadTime")) {
                    text(item, key, 11);
                    String time = item.path(key).asText();
                    require(time.isEmpty() || time.matches("(?:[01][0-9]|2[0-3]):[0-5][0-9](?:-(?:[01][0-9]|2[0-3]):[0-5][0-9])?"), "Jam harus HH:mm atau HH:mm-HH:mm.");
                    require(time.length() != 11 || time.substring(0,5).compareTo(time.substring(6)) <= 0, "Urutan jam tidak valid.");
                }
            } else {
                for (String key : Arrays.asList("cutoffDate", "handoverDate", "uploadDate", "handoverTime", "uploadTime")) require(!item.has(key), "Kolom balance tidak berlaku di bagian ini.");
            }
        }
    }
    private Document read() throws IOException {
        if (!Files.exists(file)) {
            try (InputStream in = ScheduleStore.class.getClassLoader().getResourceAsStream(seed)) {
                if (in == null) throw new IOException("Seed tidak tersedia");
                byte[] bytes = bounded(in);
                Document d = new Document(); d.data = mapper.readTree(bytes); validate(d.data);
                d.updatedAt = Instant.now().toString(); write(d); return d;
            }
        }
        try (InputStream in = Files.newInputStream(file)) {
            JsonNode n = mapper.readTree(bounded(in));
            if (n == null || !n.isObject() || !n.path("rev").isIntegralNumber() || !n.path("rev").canConvertToInt() || n.path("rev").asInt() < 0 || !n.path("updatedAt").isTextual()) throw new IOException("Dokumen tidak valid");
            Instant.parse(n.path("updatedAt").asText());
            validate(n.get("data"));
            return mapper.treeToValue(n, Document.class);
        } catch (IOException | RuntimeException e) {
            throw new ScheduleException(500, "Berkas schedule rusak/tidak terbaca dan tidak ditimpa. Hubungi administrator.");
        }
    }
    static byte[] bounded(InputStream in) throws IOException {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192]; int count;
        while ((count = in.read(buf)) != -1) {
            if (out.size() + count > MAX_BYTES) throw new ScheduleException(413, "Dokumen maks 256 KB.");
            out.write(buf, 0, count);
        }
        return out.toByteArray();
    }
    private void write(Document d) throws IOException {
        byte[] bytes = mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(d);
        if (bytes.length > MAX_BYTES) throw new ScheduleException(413, "Dokumen maks 256 KB termasuk metadata.");
        Path tmp = dir.resolve("schedule.json." + UUID.randomUUID() + ".tmp");
        try {
            Files.write(tmp, bytes, StandardOpenOption.CREATE_NEW);
            // Gagal tertutup bila filesystem tidak mendukung atomic move: berkas lama tetap utuh.
            Files.move(tmp, file, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } finally { Files.deleteIfExists(tmp); }
    }
    public Document get() {
        lock.lock();
        try { return read(); }
        catch (IOException e) { throw new ScheduleException(500, "Gagal membaca/menyiapkan schedule."); }
        finally { lock.unlock(); }
    }
    public Document put(Integer rev, JsonNode data) {
        require(rev != null && rev >= 0, "rev wajib bilangan bulat >= 0.");
        validate(data);
        lock.lock();
        try {
            Document current = read();
            if (rev != current.rev) throw new ScheduleException(409, "Jadwal sudah diubah pengguna lain. Salin perubahan lalu muat ulang.", current);
            if (current.rev == Integer.MAX_VALUE) throw new ScheduleException(500, "Batas revisi tercapai.");
            Document next = new Document(); next.rev = current.rev + 1;
            next.updatedAt = Instant.now().toString(); next.data = data.deepCopy();
            write(next); return next;
        } catch (IOException e) { throw new ScheduleException(500, "Gagal menyimpan schedule. Data lama dipertahankan."); }
        finally { lock.unlock(); }
    }
}
