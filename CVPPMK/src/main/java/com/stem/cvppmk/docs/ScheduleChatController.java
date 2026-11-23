package com.stem.cvppmk.docs;

import java.io.IOException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Schedule and Setup share the same append-only chat implementation, with separate storage. */
@RestController
@RequestMapping("/api/schedule/chat")
public class ScheduleChatController extends ChatControllerSupport {
    public ScheduleChatController(@Value("${docs.data.dir:}") String dataDir, DataFiles files) throws IOException {
        super(dataDir, "schedule", files);
    }
}
