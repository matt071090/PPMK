package com.stem.cvppmk.docs;

import java.util.Collections;
import java.util.Map;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

/** Public read-only mode, independent of the Setup session. Only boolean/null leaves this endpoint. */
@RestController
@RequestMapping("/api/branch-mode")
public class BranchModeController {
    private final JdbcTemplate jdbc;
    private final ServiceLayerClient sl;

    public BranchModeController(JdbcTemplate jdbc, ServiceLayerClient sl) {
        this.jdbc = jdbc; this.sl = sl;
    }

    @GetMapping
    public ResponseEntity<Map<String, Boolean>> mode() {
        Boolean enabled;
        try { enabled = BranchModeReader.read(jdbc, sl); }
        catch (Exception e) { enabled = null; }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
            .body(Collections.singletonMap("branchEnabled", enabled));
    }
}
