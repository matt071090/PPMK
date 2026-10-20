package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.*;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Bab 7 Addon: daftar objek add-on dibaca dinamis dari DB, bukan daftar tetap.
 * - Isi bab: UDO Master Data (OUDO.TYPE 1) + UDT yang bukan bagian UDO (OUTB.ObjectType 0 / 5 = No Object)
 *   + UDO Document (TYPE 3) yang di mapping ditandai sebagai master data. Child table UDO tampil di halaman UDO-nya.
 * - Mapping add-on (sub kategori, judul, hide, anggap master) di docs.addon.mapping (default ./addon-mapping.json),
 *   diedit dari menu Setup (mode dev) dan dibundel ke war (read-only di server).
 * - Data halaman: isi tabel apa adanya (kolom kunci + semua UDF dari CUFD, lihat UdfExpander), maksimal MAX_ROWS baris per tabel.
 */
@RestController
@RequestMapping("/api/addon")
public class AddonController {
    private static final Pattern SAFE = Pattern.compile("[A-Za-z0-9_]{1,50}");
    private static final int MAX_ROWS = 5000;
    // kolom kunci per OUTB.ObjectType: 0/5 No Object, 1 Master Data, 2 Master Data Lines, 3 Document, 4 Document Lines
    private static final Map<String, String[]> KEYS = new HashMap<>();
    static {
        KEYS.put("0", new String[]{"Code", "Name"});
        KEYS.put("5", new String[]{"Code", "Name"});
        KEYS.put("1", new String[]{"Code", "Name"});
        KEYS.put("2", new String[]{"Code", "LineId"});
        KEYS.put("3", new String[]{"DocEntry", "DocNum"});
        KEYS.put("4", new String[]{"DocEntry", "LineId"});
    }

    private final JdbcTemplate jdbc;
    private final UdfExpander udf;
    private final SectionController section;
    private final Path mappingFile;
    private final boolean editable;
    private final ObjectMapper json = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

    public AddonController(JdbcTemplate jdbc, UdfExpander udf, SectionController section,
                           @Value("${docs.addon.mapping:addon-mapping.json}") String mappingFile,
                           @Value("${docs.edit.enabled:true}") boolean editable) {
        this.jdbc = jdbc;
        this.udf = udf;
        this.section = section;
        this.mappingFile = Paths.get(mappingFile).toAbsolutePath();
        this.editable = editable;
    }

    /** Semua UDO/UDT di DB + mapping-nya: {objects: [...], categories: [...], stale: [kode mapping yang tidak ada di DB], editable}. */
    @GetMapping("/objects")
    @SuppressWarnings("unchecked")
    public Map<String, Object> objects() throws IOException {
        Map<String, Object> mapping = mapping();
        Map<String, Map<String, Object>> maps = (Map<String, Map<String, Object>>) mapping.getOrDefault("objects", Collections.emptyMap());
        List<Map<String, Object>> list = objectList(maps);
        Set<String> cats = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        for (Object c : (List<Object>) mapping.getOrDefault("categories", Collections.emptyList())) if (c != null && !c.toString().trim().isEmpty()) cats.add(c.toString().trim());
        Set<String> codes = new HashSet<>();
        for (Map<String, Object> o : list) {
            codes.add((String) o.get("code"));
            if (o.get("cat") != null) cats.add((String) o.get("cat"));
        }
        List<String> stale = new ArrayList<>();
        for (String k : maps.keySet()) if (!codes.contains(k)) stale.add(k);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("objects", list);
        out.put("categories", new ArrayList<>(cats));
        out.put("stale", stale);
        out.put("editable", editable);
        return out;
    }

