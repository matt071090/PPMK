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
    private final CompanyProfile profile;
    private final SectionController section;
    private final ObjectMapper mapper = new ObjectMapper().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
            .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    public ScheduleController(ScheduleStore store, SetupAccessController access, ScheduleChatController chat, DataFiles files) { this(store,access,chat,files,null); }
    @org.springframework.beans.factory.annotation.Autowired
    public ScheduleController(ScheduleStore store, SetupAccessController access, ScheduleChatController chat, DataFiles files, SectionController section) {
        this.store=store;this.access=access;this.chat=chat;this.files=files;this.section=section;this.profile=new CompanyProfile(files);
    }
    /** Admin = Setup terbuka (otomatis di mode dev; di war setelah password Setup). Non-admin boleh mengubah PIC dan status; tanggal/catatan tetap admin. */
    @GetMapping("/access")
    public ResponseEntity<Map<String, Object>> access(HttpServletRequest request) throws IOException {
        Map<String, Object> result = new LinkedHashMap<>(); result.put("editable", access.unlocked(request));
        result.put("fixedPicIds", store.fixedPicIds());
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
        if (!access.unlocked(request) && !fixedPicsUnchanged(before, after, store.fixedPicIds()))
            throw new ScheduleStore.ScheduleException(403, "PIC kegiatan STEM dikunci. Perubahan PIC hanya lewat editor admin.");
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

    static boolean fixedPicsUnchanged(JsonNode before, JsonNode after, java.util.Set<String> fixed) {
        Map<String,String> old = new LinkedHashMap<>();
        for (JsonNode it : before.path("items")) old.put(it.path("id").asText(), it.path("pic").asText());
        for (JsonNode it : after.path("items")) {
            String id=it.path("id").asText(), was=old.get(id), now=it.path("pic").asText();
            if (fixed.contains(id) && !java.util.Objects.equals(was,now) && !("".equals(was) && "STEM".equals(now))) return false;
        }
        return true;
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

    /** Resolve only this company's configured directory; legacy PPMK values remain valid. */
    private String picLabel(String value) {
        String prefix=profile.group+":";
        if(!value.startsWith(prefix))return value.startsWith("PPMK:")?"PPMK · "+value.substring(5):value;
        String code=value.substring(prefix.length()),name=names().get(code);
        return profile.group+" · "+code+(name!=null&&!name.isEmpty()&&!name.equals(code)?" ("+name+")":"");
    }
    private Map<String,String> names() {
        if("file".equals(profile.source) && userNames!=null)return userNames;
        Map<String,String> out=new LinkedHashMap<>();
        try {
            if("file".equals(profile.source))try(java.io.InputStream in=getClass().getResourceAsStream("/static/data/"+profile.usersFile)) {
                if(in!=null)for(JsonNode u:mapper.readTree(in).path("users"))out.put(u.path("code").asText(),u.path("name").asText(""));
            }
            else if("sap".equals(profile.source) && section!=null) {
                Map<?,?> table=(Map<?,?>)((Map<?,?>)section.section("users",null).get("results")).get("users");
                java.util.List<?> cols=(java.util.List<?>)table.get("columns"),rows=(java.util.List<?>)table.get("rows");
                int ci=cols.indexOf("USER_CODE"),ni=cols.indexOf("U_NAME"),li=cols.indexOf("Locked");
                if(ci>=0&&ni>=0&&li>=0)for(Object value:rows) {
                    java.util.List<?> row=(java.util.List<?>)value;String code=String.valueOf(row.get(ci));
                    if("N".equals(row.get(li))&&!profile.excludedUsers().contains(code.toUpperCase(java.util.Locale.ROOT)))out.put(code,row.get(ni)==null?code:String.valueOf(row.get(ni)));
                }
            }
        } catch(Exception e) { /* Directory unavailable: keep literal code/free text, never borrow another company. */ }
        if("file".equals(profile.source))userNames=out;
        return out;
    }
}
