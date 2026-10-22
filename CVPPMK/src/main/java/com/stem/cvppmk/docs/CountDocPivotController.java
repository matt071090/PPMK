package com.stem.cvppmk.docs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.servlet.http.HttpServletRequest;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Pivot tersimpan tool Count Document (definisi saja, tanpa angka hasil). Penyimpanan di {@link CountDocPivotStore}.
 * <ul>
 *   <li>GET    /api/countdoc/pivots?scope=mine|team|all&amp;owner=   daftar ringkas (tanpa spec)</li>
 *   <li>GET    /api/countdoc/pivots/presets                        2 preset bawaan (dari kode, terkunci)</li>
 *   <li>GET    /api/countdoc/pivots/{id}                           lengkap</li>
 *   <li>POST   /api/countdoc/pivots                                {name, description, scope, spec}</li>
 *   <li>PUT    /api/countdoc/pivots/{id}                           {rev, name, description, scope, spec}; rev lama = 409</li>
 *   <li>POST   /api/countdoc/pivots/{id}/duplicate                 salinan (juga untuk preset)</li>
 *   <li>DELETE /api/countdoc/pivots/{id}                           pindah ke trash</li>
 * </ul>
 * Gerbang akses sama dengan Setup/Hana (SetupAccessController.unlocked: mode debug terbuka, di war harus password Setup).
 * Identitas: header X-Countdoc-User hanyalah label (huruf/angka/spasi/._-, maks 40, default "anon"), BUKAN kontrol akses;
 * pivot scope team terlihat semua sesi, scope private hanya disaring di daftar, DELETE tidak dibatasi per pemilik (dicatat di log).
 */
@RestController
@RequestMapping(value = "/api/countdoc/pivots", produces = MediaType.APPLICATION_JSON_VALUE)
public class CountDocPivotController {
    private static final Logger log = LoggerFactory.getLogger(CountDocPivotController.class);
    private static final Logger audit = LoggerFactory.getLogger("com.stem.cvppmk.countdoc.audit");
    private static final Pattern USER = Pattern.compile("^[A-Za-z0-9 ._-]{1,40}$");

    private final CountDocPivotStore store;
    private final SetupAccessController access;

    public CountDocPivotController(CountDocPivotStore store, SetupAccessController access) {
        this.store = store;
        this.access = access;
    }

    /** Cek akses (penolakan = default) lalu kembalikan label pemanggil. */
    private String gate(HttpServletRequest req) {
        if (!access.unlocked(req)) throw new CountDocPivotStore.PivotException(403, "Tools terkunci. Buka lewat menu Setup dan masukkan password Setup dulu.");
        String u = req.getHeader("X-Countdoc-User");
        if (u == null || u.trim().isEmpty()) return "anon";
        u = u.trim();
        if (!USER.matcher(u).matches()) throw new CountDocPivotStore.PivotException(400, "Header X-Countdoc-User tidak valid (huruf/angka/spasi/._-, maks 40).");
        return u;
    }

    private static ResponseEntity<Object> out(HttpStatus st, Object body) {
        return ResponseEntity.status(st).cacheControl(CacheControl.noStore()).contentType(MediaType.APPLICATION_JSON).body(body);
    }

    private byte[] body(HttpServletRequest req) throws IOException {
        String ct = req.getContentType();
        if (ct == null || !ct.toLowerCase().startsWith("application/json"))
            throw new CountDocPivotStore.PivotException(415, "Content-Type harus application/json.");
        if (req.getContentLengthLong() > CountDocPivotStore.MAX_FILE_BYTES)
            throw new CountDocPivotStore.PivotException(413, "Isi permintaan terlalu besar (maks 64 KB).");
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        try (InputStream in = req.getInputStream()) {
            while ((n = in.read(buf)) > 0) {
                bo.write(buf, 0, n);
                if (bo.size() > CountDocPivotStore.MAX_FILE_BYTES) throw new CountDocPivotStore.PivotException(413, "Isi permintaan terlalu besar (maks 64 KB).");
            }
        }
        return bo.toByteArray();
    }

    @GetMapping
    public ResponseEntity<Object> list(@RequestParam(required = false) String scope, @RequestParam(required = false) String owner, HttpServletRequest req) {
        String who = gate(req);
        audit.info("{} list scope={} owner={}", who, scope, owner);
        return out(HttpStatus.OK, store.list(scope, owner, who));
    }

    @GetMapping("/presets")
    public ResponseEntity<Object> presets(HttpServletRequest req) {
        String who = gate(req);
        audit.info("{} presets", who);
        return out(HttpStatus.OK, store.presets());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Object> get(@PathVariable String id, HttpServletRequest req) {
        String who = gate(req);
        audit.info("{} get {}", who, id);
        return out(HttpStatus.OK, store.get(id));
    }

    @PostMapping(consumes = MediaType.ALL_VALUE)
    public ResponseEntity<Object> create(HttpServletRequest req) throws IOException {
        String who = gate(req);
        CountDocPivotStore.Pivot p = store.create(who, store.parse(body(req)));
        audit.info("{} create {} rev={}", who, p.id, p.rev);
        return out(HttpStatus.CREATED, p);
    }

    @PutMapping(value = "/{id}", consumes = MediaType.ALL_VALUE)
    public ResponseEntity<Object> update(@PathVariable String id, HttpServletRequest req) throws IOException {
        String who = gate(req);
        CountDocPivotStore.Pivot p = store.update(id, who, store.parse(body(req)));
        audit.info("{} update {} rev={}", who, id, p.rev);
        return out(HttpStatus.OK, p);
    }

    @PostMapping("/{id}/duplicate")
    public ResponseEntity<Object> duplicate(@PathVariable String id, HttpServletRequest req) {
        String who = gate(req);
        CountDocPivotStore.Pivot p = store.duplicate(id, who);
        audit.info("{} duplicate {} -> {}", who, id, p.id);
        return out(HttpStatus.CREATED, p);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Object> delete(@PathVariable String id, HttpServletRequest req) {
        String who = gate(req);
        store.delete(id);
        audit.info("{} delete {} (dipindah ke trash)", who, id);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("deleted", id);
        return out(HttpStatus.OK, m);
    }

    @ExceptionHandler(CountDocPivotStore.PivotException.class)
    public ResponseEntity<Object> known(CountDocPivotStore.PivotException e) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("message", e.getMessage());
        if (e.current != null) m.put("current", e.current);
        return out(HttpStatus.valueOf(e.status), m);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Object> unknown(Exception e) {
        String code = UUID.randomUUID().toString().substring(0, 8);
        log.error("Kesalahan pivot Count Document [{}]", code, e);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("message", "Terjadi kesalahan di server. Sebutkan kode ini ke administrator: " + code);
        m.put("code", code);
        return out(HttpStatus.INTERNAL_SERVER_ERROR, m);
    }
}
