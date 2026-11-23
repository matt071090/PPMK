package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * GET /api/sl/{name}: ambil data dari Service Layer, untuk pengaturan yang tidak jelas kolom DB-nya.
 * Hanya action di READS yang boleh dipanggil, semuanya baca saja.
 */
@RestController
@RequestMapping("/api/sl")
public class ServiceLayerController {
    private static final Logger log = LoggerFactory.getLogger(ServiceLayerController.class);

    // name -> {method, path}
    private static final Map<String, String[]> READS = new HashMap<>();
    static {
        READS.put("admin-info", new String[]{"POST", "CompanyService_GetAdminInfo"});
        READS.put("company-info", new String[]{"POST", "CompanyService_GetCompanyInfo"});
    }

    private final ServiceLayerClient sl;

    public ServiceLayerController(ServiceLayerClient sl) {
        this.sl = sl;
    }

    // $metadata Service Layer (XML besar) diparse sekali lalu disimpan sebentar supaya cek field berulang tidak mengunduh ulang
    private org.w3c.dom.Document metaDoc;
    private long metaAt;

    private synchronized org.w3c.dom.Document metadata() throws Exception {
        if (metaDoc == null || System.currentTimeMillis() - metaAt > 10 * 60_000L) {
            javax.xml.parsers.DocumentBuilderFactory f = javax.xml.parsers.DocumentBuilderFactory.newInstance();
            f.setNamespaceAware(false);
            f.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            metaDoc = f.newDocumentBuilder().parse(new java.io.ByteArrayInputStream(sl.getRaw("$metadata").getBytes(java.nio.charset.StandardCharsets.UTF_8)));
            metaAt = System.currentTimeMillis();
        }
        return metaDoc;
    }

    /** Elemen EntityType / ComplexType bernama name, atau null. */
    private static org.w3c.dom.Element typeNode(org.w3c.dom.Document doc, String name) {
        for (String tag : new String[]{"EntityType", "ComplexType"}) {
            org.w3c.dom.NodeList list = doc.getElementsByTagName(tag);
            for (int i = 0; i < list.getLength(); i++) {
                org.w3c.dom.Element e = (org.w3c.dom.Element) list.item(i);
                if (name.equals(e.getAttribute("Name"))) return e;
            }
        }
        return null;
    }

    private static List<Map<String, String>> props(org.w3c.dom.Element type) {
        List<Map<String, String>> out = new java.util.ArrayList<>();
        org.w3c.dom.NodeList ps = type.getElementsByTagName("Property");
        for (int i = 0; i < ps.getLength(); i++) {
            org.w3c.dom.Element p = (org.w3c.dom.Element) ps.item(i);
            Map<String, String> m = new LinkedHashMap<>();
            m.put("name", p.getAttribute("Name"));
            m.put("type", p.getAttribute("Type"));
            out.add(m);
        }
        return out;
    }

    /**
     * GET /api/sl/fields?entity=Items: nama field entity Service Layer dan, untuk tiap koleksi (Type "Collection(SAPB1.X)"),
     * nama field barisnya. Untuk memastikan nama field yang dikirim upload Setup benar. Hanya baca $metadata, tidak menyentuh data.
     */
    @GetMapping("/fields")
    public Map<String, Object> fields(@RequestParam String entity) {
        if (!entity.matches("[A-Za-z0-9_]{1,80}"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Nama entity tidak valid");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("entity", entity);
        try {
            org.w3c.dom.Document doc = metadata();
            // nama yang dipakai di URL (EntitySet, mis. Items) bisa beda dengan nama tipenya (EntityType, mis. Item)
            String typeName = entity;
            org.w3c.dom.NodeList sets = doc.getElementsByTagName("EntitySet");
            for (int i = 0; i < sets.getLength(); i++) {
                org.w3c.dom.Element s = (org.w3c.dom.Element) sets.item(i);
                if (entity.equals(s.getAttribute("Name"))) {
                    String t = s.getAttribute("EntityType");
                    typeName = t.substring(t.lastIndexOf('.') + 1);
                    break;
                }
            }
            org.w3c.dom.Element type = typeNode(doc, typeName);
            if (type == null) { out.put("error", "Entity '" + entity + "' tidak ada di $metadata Service Layer"); return out; }
            out.put("type", typeName);
            List<Map<String, String>> plain = new java.util.ArrayList<>();
            List<Map<String, Object>> colls = new java.util.ArrayList<>();
            for (Map<String, String> p : props(type)) {
                String t = p.get("type");
                if (t.startsWith("Collection(")) {
                    String child = t.substring(t.indexOf('.') + 1, t.length() - 1);
                    org.w3c.dom.Element ct = typeNode(doc, child);
                    Map<String, Object> cm = new LinkedHashMap<>();
                    cm.put("name", p.get("name"));
                    cm.put("type", child);
                    cm.put("fields", ct == null ? new java.util.ArrayList<Map<String, String>>() : props(ct));
                    colls.add(cm);
                } else plain.add(p);
            }
            out.put("fields", plain);
            out.put("collections", colls);
        } catch (Exception e) {
            log.warn("[sl:fields] gagal: {}", e.getMessage());
            out.put("error", e.getMessage());
        }
        return out;
    }

    @GetMapping("/{name}")
    public Map<String, Object> read(@PathVariable String name) {
        String[] target = READS.get(name);
        if (target == null && !"period-category".equals(name))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Data Service Layer '" + name + "' tidak dikenal");
        long start = System.currentTimeMillis();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("generatedAt", LocalDateTime.now().withNano(0).toString());
        try {
            if (target == null) out.put("data", currentPeriodCategory());
            else out.put("data", "POST".equals(target[0]) ? sl.post(target[1]) : sl.get(target[1]));
        } catch (Exception e) {
            log.warn("[sl:{}] gagal: {}", name, e.getMessage());
            out.put("error", e.getMessage());
        }
        out.put("ms", System.currentTimeMillis() - start);
        return out;
    }

    /**
     * Kategori posting period tahun berjalan, berisi akun G/L default (G/L Account Determination: sales, purchasing, umum).
     * Kalau tahun berjalan belum ada, pakai kategori terakhir.
     */
    private JsonNode currentPeriodCategory() throws Exception {
        int year = LocalDateTime.now().getYear();
        JsonNode last = null;
        for (JsonNode p : sl.post("CompanyService_GetPeriods").path("value")) {
            JsonNode cat = sl.post("CompanyService_GetPeriod", Collections.singletonMap("PeriodCategoryParams",
                    Collections.singletonMap("AbsoluteEntry", p.path("AbsoluteEntry").asInt())));
            if (cat.path("FinancialYear").asInt() == year) return cat;
            last = cat;
        }
        if (last == null) throw new IllegalStateException("Belum ada posting period");
        return last;
    }
}
