package com.stem.cvppmk.docs;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

/** Public display metadata only; never returns credentials or filesystem paths. */
@RestController
@RequestMapping("/api/company")
public class CompanyController {
    private final DataFiles files;
    private final String name;
    public CompanyController(DataFiles files, @Value("${docs.company-name:}") String name) {
        this.files = files; this.name = name;
    }
    @GetMapping
    public Map<String, Object> metadata() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", files.company()); out.put("name", name);
        new CompanyProfile(files).metadata(out);
        return out;
    }
}
