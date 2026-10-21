package com.stem.cvppmk.docs;

import com.stem.cvppmk.docs.HanaBackupService.Conn;
import com.stem.cvppmk.docs.HanaBackupService.HanaException;
import com.stem.cvppmk.docs.HanaBackupService.Job;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.net.InetAddress;
import java.net.UnknownHostException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Backup & restore schema HANA (halaman "Backup & Restore HANA"). Login memakai IP + user + password SSH server HANA,
 * token sesi dikirim di header X-Hana-Token. Detail di {@link HanaBackupService}.
 * <ul>
 *   <li>GET  /api/hana/info              fitur aktif? restore aktif?</li>
 *   <li>POST /api/hana/login             {host, port, user, password, prod} -> token</li>
 *   <li>POST /api/hana/logout</li>
 *   <li>GET  /api/hana/schemas | /backups   daftar dari server</li>
 *   <li>POST /api/hana/backup            {schema} -> job</li>
 *   <li>POST /api/hana/restore           {source, file, target, confirmSchema, confirmWord, confirmIp} -> job</li>
 *   <li>GET  /api/hana/jobs/{id}?from=N  status + potongan log</li>
 *   <li>GET  /api/hana/history           riwayat (CSV di hana.data-dir)</li>
 * </ul>
 * hana.enabled=false mematikan semua endpoint; hana.local-only=true hanya melayani request dari mesin ini (disarankan bila tidak di-HTTPS-kan).
 */
@RestController
@RequestMapping("/api/hana")
public class HanaBackupController {
    private static final Pattern JDBC_HOST = Pattern.compile("jdbc:sap://([^:/?,;]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern JDBC_SCHEMA = Pattern.compile("currentschema=([^&;]+)", Pattern.CASE_INSENSITIVE);

    private final HanaBackupService svc;
    private final boolean enabled, restoreEnabled, localOnly;
    private final String appHost, appSchema;

    public HanaBackupController(HanaBackupService svc,
                                @Value("${hana.enabled:true}") boolean enabled,
                                @Value("${hana.restore.enabled:true}") boolean restoreEnabled,
                                @Value("${hana.local-only:false}") boolean localOnly,
                                @Value("${spring.datasource.url:}") String dsUrl) {
        this.svc = svc;
        this.enabled = enabled;
        this.restoreEnabled = restoreEnabled;
        this.localOnly = localOnly;
        Matcher h = JDBC_HOST.matcher(dsUrl), s = JDBC_SCHEMA.matcher(dsUrl);
        this.appHost = h.find() ? h.group(1) : "";
        this.appSchema = s.find() ? s.group(1) : "";
    }

    @ExceptionHandler(HanaException.class)
    public ResponseEntity<Map<String, Object>> fail(HanaException e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("message", e.getMessage());
        return ResponseEntity.status(e.status).body(m);
    }

    private void gate(HttpServletRequest req) {
        if (!enabled) throw new HanaException(404, "Fitur Backup & Restore HANA dimatikan (hana.enabled=false).");
        if (localOnly) {
            try {
                if (!InetAddress.getByName(req.getRemoteAddr()).isLoopbackAddress())
                    throw new HanaException(403, "Halaman ini hanya bisa dipakai dari komputer server (hana.local-only=true).");
            } catch (UnknownHostException e) {
                throw new HanaException(403, "Alamat peminta tidak dikenali.");
            }
        }
    }

    private Conn conn(HttpServletRequest req) {
        gate(req);
        return svc.conn(req.getHeader("X-Hana-Token"));
    }

    private static String str(Map<String, Object> b, String k) { Object v = b.get(k); return v == null ? "" : String.valueOf(v); }

    private Map<String, Object> jobJson(Job j, int from) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", j.id); m.put("type", j.type); m.put("status", j.status); m.put("stage", j.stage);
        m.put("stageNo", j.stageNo); m.put("stageTotal", j.stageTotal); m.put("seconds", j.seconds());
        m.put("progDone", j.progDone); m.put("progTotal", j.progTotal); m.put("progUnit", j.progUnit);
        m.put("exit", j.exit); m.put("error", j.error); m.put("source", j.source); m.put("target", j.target);
        m.put("file", j.file); m.put("host", j.host);
        m.put("log", j.logFrom(from)); m.put("logLength", j.logLength());
        return m;
    }

