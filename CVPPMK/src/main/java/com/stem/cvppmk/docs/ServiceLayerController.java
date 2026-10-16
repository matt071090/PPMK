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
