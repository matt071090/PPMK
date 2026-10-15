package com.stem.cvppmk.docs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
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
    private static final Logger log = LoggerFactory.getLogger(SectionController.class);

    private final JdbcTemplate jdbc;
    private final PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();

    public SectionController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/{name:[a-z0-9_-]+}")
    public Map<String, Object> section(@PathVariable String name) throws IOException {
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
            String sql = file.getContentAsString(StandardCharsets.UTF_8);
            results.put(key, run(key, sql));
        }
        return Map.of("generatedAt", LocalDateTime.now().withNano(0).toString(), "results", results);
    }

    private Map<String, Object> run(String key, String sql) {
        long start = System.currentTimeMillis();
        try {
            Map<String, Object> out = jdbc.query(sql, rs -> {
                ResultSetMetaData md = rs.getMetaData();
                List<String> columns = new ArrayList<>();
                for (int i = 1; i <= md.getColumnCount(); i++) columns.add(md.getColumnLabel(i));
                List<List<String>> rows = new ArrayList<>();
                while (rs.next()) {
                    List<String> row = new ArrayList<>(columns.size());
                    for (int i = 1; i <= columns.size(); i++) row.add(rs.getString(i));
                    rows.add(row);
                }
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("columns", columns);
                m.put("rows", rows);
                return m;
            });
            long ms = System.currentTimeMillis() - start;
            out.put("ms", ms);
            log.debug("[{}] {} baris, {} ms", key, ((List<?>) out.get("rows")).size(), ms);
            return out;
        } catch (DataAccessException e) {
            log.warn("[{}] gagal: {}", key, e.getMostSpecificCause().getMessage());
            return Map.of("error", e.getMostSpecificCause().getMessage());
        }
    }
}
