package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Hasil review manual dari edit mode: status tiap menu (sesuai / belum sesuai + catatan)
 * dan temuan otomatis yang dikecualikan (exclusion + alasan).
 * Disimpan sebagai JSON di file docs.review.file (default ./review.json, ikut di-commit).
 */
@RestController
@RequestMapping("/api/review")
public class ReviewController {
    private final Path file;
    private final ObjectMapper json = new ObjectMapper().enable(SerializationFeature.INDENT_OUTPUT);

    public ReviewController(@Value("${docs.review.file:review.json}") String file) {
        this.file = Paths.get(file).toAbsolutePath();
    }

    @GetMapping
    @SuppressWarnings("unchecked")
    public synchronized Map<String, Object> get() throws IOException {
        if (Files.exists(file)) return json.readValue(file.toFile(), Map.class);
        Map<String, Object> empty = new LinkedHashMap<>();
        empty.put("pages", new LinkedHashMap<>());
        empty.put("exclusions", new LinkedHashMap<>());
        return empty;
    }

    @PutMapping
    public synchronized Map<String, Object> put(@RequestBody Map<String, Object> body) throws IOException {
        // tulis ke file sementara dulu supaya file lama tidak rusak kalau proses berhenti di tengah
        Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
        json.writeValue(tmp.toFile(), body);
        Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        return body;
    }
}
