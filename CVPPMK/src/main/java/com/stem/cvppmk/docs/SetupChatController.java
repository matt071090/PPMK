package com.stem.cvppmk.docs;

import java.io.IOException;
import java.util.Collections;
import java.util.Map;
import javax.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Human discussion only; cannot run queries, upload masters, or change Setup decisions. */
@RestController
@RequestMapping("/api/setup/chat")
public class SetupChatController extends ChatControllerSupport {
    private final SetupAccessController access;
    public SetupChatController(@Value("${docs.data.dir:}") String dataDir, SetupAccessController access, DataFiles files) throws IOException {
        super(dataDir, "setup", files);
        this.access = access;
    }
    @ModelAttribute
    public void requireAccess(HttpServletRequest req) { access.require(req); }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> error(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatus()).body(Collections.singletonMap("message", e.getReason()));
    }
}
