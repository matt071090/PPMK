package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import javax.annotation.PostConstruct;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.locks.ReentrantLock;
import java.util.regex.Pattern;

/**
 * Chat ringan per "thread" (mis. umum, tab:master, item:master-A0, page:coa). Dipakai halaman Schedule; thread bebas selama
 * cocok pola, jadi modul lain bisa memakai API yang sama.
 * - Penyimpanan: {docs.data.dir}/schedule/chat.jsonl, satu JSON per baris, HANYA ditambah (append) di dalam lock, tidak pernah ditimpa.
 *   Baris rusak dilewati (dicatat di log), berkas tidak dimodifikasi.
 * - Batas: teks 1000 karakter, nama 60, thread 60, 5000 pesan total, 4 KB per permintaan.
 * - Tanpa login: nama pengirim diketik user (sama seperti editor di Review) dan HANYA penanda, bukan bukti identitas.
 * - Teks disimpan apa adanya; tampilan WAJIB meng-escape (UI memakai textContent/esc).
 */


public abstract class ChatControllerSupport {
    private static final Logger log = LoggerFactory.getLogger(ChatControllerSupport.class);
    static final int MAX_TEXT = 1000, MAX_NAME = 60, MAX_MESSAGES = 5000, MAX_BODY = 4096, PAGE = 200;
    private static final Pattern THREAD = Pattern.compile("[A-Za-z0-9:_-]{1,60}");

    private final Path file;
    private final ObjectMapper json = new ObjectMapper();
    private final ReentrantLock lock = new ReentrantLock();
    private final List<Map<String, Object>> messages = new ArrayList<>();
    private long seq = 0;

    protected ChatControllerSupport(String dataDir, String area, DataFiles files) throws IOException {
        Path dir = files.dir(dataDir).resolve(area);
        Files.createDirectories(dir);
        this.file = dir.resolve("chat.jsonl");
    }

    @PostConstruct
    void load() throws IOException {
        if (!Files.exists(file)) return;
        int bad = 0;
        for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
            if (line.trim().isEmpty()) continue;
            try {
                @SuppressWarnings("unchecked") Map<String, Object> m = json.readValue(line, LinkedHashMap.class);
                Object id = m.get("id");
                if (!(id instanceof Number) || !(m.get("thread") instanceof String) || !(m.get("text") instanceof String)) { bad++; continue; }
                messages.add(m);
                seq = Math.max(seq, ((Number) id).longValue());
            } catch (IOException e) { bad++; }
        }
        if (bad > 0) log.warn("Chat Schedule: {} baris rusak dilewati di {}", bad, file);
    }

    /** Pesan sebuah thread dengan id > after (default 0), paling lama dulu, maks PAGE terbaru. */
    @GetMapping
    public ResponseEntity<Map<String, Object>> list(@RequestParam String thread, @RequestParam(defaultValue = "0") long after) {
        checkThread(thread);
        List<Map<String, Object>> out = new ArrayList<>();
        lock.lock();
        try {
            for (Map<String, Object> m : messages)
                if (thread.equals(m.get("thread")) && ((Number) m.get("id")).longValue() > after) out.add(m);
        } finally { lock.unlock(); }
        if (out.size() > PAGE) out = new ArrayList<>(out.subList(out.size() - PAGE, out.size()));
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("messages", out);
        return noStore(res);
    }

    /** Pesan terbaru dari semua thread (paling baru dulu), untuk halaman Home. limit 1..20. */
    @GetMapping("/latest")
    public ResponseEntity<Map<String, Object>> latest(@RequestParam(defaultValue = "5") int limit) {
        int n = Math.max(1, Math.min(20, limit));
        List<Map<String, Object>> out = new ArrayList<>();
        lock.lock();
        try {
            for (int i = messages.size() - 1; i >= 0 && out.size() < n; i--) out.add(messages.get(i));
        } finally { lock.unlock(); }
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("messages", out);
        return noStore(res);
    }

    /** Ringkasan semua thread: {thread: {count, lastId, lastAt}} untuk lencana jumlah pesan. */
    @GetMapping("/summary")
    public ResponseEntity<Map<String, Object>> summary() {
        Map<String, Map<String, Object>> t = new TreeMap<>();
        lock.lock();
        try {
            for (Map<String, Object> m : messages) {
                Map<String, Object> s = t.get((String) m.get("thread"));
                if (s == null) { s = new LinkedHashMap<>(); s.put("count", 0); t.put((String) m.get("thread"), s); }
                s.put("count", (Integer) s.get("count") + 1);
                s.put("lastId", m.get("id")); s.put("lastAt", m.get("at"));
            }
        } finally { lock.unlock(); }
        Map<String, Object> res = new LinkedHashMap<>();
        res.put("threads", t);
        return noStore(res);
    }

    @PostMapping(consumes = "application/json")
    public ResponseEntity<Map<String, Object>> post(@RequestBody Map<String, Object> body,
                                                     @RequestHeader(value = "Content-Length", defaultValue = "0") long len) throws IOException {
        if (len > MAX_BODY) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Pesan terlalu besar.");
        return noStore(append(str(body.get("thread")), str(body.get("editor")), str(body.get("text")), null));
    }

    /**
     * Tambah satu pesan (dipakai POST chat dan Schedule saat PIC berubah). kind: null = pesan biasa, "pic" = catatan otomatis penetapan PIC.
     * Validasi sama dengan POST; pesan ditulis append-only di dalam lock.
     */
    public Map<String, Object> append(String thread, String editor, String text, String kind) throws IOException {
        editor = editor == null ? "" : editor.trim(); text = text == null ? "" : text.trim();
        checkThread(thread);
        if (editor.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Isi nama dulu.");
        if (editor.length() > MAX_NAME) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nama maks " + MAX_NAME + " karakter.");
        if (text.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pesan kosong.");
        if (text.length() > MAX_TEXT) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Pesan maks " + MAX_TEXT + " karakter.");
        lock.lock();
        try {
            if (messages.size() >= MAX_MESSAGES) throw new ResponseStatusException(HttpStatus.INSUFFICIENT_STORAGE, "Penyimpanan chat penuh. Hubungi administrator.");
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", seq + 1); m.put("at", Instant.now().toString()); m.put("thread", thread); m.put("editor", editor); m.put("text", text);
            if (kind != null) m.put("kind", kind);
            String line = json.writeValueAsString(m) + "\n";   // satu baris: newline di dalam teks di-escape oleh Jackson
            Files.write(file, line.getBytes(StandardCharsets.UTF_8), StandardOpenOption.CREATE, StandardOpenOption.APPEND);
            seq++; messages.add(m);
            return m;
        } finally { lock.unlock(); }
    }

    private static String str(Object o) { return o instanceof String ? (String) o : ""; }

    private static void checkThread(String thread) {
        if (thread == null || !THREAD.matcher(thread).matches())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nama thread tidak valid.");
    }

    private static <T> ResponseEntity<T> noStore(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
}
