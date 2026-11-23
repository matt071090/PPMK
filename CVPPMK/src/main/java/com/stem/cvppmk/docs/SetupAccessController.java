package com.stem.cvppmk.docs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpSession;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Kunci menu Setup & Cut Off (bisa menulis data ke SAP lewat Service Layer).
 * - Mode debug (docs.edit.enabled=true, dijalankan dari VS Code): selalu terbuka, tanpa password.
 * - War di Tomcat: terbuka setelah password docs.setup.password benar; dicatat di sesi browser (HttpSession),
 *   tertutup lagi saat klik kembali ke Dokumentasi (logout) atau sesi habis. Password kosong = Setup terkunci total.
 */
@RestController
@RequestMapping("/api/setup-access")
public class SetupAccessController {
    private static final Logger log = LoggerFactory.getLogger(SetupAccessController.class);
    private static final String ATTR = "cvppmk.setup.unlocked";

    private final boolean dev;
    private final byte[] password;

    public SetupAccessController(@Value("${docs.edit.enabled:true}") boolean dev,
                                 @Value("${docs.setup.password:}") String password) {
        this.dev = dev;
        this.password = password.getBytes(StandardCharsets.UTF_8);
    }

    /** Dipakai controller lain (Setup, simpan mapping): true kalau mode debug atau sesi ini sudah memasukkan password. */
    public boolean unlocked(HttpServletRequest req) {
        if (dev) return true;
        HttpSession s = req.getSession(false);
        return s != null && Boolean.TRUE.equals(s.getAttribute(ATTR));
    }

    public void require(HttpServletRequest req) {
        if (!unlocked(req)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Setup terkunci. Masukkan password Setup dulu.");
    }

    @GetMapping
    public Map<String, Object> status(HttpServletRequest req) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("dev", dev);
        out.put("configured", dev || password.length > 0);
        out.put("unlocked", unlocked(req));
        return out;
    }

    @PostMapping("/login")
    public Map<String, Object> login(@RequestBody Map<String, String> body, HttpServletRequest req) {
        if (dev) return status(req);
        if (password.length == 0) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Password Setup belum diatur di server. Hubungi administrator.");
        String given = body.get("password") == null ? "" : body.get("password");
        if (!MessageDigest.isEqual(password, given.getBytes(StandardCharsets.UTF_8))) {
            log.warn("Password Setup salah dari {}", req.getRemoteAddr());
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Password Setup salah. Cek lagi lalu coba masuk.");
        }
        req.getSession(true).setAttribute(ATTR, true);
        log.info("Setup dibuka dari {}", req.getRemoteAddr());
        return status(req);
    }

    @PostMapping("/logout")
    public Map<String, Object> logout(HttpServletRequest req) {
        HttpSession s = req.getSession(false);
        if (s != null) s.removeAttribute(ATTR);
        return status(req);
    }

    // pesan validasi dikirim ke browser sebagai {message} (default Spring Boot menyembunyikan pesan error)
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> error(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatus()).body(Collections.singletonMap("message", e.getReason()));
    }
}
