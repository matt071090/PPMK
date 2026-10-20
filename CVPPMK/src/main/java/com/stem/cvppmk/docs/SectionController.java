package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.FileNotFoundException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.sql.ResultSetMetaData;
import java.time.LocalDateTime;
import java.util.*;

/**
 * GET /api/section/{name}: jalankan semua classpath:sql/{name}/*.sql (urut nama file),
 * kembalikan {generatedAt, results: {key: {columns, rows, ms} | {error}}}.
 * Key = nama file tanpa prefix nomor, mis. 03_branches.sql -> "branches".
 */
@RestController
@RequestMapping("/api/section")
public class SectionController {
    private static final Set<String> DEV_ONLY = Collections.singleton("template-ref");
    // tahap Setup yang boleh dilihat di menu dokumentasi (baca DB company ini saja, tanpa DB sumber & upload)
    private static final Set<String> VIEW_TIERS = Collections.singleton("G");
    private static final Logger log = LoggerFactory.getLogger(SectionController.class);

    private final JdbcTemplate jdbc;
    private final UdfExpander udf;
    private final ObjectMapper json;
    private final boolean editable;
    private final PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();

    public SectionController(JdbcTemplate jdbc, UdfExpander udf, ObjectMapper json, @Value("${docs.edit.enabled:true}") boolean editable) {
        this.jdbc = jdbc;
        this.udf = udf;
        this.json = json;
        this.editable = editable;
    }

    @GetMapping("/{name:[a-z0-9_-]+}")
    public Map<String, Object> section(@PathVariable String name) throws IOException {
        // data template upload hanya untuk mode dev (sama seperti Mode edit); di war read-only ditolak
        if (!editable && DEV_ONLY.contains(name))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Bagian '" + name + "' hanya tersedia di mode dev");
        Resource[] files;
        try {
            files = resolver.getResources("classpath:sql/" + name + "/*.sql");
        } catch (FileNotFoundException e) {
            files = new Resource[0];
        }
        if (files.length == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Bagian '" + name + "' belum punya query");
        }
        Arrays.sort(files, Comparator.comparing(Resource::getFilename));

        Map<String, Object> results = new LinkedHashMap<>();
        for (Resource file : files) {
            String key = file.getFilename().replaceAll("^\\d+_|\\.sql$", "");
            // baris komentar "--" dibuang: di Java 8 driver HANA menganggap query yang diawali komentar bukan SELECT
            // ("SQL statement would generate a row count")
            String sql = StreamUtils.copyToString(file.getInputStream(), StandardCharsets.UTF_8)
                    .replaceAll("(?m)^\\s*--.*$", "").trim();
            UdfExpander.Expanded ex;
            try {
                ex = udf.expand(sql);   // penanda /*@udf-cols ..*/ & /*@udf-joins ..*/ -> kolom UDF dari CUFD
            } catch (DataAccessException e) {
                results.put(key, Collections.singletonMap("error", "Metadata UDF: " + e.getMostSpecificCause().getMessage()));
                continue;
            }
            Map<String, Object> res = run(key, ex.sql);
            if (!ex.udf.isEmpty() && !res.containsKey("error")) res.put("udf", ex.udf);
            results.put(key, res);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("generatedAt", LocalDateTime.now().withNano(0).toString());
        out.put("results", results);
        return out;
    }

    /**
     * GET /api/section/setup/{id}: tampilan baca-saja satu langkah Setup tahap G (Addon Farm Breeding) dari DB company ini,
     * memakai query yang sama dengan Setup (classpath:setup/sql/{id}.sql), supaya user bisa mengecek isinya tanpa mode edit.
     * Hasil: {generatedAt, step: {title, ref, note, match, children}, results: {rows: {columns, rows, ms}}}.
     */
    @GetMapping("/setup/{id:[a-z0-9-]+}")
    public Map<String, Object> setupView(@PathVariable String id) throws IOException {
        JsonNode step = null;
        try (java.io.InputStream in = new org.springframework.core.io.ClassPathResource("setup/steps.json").getInputStream()) {
            for (JsonNode s : json.readTree(in)) if (id.equals(s.path("id").asText())) step = s;
        }
        if (step == null || !VIEW_TIERS.contains(step.path("tier").asText()) || !"data".equals(step.path("kind").asText()))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Langkah '" + id + "' tidak punya tampilan");
        Resource file = resolver.getResource("classpath:setup/sql/" + id + ".sql");
        String sql = StreamUtils.copyToString(file.getInputStream(), StandardCharsets.UTF_8).replaceAll("(?m)^\\s*--.*$", "").trim();
        Map<String, Object> meta = new LinkedHashMap<>();
        for (String f : new String[]{"title", "ref", "note", "match", "children"}) if (step.has(f)) meta.put(f, step.get(f));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("generatedAt", LocalDateTime.now().withNano(0).toString());
        out.put("step", meta);
        out.put("results", Collections.singletonMap("rows", run(id, sql)));
        return out;
    }

    private Map<String, Object> run(String key, String sql) {
        long start = System.currentTimeMillis();
        try {
            Map<String, Object> out = jdbc.query(sql, rs -> {
                ResultSetMetaData md = rs.getMetaData();
                List<String> columns = new ArrayList<>(), types = new ArrayList<>();
                for (int i = 1; i <= md.getColumnCount(); i++) {
                    columns.add(md.getColumnLabel(i));
                    types.add(md.getColumnTypeName(i));   // dipakai frontend untuk tahu kolom angka (export Excel)
                }
                List<List<String>> rows = new ArrayList<>();
                while (rs.next()) {
                    List<String> row = new ArrayList<>(columns.size());
                    for (int i = 1; i <= columns.size(); i++) row.add(rs.getString(i));
                    rows.add(row);
                }
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("columns", columns);
                m.put("types", types);
                m.put("rows", rows);
                return m;
            });
            long ms = System.currentTimeMillis() - start;
            out.put("ms", ms);
            log.debug("[{}] {} baris, {} ms", key, ((List<?>) out.get("rows")).size(), ms);
            return out;
        } catch (DataAccessException e) {
            log.warn("[{}] gagal: {}", key, e.getMostSpecificCause().getMessage());
            return Collections.singletonMap("error", e.getMostSpecificCause().getMessage());
        }
    }
}
