package com.stem.cvppmk.docs;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.DeserializationFeature;
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
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.locks.ReentrantLock;

/**
 * Status cek manual per query (Belum / Cocok / Selisih / Perlu perbaikan) + catatan teks, di satu berkas
 * {docs.data.dir}/countdoc/queries/checks.json. Meniru CountDocPivotStore: tulis .tmp unik lalu ATOMIC_MOVE di dalam lock,
 * rev per item (rev lama = 409), batas ukuran. Hanya status+catatan yang disimpan, bukan angka hasil query.
 */
@Component
public class CountDocCheckStore {
    public static final int MAX_NOTE = 1000;
    public static final int MAX_FILE_BYTES = 256 * 1024;
    public static final Set<String> STATUSES = Collections.unmodifiableSet(new HashSet<>(Arrays.asList("belum", "cocok", "selisih", "perlu_perbaikan")));

    /** Kesalahan yang aman dikirim ke klien; current terisi untuk 409. */
    public static class CheckException extends RuntimeException {
        public final int status;
        public final Item current;

        public CheckException(int status, String message) { this(status, message, null); }

        public CheckException(int status, String message, Item current) { super(message); this.status = status; this.current = current; }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Item {
        public String status = "belum", note = "", updatedAt;
        public int rev;
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    static class Doc {
        public int v = 1;
        public Map<String, Item> items = new LinkedHashMap<>();
    }

    private final ObjectMapper mapper = new ObjectMapper().configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    private final ReentrantLock lock = new ReentrantLock();
    private final Path dir, file;

    @Autowired
    public CountDocCheckStore(@Value("${docs.data.dir:}") String dataDir, DataFiles files) throws IOException {
        this(files.dir(dataDir).resolve("countdoc"));
    }

    /** Dipakai tes: root = folder countdoc. */
    CountDocCheckStore(Path root) throws IOException {
        this.dir = root.toAbsolutePath().normalize().resolve("queries");
        this.file = dir.resolve("checks.json");
        Files.createDirectories(dir);
    }

    private Doc read() {
        if (!Files.exists(file)) return new Doc();
        try {
            Doc d = mapper.readValue(Files.readAllBytes(file), Doc.class);
            if (d == null || d.items == null) throw new IOException("kosong");
            return d;
        } catch (IOException e) {
            // gagal terlihat: jangan menimpa berkas yang rusak
            throw new CheckException(500, "Berkas status cek rusak dan tidak ditimpa. Hubungi administrator.");
        }
    }

    public Map<String, Item> all() {
        lock.lock();
        try { return read().items; } finally { lock.unlock(); }
    }

    static String cleanNote(String note) {
        if (note == null) return "";
        String s = note.replace("\r\n", "\n").replace('\r', '\n').replaceAll("[\\p{Cntrl}&&[^\n\t]]", "").trim();
        if (s.length() > MAX_NOTE) throw new CheckException(400, "Catatan terlalu panjang (maks " + MAX_NOTE + " karakter).");
        return s;
    }

    /** Tulis seluruh dokumen: .tmp unik lalu ATOMIC_MOVE. Dipanggil di dalam lock. */
    private void write(Doc d) throws IOException {
        byte[] bytes = mapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(d);
        if (bytes.length > MAX_FILE_BYTES) throw new CheckException(413, "Berkas status cek terlalu besar. Persingkat catatan.");
        Path tmp = dir.resolve("checks.json." + UUID.randomUUID().toString().replace("-", "") + ".tmp");
        try {
            Files.write(tmp, bytes);
            try { Files.move(tmp, file, StandardCopyOption.ATOMIC_MOVE); }
            catch (AtomicMoveNotSupportedException e) { Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING); }
        } finally { Files.deleteIfExists(tmp); }
    }

    /** Hapus status cek satu query (dipanggil saat query buatan dihapus). Tidak ada = tidak melakukan apa-apa. */
    public void remove(String id) {
        lock.lock();
        try {
            Doc d = read();
            if (d.items.remove(id) != null) write(d);
        } catch (IOException e) {
            throw new CheckException(500, "Gagal menyimpan status cek.");
        } finally { lock.unlock(); }
    }

    /** Simpan status+catatan satu query. id harus sudah divalidasi pemanggil terhadap manifest. rev = rev item yang dilihat klien (0 bila belum pernah disimpan). */
    public Item put(String id, Integer rev, String status, String note) {
        if (status == null || !STATUSES.contains(status)) throw new CheckException(400, "Status harus salah satu dari: belum, cocok, selisih, perlu_perbaikan.");
        if (rev == null || rev < 0) throw new CheckException(400, "Nilai rev wajib diisi (0 bila belum pernah disimpan).");
        String n = cleanNote(note);
        lock.lock();
        try {
            Doc d = read();
            Item cur = d.items.get(id);
            int curRev = cur == null ? 0 : cur.rev;
            if (rev != curRev) throw new CheckException(409, "Status cek ini sudah diubah orang lain. Muat ulang lalu simpan lagi.", cur == null ? new Item() : cur);
            Item it = new Item();
            it.status = status; it.note = n; it.rev = curRev + 1; it.updatedAt = LocalDateTime.now().withNano(0).toString();
            d.items.put(id, it);
            write(d);
            return it;
        } catch (IOException e) {
            throw new CheckException(500, "Gagal menyimpan status cek.");
        } finally { lock.unlock(); }
    }
}
