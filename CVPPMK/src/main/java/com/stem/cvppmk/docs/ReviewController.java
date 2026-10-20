package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.info.BuildProperties;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * Review manual per halaman: status (sesuai / belum sesuai / belum direview), catatan, dan exclusion temuan otomatis.
 * Semua perubahan dicatat sebagai log CSV (waktu, editor, halaman, aksi, nilai lama → baru); state terkini dihitung dari log itu.
 * - File log per build: {docs.data.dir}/review-log-{waktu build}.csv. Build baru = file baru (kosong), file build lama dihapus saat start.
 * - docs.data.dir default: {catalina.base}/data/cvppmk di Tomcat, ./review-data saat dijalankan dari VS Code
 *   (bukan ./data: di Windows sama dengan folder DATA berisi data klien).
 * - Edit review boleh di war juga (user client menyatakan data sudah sesuai), wajib nama editor.
 * Remarks (catatan project internal STEM) hanya di mode dev, disimpan di docs.remarks.file (default ./remarks.json).
 */
@RestController
@RequestMapping("/api/review")
public class ReviewController {
    private static final Logger log = LoggerFactory.getLogger(ReviewController.class);
    private static final String[] COLS = {"at", "editor", "page", "action", "key", "from", "to", "note"};
    private static final Set<String> ACTIONS = new HashSet<>(Arrays.asList("status", "note", "exclude", "restore"));
    private static final Set<String> STATUS = new HashSet<>(Arrays.asList("ok", "nok", "none"));
    private static final Pattern PAGE_ID = Pattern.compile("[a-z0-9-]{1,80}");
    private static final DateTimeFormatter AT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final Path logFile, remarksFile;
    private final boolean editable;
    private final List<Map<String, String>> events = new ArrayList<>();
    private final ObjectMapper json = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

    public ReviewController(@Value("${docs.data.dir:}") String dataDir,
                            @Value("${docs.remarks.file:remarks.json}") String remarksFile,
                            @Value("${docs.edit.enabled:true}") boolean editable,
                            ObjectProvider<BuildProperties> build) throws IOException {
        Path dir = dataDir.isEmpty()
                ? (System.getProperty("catalina.base") != null ? Paths.get(System.getProperty("catalina.base"), "data", "cvppmk") : Paths.get("review-data"))
                : Paths.get(dataDir);
        dir = dir.toAbsolutePath();
        BuildProperties b = build.getIfAvailable();
        String buildId = b != null && b.getTime() != null ? String.valueOf(b.getTime().toEpochMilli()) : "dev";
        this.logFile = dir.resolve("review-log-" + buildId + ".csv");
        this.remarksFile = Paths.get(remarksFile).toAbsolutePath();
        this.editable = editable;

        Files.createDirectories(dir);
        // review dikosongkan setiap build: log milik build lain dihapus
        try (Stream<Path> old = Files.list(dir)) {
            old.filter(p -> p.getFileName().toString().matches("review-log-.*\\.csv") && !p.equals(logFile)).forEach(p -> {
                try { Files.delete(p); log.info("Log review build lama dihapus: {}", p); } catch (IOException e) { log.warn("Gagal hapus {}: {}", p, e.getMessage()); }
            });
        }
        if (Files.exists(logFile)) {
            List<List<String>> rows = parseCsv(new String(Files.readAllBytes(logFile), StandardCharsets.UTF_8));
            for (List<String> r : rows.subList(Math.min(1, rows.size()), rows.size())) {   // baris 1 = header
                Map<String, String> e = new LinkedHashMap<>();
                for (int i = 0; i < COLS.length; i++) e.put(COLS[i], i < r.size() ? r.get(i) : "");
                events.add(e);
            }
        }
        log.info("Log review: {} ({} perubahan)", logFile, events.size());
    }

    @GetMapping("/mode")
    public Map<String, Object> mode() {
        return Collections.singletonMap("editable", editable);
    }

