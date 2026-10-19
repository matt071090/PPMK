package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.JsonNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * GET /api/sld/license: jumlah license per tipe dan file license dari License Server (SLD), bentuk hasil sama dengan
 * /api/section ({generatedAt, results: {modules, files}}) supaya frontend bisa menggabungkannya dengan hasil SQL.
 * Kalau sap.sld.* belum diisi: results.sld = {configured: N}, tanpa error.
 */
@RestController
@RequestMapping("/api/sld")
public class SldController {
    private static final Logger log = LoggerFactory.getLogger(SldController.class);
    private static final Pattern ODATA_DATE = Pattern.compile("/Date\\((-?\\d+)[^)]*\\)/");
    private static final String[] MODULE_COLS = {"Type", "Description", "Total", "Available", "StartDate", "ExpirationDate", "IsExpired", "InstallationNumber"};
    private static final String[] FILE_COLS = {"FileName", "InstallationNumber", "SystemNumber", "Version", "Localization", "ExpirationDate"};

    private final SldClient sld;

    public SldController(SldClient sld) {
        this.sld = sld;
    }

    @GetMapping("/{name}")
    public Map<String, Object> read(@PathVariable String name) {
        if (!"license".equals(name)) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Data License Server '" + name + "' tidak dikenal");
        Map<String, Object> results = new LinkedHashMap<>();
        results.put("sld", table(new String[]{"configured"}, Collections.singletonList(Collections.singletonList(sld.configured() ? "Y" : "N"))));
        if (sld.configured()) {
            results.put("modules", fetch("LicenseModules", MODULE_COLS));
            results.put("files", fetch("LicenseFiles", FILE_COLS));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("generatedAt", LocalDateTime.now().withNano(0).toString());
        out.put("results", results);
        return out;
    }

    private Map<String, Object> fetch(String entitySet, String[] cols) {
        long start = System.currentTimeMillis();
        try {
            List<List<String>> rows = new ArrayList<>();
            for (JsonNode r : sld.list(entitySet)) {
                List<String> row = new ArrayList<>(cols.length);
                for (String c : cols) row.add(text(r.path(c)));
                rows.add(row);
            }
            Map<String, Object> m = table(cols, rows);
            m.put("ms", System.currentTimeMillis() - start);
            return m;
        } catch (Exception e) {
            log.warn("[sld:{}] gagal: {}", entitySet, e.getMessage());
            return Collections.singletonMap("error", e.getMessage());
        }
    }

    /** Nilai OData v2 jadi teks; tanggal "/Date(ms)/" jadi YYYY-MM-DD. */
    private static String text(JsonNode v) {
        if (v.isMissingNode() || v.isNull()) return null;
        String s = v.asText();
        Matcher m = ODATA_DATE.matcher(s);
        return m.matches() ? Instant.ofEpochMilli(Long.parseLong(m.group(1))).atZone(ZoneOffset.UTC).toLocalDate().toString() : s;
    }

    private static Map<String, Object> table(String[] cols, List<List<String>> rows) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("columns", Arrays.asList(cols));
        m.put("rows", rows);
        return m;
    }
}
