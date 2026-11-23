package com.stem.cvppmk.docs;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import javax.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import java.io.IOException;

@RestController
@RequestMapping("/api/schedule")
public class ScheduleController {
    private final ScheduleStore store;
    private final SetupAccessController access;
    private final ScheduleChatController chat;
    private final DataFiles files;
    private volatile Map<String, String> userNames;
    private final ObjectMapper mapper = new ObjectMapper().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    public ScheduleController(ScheduleStore store, SetupAccessController access, ScheduleChatController chat, DataFiles files) { this.store = store; this.access = access; this.chat = chat; this.files = files; }
    /** Admin = Setup terbuka (otomatis di mode dev; di war setelah password Setup). Non-admin boleh mengubah PIC dan status; tanggal/catatan tetap admin. */
    @GetMapping("/access")
    public ResponseEntity<Map<String, Object>> access(HttpServletRequest request) {
        Map<String, Object> result = new LinkedHashMap<>(); result.put("editable", access.unlocked(request));
        return ok(result);
    }
    @GetMapping
    public ResponseEntity<ScheduleStore.Document> get() { return ok(store.get()); }
    @GetMapping("/export")
    public ResponseEntity<ScheduleStore.Document> export() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .header("Content-Disposition", "attachment; filename=\"" + files.filename("schedule.json") + "\"").body(store.get());
    }
    @PutMapping(consumes = "application/json")
    public ResponseEntity<ScheduleStore.Document> put(HttpServletRequest request) throws IOException {
        if (request.getContentLengthLong() > ScheduleStore.MAX_BYTES)
            throw new ScheduleStore.ScheduleException(413, "Dokumen maks 256 KB.");
        JsonNode body;
        try { body = mapper.readTree(ScheduleStore.bounded(request.getInputStream())); }
        catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new ScheduleStore.ScheduleException(400, "JSON tidak valid atau memiliki kunci ganda.");
        }
        if (body == null || !body.isObject() || body.size() != 2 || !body.has("data") || !body.path("rev").isIntegralNumber() || !body.path("rev").canConvertToInt())
            throw new ScheduleStore.ScheduleException(400, "Isi harus {rev: bilangan bulat, data: objek}.");
        JsonNode before = store.get().data, after = body.get("data");
        // mode lihat (bukan admin): hanya PIC dan status kegiatan yang boleh berubah; tanggal, jam, catatan, judul = admin
        if (!access.unlocked(request) && !onlyPicStatusChanged(before, after))
            throw new ScheduleStore.ScheduleException(403, "Mode lihat saja hanya boleh mengubah PIC dan status. Tanggal dan catatan diubah admin (Masuk admin).");
        ScheduleStore.Document saved = store.put(body.get("rev").intValue(), after);
        logPicChanges(before, saved.data, editorOf(request));
        return ok(saved);
    }
    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }
    @ExceptionHandler(ScheduleStore.ScheduleException.class)
    public ResponseEntity<Map<String, Object>> error(ScheduleStore.ScheduleException e) {
        Map<String, Object> result = new LinkedHashMap<>(); result.put("message", e.getMessage());
        if (e.current != null) result.put("current", e.current);
        return ResponseEntity.status(e.status).cacheControl(CacheControl.noStore()).body(result);
    }
    @ExceptionHandler(IOException.class)
    public ResponseEntity<Map<String, Object>> io(IOException e) {
        return error(new ScheduleStore.ScheduleException(500, "Gagal membaca/menulis schedule. Hubungi administrator."));
    }

    /** Sama persis kecuali field pic/status per kegiatan (urutan & id kegiatan tidak boleh berubah). */
    static boolean onlyPicStatusChanged(JsonNode before, JsonNode after) {
        if (before == null || after == null || !before.isObject() || !after.isObject()) return false;
        com.fasterxml.jackson.databind.node.ObjectNode a = ((com.fasterxml.jackson.databind.node.ObjectNode) before).deepCopy(), b = ((com.fasterxml.jackson.databind.node.ObjectNode) after).deepCopy();
        JsonNode ia = a.get("items"), ib = b.get("items");
        if (ia == null || ib == null || !ia.isArray() || !ib.isArray() || ia.size() != ib.size()) return false;
        for (int i = 0; i < ia.size(); i++) {
            if (!ia.get(i).isObject() || !ib.get(i).isObject()) return false;
            ((com.fasterxml.jackson.databind.node.ObjectNode) ia.get(i)).remove(java.util.Arrays.asList("pic", "status"));
            ((com.fasterxml.jackson.databind.node.ObjectNode) ib.get(i)).remove(java.util.Arrays.asList("pic", "status"));
        }
        return a.equals(b);
    }

    /** Nama pengubah dari header X-Editor (URL-encoded oleh browser); kosong = "Tanpa nama". */
    private static String editorOf(HttpServletRequest request) {
        String h = request.getHeader("X-Editor");
        try { h = h == null ? "" : java.net.URLDecoder.decode(h, "UTF-8").trim(); } catch (Exception e) { h = ""; }
        if (h.length() > ScheduleChatController.MAX_NAME) h = h.substring(0, ScheduleChatController.MAX_NAME);
        return h.isEmpty() ? "Tanpa nama" : h;
    }

    /** Setiap PIC kegiatan yang berubah dicatat sebagai pesan otomatis (kind=pic) di chat kegiatan itu. Gagal mencatat tidak membatalkan simpan. */
    private void logPicChanges(JsonNode before, JsonNode after, String editor) {
        Map<String, String> old = new LinkedHashMap<>();
        if (before != null && before.path("items").isArray()) for (JsonNode it : before.path("items")) old.put(it.path("id").asText(), it.path("pic").asText(""));
        if (after == null || !after.path("items").isArray()) return;
        for (JsonNode it : after.path("items")) {
            String id = it.path("id").asText(), now = it.path("pic").asText(""), was = old.getOrDefault(id, "");
            if (id.isEmpty() || now.equals(was)) continue;
            String text = now.isEmpty() ? "Menghapus PIC (sebelumnya " + picLabel(was) + ")."
                    : was.isEmpty() ? "Menetapkan PIC: " + picLabel(now) + "."
                    : "Mengganti PIC dari " + picLabel(was) + " ke " + picLabel(now) + ".";
            try { chat.append("item:" + id, editor, text, "pic"); }
            catch (Exception e) { org.slf4j.LoggerFactory.getLogger(ScheduleController.class).warn("Catatan PIC {} gagal ditulis ke chat: {}", id, e.getMessage()); }
        }
    }

    /** "STEM" | "PPMK · AP-STF1 (Fatma)" memakai static/data/ppmk-users.json; nilai lain apa adanya. */
    private String picLabel(String v) {
        if (!v.startsWith("PPMK:")) return v;
        String code = v.substring(5), name = names().get(code);
        return "PPMK · " + code + (name != null && !name.isEmpty() && !name.equals(code) ? " (" + name + ")" : "");
    }

    private Map<String, String> names() {
        Map<String, String> n = userNames;
        if (n != null) return n;
        n = new LinkedHashMap<>();
        try (java.io.InputStream in = getClass().getResourceAsStream("/static/data/ppmk-users.json")) {
            if (in != null) for (JsonNode u : mapper.readTree(in).path("users")) n.put(u.path("code").asText(), u.path("name").asText(""));
        } catch (IOException e) { /* tanpa nama: cukup username */ }
        return userNames = n;
    }
}
