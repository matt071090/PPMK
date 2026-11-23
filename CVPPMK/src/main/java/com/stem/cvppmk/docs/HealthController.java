package com.stem.cvppmk.docs;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * GET /api/health: status koneksi untuk halaman Home (database HANA dan Service Layer), maks 6 detik per cek, hasil di-cache 60 detik.
 * - DB: SELECT 1 FROM DUMMY (bukan data SAP).
 * - Service Layer: login (POST /Login di dalam ServiceLayerClient) lalu satu GET ringan (Users, 1 baris, hanya UserCode). Tidak ada tulis.
 * - Yang dikirim ke browser hanya host + nama DB/schema, tidak pernah user/password.
 */
@RestController
@RequestMapping("/api/health")
public class HealthController {
    private static final long TTL_MS = 60_000, TIMEOUT_S = 6;
    private final JdbcTemplate jdbc;
    private final ServiceLayerClient sl;
    private final String dbUrl, slHost, slCompany;
    private final ExecutorService pool = Executors.newCachedThreadPool(r -> { Thread t = new Thread(r, "health-check"); t.setDaemon(true); return t; });
    private volatile Map<String, Object> cached;
    private volatile long cachedAt;

    public HealthController(JdbcTemplate jdbc, ServiceLayerClient sl,
                            @Value("${spring.datasource.url:}") String dbUrl,
                            @Value("${sap.sl.host:}") String slHost,
                            @Value("${sap.sl.company-db:}") String slCompany) {
        this.jdbc = jdbc; this.sl = sl; this.dbUrl = dbUrl; this.slHost = slHost; this.slCompany = slCompany;
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> health(@RequestParam(defaultValue = "false") boolean fresh) {
        Map<String, Object> c = cached;
        if (fresh || c == null || System.currentTimeMillis() - cachedAt > TTL_MS) {
            Future<Map<String, Object>> db = pool.submit(this::checkDb), s = pool.submit(this::checkSl);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("db", await(db, "Database tidak menjawab dalam " + TIMEOUT_S + " detik."));
            out.put("sl", await(s, "Service Layer tidak menjawab dalam " + TIMEOUT_S + " detik."));
            out.put("checkedAt", java.time.Instant.now().toString());
            cached = c = out; cachedAt = System.currentTimeMillis();
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(c);
    }

    private Map<String, Object> checkDb() {
        Map<String, Object> r = base(dbTarget());
        long t0 = System.nanoTime();
        try {
            jdbc.queryForObject("SELECT 1 FROM DUMMY", Integer.class);
            r.put("ok", true);
        } catch (Exception e) {
            r.put("ok", false); r.put("message", shortMsg(e));
        }
        r.put("ms", (System.nanoTime() - t0) / 1_000_000);
        return r;
    }

    private Map<String, Object> checkSl() {
        Map<String, Object> r = base(slCompany.isEmpty() ? slHost : slCompany + " @ " + slHost);
        if (!sl.configured()) { r.put("ok", false); r.put("message", "Service Layer belum diatur."); return r; }
        long t0 = System.nanoTime();
        try {
            sl.get("Users?$select=UserCode&$top=1");
            r.put("ok", true);
        } catch (Exception e) {
            r.put("ok", false); r.put("message", shortMsg(e));
        }
        r.put("ms", (System.nanoTime() - t0) / 1_000_000);
        return r;
    }

    private Map<String, Object> await(Future<Map<String, Object>> f, String timeoutMsg) {
        try { return f.get(TIMEOUT_S, TimeUnit.SECONDS); }
        catch (TimeoutException e) { f.cancel(true); Map<String, Object> r = base(""); r.put("ok", false); r.put("message", timeoutMsg); return r; }
        catch (Exception e) { Map<String, Object> r = base(""); r.put("ok", false); r.put("message", shortMsg(e)); return r; }
    }

    /** "CVPPM @ 192.168.40.197" dari jdbc:sap://host:port/?currentschema=X, tanpa kredensial. */
    private String dbTarget() {
        Matcher h = Pattern.compile("//([^:/?]+)").matcher(dbUrl), s = Pattern.compile("(?i)currentschema=([^&;]+)").matcher(dbUrl);
        String host = h.find() ? h.group(1) : "", schema = s.find() ? s.group(1) : "";
        return schema.isEmpty() ? host : schema + " @ " + host;
    }

    private static Map<String, Object> base(String target) { Map<String, Object> r = new LinkedHashMap<>(); r.put("target", target); return r; }

    private static String shortMsg(Throwable e) {
        Throwable c = e; while (c.getCause() != null && c.getCause() != c) c = c.getCause();
        String m = c.getMessage() == null ? c.getClass().getSimpleName() : c.getMessage();
        m = m.replaceAll("(?i)(password|pwd)=[^;&\\s]*", "$1=***");
        return m.length() > 200 ? m.substring(0, 200) + "…" : m;
    }
}