    /** Isi tabel header + child satu objek: {generatedAt, object, results: {namaTabel: {columns, rows, udf, truncated}}}. */
    @GetMapping("/data/{code:[A-Za-z0-9_]+}")
    @SuppressWarnings("unchecked")
    public Map<String, Object> data(@PathVariable String code) throws IOException {
        Map<String, Map<String, Object>> maps = (Map<String, Map<String, Object>>) mapping().getOrDefault("objects", Collections.emptyMap());
        Map<String, Object> obj = null;
        for (Map<String, Object> o : objectList(maps)) if (code.equals(o.get("code"))) obj = o;
        if (obj == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Objek add-on " + code + " tidak ada di DB company ini.");
        Map<String, Object> results = new LinkedHashMap<>();
        for (Map<String, Object> t : (List<Map<String, Object>>) obj.get("tables")) {
            String name = (String) t.get("name");
            String[] keys = KEYS.getOrDefault(String.valueOf(t.get("type")), KEYS.get("0"));
            String sql = "SELECT T.\"" + keys[0] + "\", T.\"" + keys[1] + "\" /*@udf-cols @" + name + " T*/ FROM \"@" + name + "\" T"
                    + " /*@udf-joins @" + name + " T*/ ORDER BY T.\"" + keys[0] + "\", T.\"" + keys[1] + "\" LIMIT " + (MAX_ROWS + 1);
            UdfExpander.Expanded ex;
            try {
                ex = udf.expand(sql);
            } catch (DataAccessException e) {
                results.put(name, Collections.singletonMap("error", "Metadata UDF: " + e.getMostSpecificCause().getMessage()));
                continue;
            }
            Map<String, Object> res = section.run(name, ex.sql);
            if (!res.containsKey("error")) {
                List<?> rows = (List<?>) res.get("rows");
                if (rows.size() > MAX_ROWS) { rows.remove(MAX_ROWS); res.put("truncated", MAX_ROWS); }
                if (!ex.udf.isEmpty()) res.put("udf", ex.udf);
            }
            results.put(name, res);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("generatedAt", LocalDateTime.now().withNano(0).toString());
        out.put("object", obj);
        out.put("results", results);
        return out;
    }

    /**
     * Simpan mapping (hanya mode dev): {categories: [...], objects: {KODE: {cat, title, hide, master}}, remove: [KODE]}.
     * Mapping lama yang tidak dikirim (mis. kode yang tidak ada di DB ini) tetap disimpan, kecuali ada di remove.
     */
    @PutMapping("/mapping")
    @SuppressWarnings("unchecked")
    public synchronized Map<String, Object> putMapping(@RequestBody Map<String, Object> body) throws IOException {
        if (!editable) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Mapping add-on hanya bisa diubah di mode dev.");
        Map<String, Object> objs = new TreeMap<>();
        Object rm = body.get("remove");
        Set<Object> remove = rm instanceof List ? new HashSet<>((List<Object>) rm) : Collections.emptySet();
        for (Map.Entry<String, Object> e : ((Map<String, Object>) mapping().getOrDefault("objects", Collections.emptyMap())).entrySet())
            if (!remove.contains(e.getKey())) objs.put(e.getKey(), e.getValue());
        Object raw = body.get("objects");
        if (raw instanceof Map) for (Map.Entry<String, Object> e : ((Map<String, Object>) raw).entrySet()) {
            if (!SAFE.matcher(e.getKey()).matches() || !(e.getValue() instanceof Map)) throw bad("Kode objek tidak valid: " + e.getKey());
            Map<String, Object> v = (Map<String, Object>) e.getValue(), m = new LinkedHashMap<>();
            String cat = str(v.get("cat")), title = str(v.get("title"));
            if (cat.length() > 60 || title.length() > 120) throw bad("Sub kategori maksimal 60 karakter, judul maksimal 120 karakter.");
            if (!cat.isEmpty()) m.put("cat", cat);
            if (!title.isEmpty()) m.put("title", title);
            if (Boolean.TRUE.equals(v.get("hide"))) m.put("hide", true);
            if (Boolean.TRUE.equals(v.get("master"))) m.put("master", true);
            if (m.isEmpty()) objs.remove(e.getKey()); else objs.put(e.getKey(), m);
        }
        Set<String> cats = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        Object rc = body.get("categories");
        if (rc instanceof List) for (Object c : (List<Object>) rc) if (!str(c).isEmpty()) cats.add(str(c));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("categories", new ArrayList<>(cats));
        out.put("objects", objs);
        // tulis ke file sementara dulu supaya file lama tidak rusak kalau proses berhenti di tengah
        Path tmp = mappingFile.resolveSibling(mappingFile.getFileName() + ".tmp");
        json.writeValue(tmp.toFile(), out);
        Files.move(tmp, mappingFile, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        return objects();
    }

    // UDO (header + child dari UDO1) + UDT No Object yang tidak dipakai UDO mana pun, digabung dengan mapping
    private List<Map<String, Object>> objectList(Map<String, Map<String, Object>> maps) {
        Map<String, String[]> outb = new HashMap<>();   // nama tabel -> [Descr, ObjectType]
        jdbc.query("SELECT \"TableName\", \"Descr\", TO_NVARCHAR(\"ObjectType\") FROM OUTB", rs -> {
            outb.put(rs.getString(1), new String[]{rs.getString(2), rs.getString(3)});
        });
        Map<String, List<String>> children = new HashMap<>();
        jdbc.query("SELECT \"Code\", \"TableName\" FROM UDO1 ORDER BY \"Code\", \"SonNum\"", rs -> {
            children.computeIfAbsent(rs.getString(1), k -> new ArrayList<>()).add(rs.getString(2));
        });
        Set<String> used = new HashSet<>();
        List<Map<String, Object>> list = new ArrayList<>();
        jdbc.query("SELECT \"Code\", \"Name\", TO_NVARCHAR(\"TYPE\"), \"TableName\" FROM OUDO ORDER BY \"Code\"", rs -> {
            String code = rs.getString(1), type = rs.getString(3), head = rs.getString(4);
            List<String> tables = new ArrayList<>();
            tables.add(head);
            tables.addAll(children.getOrDefault(code, Collections.emptyList()));
            used.addAll(tables);
            list.add(object(code, rs.getString(2), "3".equals(type) ? "d" : "m", tables, outb, maps.get(code)));
        });
        for (Map.Entry<String, String[]> t : outb.entrySet()) {
            String type = t.getValue()[1];
            if (used.contains(t.getKey()) || !("0".equals(type) || "5".equals(type))) continue;
            list.add(object(t.getKey(), t.getValue()[0], "t", Collections.singletonList(t.getKey()), outb, maps.get(t.getKey())));
        }
        list.sort(Comparator.comparing(o -> String.valueOf(o.get("code"))));
        return list;
    }

    private static Map<String, Object> object(String code, String name, String kind, List<String> tables, Map<String, String[]> outb, Map<String, Object> map) {
        Map<String, Object> m = map == null ? Collections.emptyMap() : map;
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("code", code);
        o.put("name", name == null || name.trim().isEmpty() ? code : name.trim());
        o.put("kind", kind);
        List<Map<String, Object>> ts = new ArrayList<>();
        for (String t : tables) {
            if (t == null || !SAFE.matcher(t).matches()) continue;   // nama tabel masuk ke SQL, jadi hanya yang polanya aman
            Map<String, Object> x = new LinkedHashMap<>();
            String[] info = outb.getOrDefault(t, new String[]{t, "0"});
            x.put("name", t);
            x.put("descr", info[0] == null ? t : info[0]);
            x.put("type", info[1]);
            ts.add(x);
        }
        o.put("tables", ts);
        String cat = str(m.get("cat")), title = str(m.get("title"));
        o.put("cat", cat.isEmpty() ? null : cat);
        o.put("title", title.isEmpty() ? null : title);
        o.put("hide", Boolean.TRUE.equals(m.get("hide")));
        o.put("master", Boolean.TRUE.equals(m.get("master")));
        o.put("shown", !Boolean.TRUE.equals(m.get("hide")) && (!"d".equals(kind) || Boolean.TRUE.equals(m.get("master"))) && !ts.isEmpty());
        return o;
    }

    // mode dev: file di folder project; war: salinan yang dibundel saat build
    @SuppressWarnings("unchecked")
    private Map<String, Object> mapping() throws IOException {
        if (editable && Files.exists(mappingFile)) return json.readValue(mappingFile.toFile(), Map.class);
        ClassPathResource bundled = new ClassPathResource("addon-mapping.json");
        if (bundled.exists()) try (InputStream in = bundled.getInputStream()) { return json.readValue(in, Map.class); }
        return Collections.emptyMap();
    }

    // pesan validasi dikirim ke browser sebagai {message} (default Spring Boot menyembunyikan pesan error)
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> error(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatus()).body(Collections.singletonMap("message", e.getReason()));
    }

    private static String str(Object o) {
        return o == null ? "" : o.toString().trim();
    }

    private static ResponseStatusException bad(String msg) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, msg);
    }
}
