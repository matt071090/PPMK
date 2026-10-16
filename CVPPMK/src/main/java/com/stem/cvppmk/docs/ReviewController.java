package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Hasil review manual dari edit mode: status tiap menu (sesuai / belum sesuai + catatan),
 * temuan otomatis yang dikecualikan (exclusion + alasan), dan isi Remarks.
 * - Mode dev (docs.edit.enabled, default true): baca/tulis file docs.review.file (default ./review.json, ikut di-commit).
 * - War di Tomcat (docs.edit.enabled=false): read-only dari classpath:review.json yang dibundel saat build.
 */
@RestController
@RequestMapping("/api/review")
public class ReviewController {
    private final Path file;
    private final boolean editable;
    private final ObjectMapper json = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

    public ReviewController(@Value("${docs.review.file:review.json}") String file,
                            @Value("${docs.edit.enabled:true}") boolean editable) {
        this.file = Paths.get(file).toAbsolutePath();
        this.editable = editable;
    }

    @GetMapping("/mode")
    public Map<String, Object> mode() {
        return Collections.singletonMap("editable", editable);
    }

    @GetMapping
    @SuppressWarnings("unchecked")
    public synchronized Map<String, Object> get() throws IOException {
        if (editable && Files.exists(file)) return json.readValue(file.toFile(), Map.class);
        ClassPathResource bundled = new ClassPathResource("review.json");
        if (!editable && bundled.exists()) {
            try (InputStream in = bundled.getInputStream()) {
                return json.readValue(in, Map.class);
            }
        }
        Map<String, Object> empty = new LinkedHashMap<>();
        empty.put("pages", new LinkedHashMap<>());
        empty.put("exclusions", new LinkedHashMap<>());
        return empty;
    }

    @PutMapping
    public synchronized Map<String, Object> put(@RequestBody Map<String, Object> body) throws IOException {
        if (!editable) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Web ini read-only, review hanya bisa diubah di mode dev");
        // tulis ke file sementara dulu supaya file lama tidak rusak kalau proses berhenti di tengah
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        json.writeValue(tmp.toFile(), body);
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        return body;
    }
}
