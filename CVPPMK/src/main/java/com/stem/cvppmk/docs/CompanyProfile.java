package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.*;

/** Public company-specific display rules. Resources contain no connection or credential data. */
final class CompanyProfile {
    final JsonNode config;
    final String group, source, usersFile;
    CompanyProfile(DataFiles files) {
        JsonNode data=new ObjectMapper().createObjectNode();
        if(!files.company().isEmpty()) try(InputStream in=getClass().getResourceAsStream("/company/"+files.company()+".json")) {
            if(in!=null)data=new ObjectMapper().readTree(in);
        } catch(java.io.IOException e) { throw new IllegalStateException("Konfigurasi company tidak valid.",e); }
        config=data;
        String fallback=files.company().isEmpty()?"PPMK":files.company().toUpperCase(Locale.ROOT);
        group=config.path("pic").path("group").asText(fallback);
        source=config.path("pic").path("source").asText(files.company().isEmpty()?"file":"none");
        usersFile="file".equals(source)?config.path("pic").path("file").asText("ppmk-users.json"):"";
        if(!group.matches("[A-Za-z0-9_-]{1,20}") || !usersFile.isEmpty()&&!usersFile.matches("[A-Za-z0-9_-]+\\.json"))
            throw new IllegalStateException("Konfigurasi PIC company tidak valid.");
    }
    Set<String> excludedUsers() {
        Set<String> out=new HashSet<>();for(JsonNode code:config.path("pic").path("excludedCodes"))out.add(code.asText().toUpperCase(Locale.ROOT));return out;
    }
    JsonNode addonMapping() {
        String resource=config.path("addons").path("mapping").asText("");
        if(resource.isEmpty())return new ObjectMapper().createObjectNode();
        if(!resource.matches("addon-mapping-[a-z0-9-]+\\.json"))throw new IllegalStateException("Konfigurasi add-on tidak valid.");
        try(InputStream in=getClass().getResourceAsStream("/"+resource)) {
            if(in==null)throw new IllegalStateException("Mapping add-on tidak tersedia.");
            return new ObjectMapper().readTree(in);
        }catch(java.io.IOException e){throw new IllegalStateException("Mapping add-on tidak valid.",e);}
    }
    void metadata(Map<String,Object> out) {
        out.put("addonCatalogs",config.path("addons").path("catalogs").isArray()?config.path("addons").path("catalogs"):Collections.emptyList());
        out.put("addonRules",addonMapping().path("rules").isArray()?addonMapping().path("rules"):Collections.emptyList());
        out.put("picGroup",group);out.put("picSource",source);out.put("picUsersFile",usersFile);
        out.put("picExcludedCodes",config.path("pic").path("excludedCodes").isArray()?config.path("pic").path("excludedCodes"):Collections.emptyList());
    }
}