    @GetMapping("/info")
    public Map<String, Object> info(HttpServletRequest req) {
        gate(req);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("enabled", true); m.put("restoreEnabled", restoreEnabled);
        return m;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, Object> b, HttpServletRequest req) {
        gate(req);
        int port = 22;
        try { String p = str(b, "port"); if (!p.isEmpty()) port = Integer.parseInt(p.trim()); } catch (NumberFormatException e) { throw new HanaException(400, "Port tidak valid."); }
        Conn c = svc.login(str(b, "host"), port, str(b, "user"), str(b, "password"), "true".equals(str(b, "prod")));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("token", c.token); m.put("host", c.host); m.put("user", c.user); m.put("prod", c.prod);
        Job running = svc.activeJob(c.host);
        m.put("activeJob", running == null ? null : running.id);
        return m;
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(HttpServletRequest req) {
        gate(req);
        svc.logout(req.getHeader("X-Hana-Token"));
        return new LinkedHashMap<>();
    }

    @GetMapping("/schemas")
    public List<String> schemas(HttpServletRequest req) { return svc.schemas(conn(req)); }

    @GetMapping("/backups")
    public List<String> backups(HttpServletRequest req) { return svc.backups(conn(req)); }

    @PostMapping("/backup")
    public Map<String, Object> backup(@RequestBody Map<String, Object> b, HttpServletRequest req) {
        Conn c = conn(req);
        return jobJson(svc.startBackup(c, str(b, "schema")), 0);
    }

    @PostMapping("/restore")
    public Map<String, Object> restore(@RequestBody Map<String, Object> b, HttpServletRequest req) {
        Conn c = conn(req);
        if (!restoreEnabled) throw new HanaException(403, "Restore dimatikan (hana.restore.enabled=false).");
        String source = str(b, "source").trim(), target = str(b, "target").trim(), file = str(b, "file").trim();
        // konfirmasi 2 lapis dicek ulang di server, bukan hanya di tombol browser
        if (!target.equals(str(b, "confirmSchema").trim())) throw new HanaException(400, "Konfirmasi nama schema tujuan tidak cocok.");
        if (!"RESTORE".equals(str(b, "confirmWord").trim())) throw new HanaException(400, "Ketik RESTORE (huruf besar semua) untuk melanjutkan.");
        if (c.prod && !c.host.equals(str(b, "confirmIp").trim())) throw new HanaException(400, "Server ditandai produksi: ketik ulang IP server " + c.host + ".");
        // jangan menimpa schema yang sedang dipakai aplikasi ini
        if (!appSchema.isEmpty() && target.equalsIgnoreCase(appSchema) && c.host.equalsIgnoreCase(appHost))
            throw new HanaException(400, "Schema " + target + " sedang dipakai aplikasi ini. Restore ke nama baru, lalu arahkan application.properties ke schema itu.");
        return jobJson(svc.startRestore(c, source, file, target), 0);
    }

    @GetMapping("/jobs/{id}")
    public Map<String, Object> job(@PathVariable String id, @RequestParam(defaultValue = "0") int from, HttpServletRequest req) {
        conn(req);
        return jobJson(svc.job(id), from);
    }

    @GetMapping("/history")
    public List<Map<String, String>> history(HttpServletRequest req) {
        conn(req);
        return svc.history();
    }

    @GetMapping(value = "/history/{id}/log", produces = "text/plain;charset=UTF-8")
    public String savedLog(@PathVariable String id, HttpServletRequest req) {
        conn(req);
        return svc.savedLog(id);
    }

    /** Info schema aktif aplikasi, supaya UI bisa memperingatkan sebelum restore. */
    @GetMapping("/app-schema")
    public Map<String, Object> appSchema(HttpServletRequest req) {
        conn(req);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("host", appHost); m.put("schema", appSchema);
        return m;
    }
}