    /** State terkini: {pages: {id: {status, note, at, by}}, exclusions: {key: {page, msg, reason, at, by}}}. */
    @GetMapping
    public synchronized Map<String, Object> get() {
        Map<String, Map<String, Object>> pages = new LinkedHashMap<>(), exclusions = new LinkedHashMap<>();
        for (Map<String, String> e : events) {
            String page = e.get("page"), action = e.get("action");
            if ("status".equals(action) || "note".equals(action)) {
                Map<String, Object> p = pages.computeIfAbsent(page, k -> new LinkedHashMap<>());
                if ("status".equals(action)) { if ("none".equals(e.get("to"))) p.remove("status"); else p.put("status", e.get("to")); }
                else { if (e.get("to").isEmpty()) p.remove("note"); else p.put("note", e.get("to")); }
                p.put("at", e.get("at"));
                p.put("by", e.get("editor"));
            } else if ("exclude".equals(action)) {
                Map<String, Object> x = new LinkedHashMap<>();
                x.put("page", page);
                x.put("msg", msgOf(e.get("key")));
                x.put("reason", e.get("note"));
                x.put("at", e.get("at"));
                x.put("by", e.get("editor"));
                exclusions.put(e.get("key"), x);
            } else if ("restore".equals(action)) exclusions.remove(e.get("key"));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("pages", pages);
        out.put("exclusions", exclusions);
        return out;
    }

    /** Riwayat perubahan satu halaman, terbaru di atas. */
    @GetMapping("/log")
    public synchronized List<Map<String, String>> history(@RequestParam String page) {
        List<Map<String, String>> out = new ArrayList<>();
        for (Map<String, String> e : events) if (page.equals(e.get("page"))) out.add(e);
        Collections.reverse(out);
        return out;
    }

    /**
     * Satu perubahan: {editor, page, action: status|note|exclude|restore, key (temuan, untuk exclude/restore), value, note (alasan exclude)}.
     * Waktu diambil dari server, nilai lama dari state saat ini. Hasil: state terkini (sama dengan GET).
     */
    @PostMapping("/event")
    @SuppressWarnings("unchecked")
    public synchronized Map<String, Object> event(@RequestBody Map<String, String> body) throws IOException {
        String editor = trim(body.get("editor")), page = trim(body.get("page")), action = trim(body.get("action"));
        String key = trim(body.get("key")), value = trim(body.get("value")), note = trim(body.get("note"));
        if (editor.isEmpty()) throw bad("Nama editor wajib diisi.");
        if (editor.length() > 60) throw bad("Nama editor maksimal 60 karakter.");
        if (!PAGE_ID.matcher(page).matches()) throw bad("Halaman tidak dikenal.");
        if (!ACTIONS.contains(action)) throw bad("Aksi tidak dikenal.");

        Map<String, Object> state = get();
        Map<String, Object> p = (Map<String, Object>) ((Map<String, Object>) state.get("pages")).getOrDefault(page, Collections.emptyMap());
        Map<String, Object> ex = (Map<String, Object>) state.get("exclusions");
        String from = "";
        if ("status".equals(action)) {
            if (!STATUS.contains(value)) throw bad("Status tidak dikenal.");
            from = String.valueOf(p.getOrDefault("status", "none"));
        } else if ("note".equals(action)) {
            from = String.valueOf(p.getOrDefault("note", ""));
        } else {
            if (key.isEmpty() || !key.startsWith(page + "|")) throw bad("Temuan tidak dikenal.");
            if ("exclude".equals(action)) {
                if (note.isEmpty()) throw bad("Alasan exclusion wajib diisi.");
                if (ex.containsKey(key)) return state;
            } else if (!ex.containsKey(key)) return state;
            value = "";
        }
        if (("status".equals(action) || "note".equals(action)) && from.equals(value)) return state;   // tidak ada perubahan

        Map<String, String> e = new LinkedHashMap<>();
        e.put("at", LocalDateTime.now().format(AT));
        e.put("editor", editor);
        e.put("page", page);
        e.put("action", action);
        e.put("key", key);
        e.put("from", from);
        e.put("to", value);
        e.put("note", note);
        append(e);
        events.add(e);
        log.info("Review {} {} {} oleh {}", page, action, value, editor);
        return get();
    }

    // ---------- Remarks (mode dev) ----------
    @GetMapping("/remarks")
    @SuppressWarnings("unchecked")
    public synchronized Map<String, Object> remarks() throws IOException {
        if (!editable || !Files.exists(remarksFile)) return Collections.emptyMap();
        return json.readValue(remarksFile.toFile(), Map.class);
    }

    @PutMapping("/remarks")
    public synchronized Map<String, Object> putRemarks(@RequestBody Map<String, Object> body) throws IOException {
        if (!editable) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Remarks hanya bisa diubah di mode dev");
        // tulis ke file sementara dulu supaya file lama tidak rusak kalau proses berhenti di tengah
        Path tmp = remarksFile.resolveSibling(remarksFile.getFileName() + ".tmp");
        json.writeValue(tmp.toFile(), body);
        Files.move(tmp, remarksFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        return body;
    }

    // ---------- CSV ----------
    private void append(Map<String, String> e) throws IOException {
        boolean fresh = !Files.exists(logFile);
        try (BufferedWriter w = Files.newBufferedWriter(logFile, StandardCharsets.UTF_8, StandardOpenOption.CREATE, StandardOpenOption.APPEND)) {
            if (fresh) w.write("﻿" + csvLine(Arrays.asList(COLS)));   // BOM: supaya Excel membaca UTF-8
            List<String> row = new ArrayList<>();
            for (String c : COLS) row.add(e.get(c));
            w.write(csvLine(row));
        }
    }

    private static String csvLine(List<String> row) {
        StringBuilder sb = new StringBuilder();
        for (String v : row) sb.append(sb.length() == 0 ? "" : ",").append('"').append(v == null ? "" : v.replace("\"", "\"\"")).append('"');
        return sb.append("\r\n").toString();
    }

    // CSV standar: field ber-kutip boleh berisi koma, "" dan baris baru
    private static List<List<String>> parseCsv(String s) {
        if (s.startsWith("﻿")) s = s.substring(1);
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder f = new StringBuilder();
        boolean q = false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (q) {
                if (c == '"' && i + 1 < s.length() && s.charAt(i + 1) == '"') { f.append('"'); i++; }
                else if (c == '"') q = false;
                else f.append(c);
            } else if (c == '"') q = true;
            else if (c == ',') { row.add(f.toString()); f.setLength(0); }
            else if (c == '\n') { row.add(f.toString()); f.setLength(0); rows.add(row); row = new ArrayList<>(); }
            else if (c != '\r') f.append(c);
        }
        if (f.length() > 0 || !row.isEmpty()) { row.add(f.toString()); rows.add(row); }
        return rows;
    }

    // key temuan = "{page}|{tipe}|{pesan}" (lihat exKey di app.js)
    private static String msgOf(String key) {
        String[] p = key.split("\\|", 3);
        return p.length == 3 ? p[2] : key;
    }

    // pesan validasi dikirim ke browser sebagai {message} (default Spring Boot menyembunyikan pesan error)
    @ExceptionHandler(ResponseStatusException.class)
    public org.springframework.http.ResponseEntity<Map<String, String>> error(ResponseStatusException e) {
        return org.springframework.http.ResponseEntity.status(e.getStatus()).body(Collections.singletonMap("message", e.getReason()));
    }

    private static String trim(String s) {
        return s == null ? "" : s.trim();
    }

    private static ResponseStatusException bad(String msg) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, msg);
    }
}
