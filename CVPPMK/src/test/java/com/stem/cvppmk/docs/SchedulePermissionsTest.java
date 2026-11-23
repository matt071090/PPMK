package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SchedulePermissionsTest {
    @TempDir Path root;
    final ObjectMapper json = new ObjectMapper();
    DataFiles files(String code) { return new DataFiles(code, root.toString(), new MockEnvironment()); }
    MockMvc controller(ScheduleStore store, DataFiles files) throws Exception {
        return MockMvcBuilders.standaloneSetup(new ScheduleController(store, new SetupAccessController(false,""),
            new ScheduleChatController(root.toString(), files), files)).build();
    }
    String body(int rev, ObjectNode data) throws Exception {
        ObjectNode b=json.createObjectNode(); b.put("rev", rev); b.set("data", data); return json.writeValueAsString(b);
    }
    @ParameterizedTest @ValueSource(strings={"", "wbi"})
    void nonAdminSavesPicAndStatusToCorrectNamespace(String code) throws Exception {
        DataFiles f=files(code);
        ScheduleStore store=new ScheduleStore(f.dir(root.toString()),code.isEmpty()?"schedule/default.json":"schedule/default-wbi.json");
        MockMvc mvc=controller(store,f);
        mvc.perform(get("/api/schedule/access")).andExpect(status().isOk()).andExpect(jsonPath("$.editable").value(false));
        ObjectNode data=(ObjectNode)store.get().data.deepCopy();
        ((ObjectNode)data.path("items").get(0)).put("pic","Tim QA").put("status","proses");
        mvc.perform(put("/api/schedule").contentType("application/json").header("X-Editor","QA").content(body(0,data)))
            .andExpect(status().isOk()).andExpect(jsonPath("$.rev").value(1));
        assertEquals("Tim QA",store.get().data.path("items").get(0).path("pic").asText());
        assertEquals("proses",store.get().data.path("items").get(0).path("status").asText());
        Path ns=code.isEmpty()?root:root.resolve(code);
        assertTrue(Files.exists(ns.resolve("schedule/schedule.json")));
        assertTrue(Files.exists(ns.resolve("schedule/chat.jsonl")));
        if(!code.isEmpty()) assertFalse(Files.exists(root.resolve("schedule/schedule.json")));
        mvc.perform(put("/api/schedule").contentType("application/json").content(body(0,data))).andExpect(status().isConflict());
    }
    @ParameterizedTest @ValueSource(strings={"", "wbi"})
    void nonAdminCannotChangeDatesNotesProjectOrItemOrder(String code) throws Exception {
        DataFiles f=files(code); ScheduleStore store=new ScheduleStore(f.dir(root.toString()));MockMvc mvc=controller(store,f);
        for(String field:Arrays.asList("startDate","endDate","note","title")) {
            ObjectNode data=(ObjectNode)store.get().data.deepCopy();
            ((ObjectNode)data.path("items").get(0)).put(field,field.endsWith("Date")?"2026-12-02":"Berubah");
            mvc.perform(put("/api/schedule").contentType("application/json").content(body(0,data))).andExpect(status().isForbidden());
        }
        ObjectNode data=(ObjectNode)store.get().data.deepCopy();((ObjectNode)data.path("project")).put("name","Berubah");
        mvc.perform(put("/api/schedule").contentType("application/json").content(body(0,data))).andExpect(status().isForbidden());
        data=(ObjectNode)store.get().data.deepCopy();
        com.fasterxml.jackson.databind.node.ArrayNode items=(com.fasterxml.jackson.databind.node.ArrayNode)data.path("items");
        com.fasterxml.jackson.databind.JsonNode first=items.get(0), second=items.get(1);items.set(0,second);items.set(1,first);
        mvc.perform(put("/api/schedule").contentType("application/json").content(body(0,data))).andExpect(status().isForbidden());
        assertEquals(0,store.get().rev);
    }
    @ParameterizedTest @ValueSource(strings={"", "wbi"})
    void fixedStemPicCannotBeChangedByNonAdminButStatusCan(String code) throws Exception {
        DataFiles f=files(code);ScheduleStore store=new ScheduleStore(f.dir(root.toString()),code.isEmpty()?"schedule/default.json":"schedule/default-wbi.json");
        MockMvc mvc=controller(store,f);
        ObjectNode data=(ObjectNode)store.get().data.deepCopy();
        for(com.fasterxml.jackson.databind.JsonNode item:data.path("items")) if("upload-master".equals(item.path("id").asText()))((ObjectNode)item).put("pic","Bukan STEM");
        mvc.perform(put("/api/schedule").contentType("application/json").content(body(0,data))).andExpect(status().isForbidden());
        assertEquals(0,store.get().rev);
        for(com.fasterxml.jackson.databind.JsonNode item:data.path("items")) if("upload-master".equals(item.path("id").asText()))((ObjectNode)item).put("pic","STEM").put("status","proses");
        mvc.perform(put("/api/schedule").contentType("application/json").content(body(0,data))).andExpect(status().isOk());
    }
    @ParameterizedTest @ValueSource(strings={"inventory","inventory-toko"})
    void wbiHandoverPicIsEditableForFreshAndPreviouslySavedStemValue(String id) throws Exception {
        for(String initial:Arrays.asList("","STEM")) {
            DataFiles f=files("wbi");Path folder=f.dir(root.resolve(id+(initial.isEmpty()?"-fresh":"-saved")).toString());
            ScheduleStore store=new ScheduleStore(folder,"schedule/default-wbi.json");
            ObjectNode data=(ObjectNode)store.get().data.deepCopy();
            if(!initial.isEmpty()) {
                for(com.fasterxml.jackson.databind.JsonNode item:data.path("items"))if(id.equals(item.path("id").asText()))((ObjectNode)item).put("pic",initial);
                store.put(0,data);store=new ScheduleStore(folder,"schedule/default-wbi.json");
            }
            assertFalse(store.fixedPicIds().contains(id));MockMvc mvc=controller(store,f);int rev=store.get().rev;
            data=(ObjectNode)store.get().data.deepCopy();
            for(com.fasterxml.jackson.databind.JsonNode item:data.path("items"))if(id.equals(item.path("id").asText()))((ObjectNode)item).put("pic","WBI:WBI-ACC-STF1").put("status","proses");
            mvc.perform(put("/api/schedule").contentType("application/json").content(body(rev,data))).andExpect(status().isOk());
            assertEquals(data,store.get().data);
            for(com.fasterxml.jackson.databind.JsonNode item:store.get().data.path("items"))if("inventory-upload".equals(item.path("id").asText())||"inventory-upload-toko".equals(item.path("id").asText()))assertEquals("STEM",item.path("pic").asText());
        }
    }
    @ParameterizedTest @ValueSource(strings={"upload-master","inventory-upload","inventory-upload-toko","ap-ar","fa","gl"})
    void wbiUploadPicRemainsLockedButStatusIsEditable(String id) throws Exception {
        DataFiles f=files("wbi");ScheduleStore store=new ScheduleStore(f.dir(root.toString()),"schedule/default-wbi.json");MockMvc mvc=controller(store,f);
        ObjectNode data=(ObjectNode)store.get().data.deepCopy();
        for(com.fasterxml.jackson.databind.JsonNode item:data.path("items"))if(id.equals(item.path("id").asText()))((ObjectNode)item).put("pic","Tim WBI");
        mvc.perform(put("/api/schedule").contentType("application/json").content(body(0,data))).andExpect(status().isForbidden());
        for(com.fasterxml.jackson.databind.JsonNode item:data.path("items"))if(id.equals(item.path("id").asText()))((ObjectNode)item).put("pic","STEM").put("status","proses");
        mvc.perform(put("/api/schedule").contentType("application/json").content(body(0,data))).andExpect(status().isOk());
        assertEquals(data,store.get().data);
    }
    @Test void wbiAdminCanOverrideFixedPicAndNonAdminKeepsThatValue() throws Exception {
        DataFiles f=files("wbi");ScheduleStore store=new ScheduleStore(f.dir(root.toString()),"schedule/default-wbi.json");MockMvc mvc=controller(store,f);
        org.springframework.mock.web.MockHttpSession session=new org.springframework.mock.web.MockHttpSession();session.setAttribute("cvppmk.setup.unlocked",true);
        ObjectNode data=(ObjectNode)store.get().data.deepCopy();
        for(com.fasterxml.jackson.databind.JsonNode item:data.path("items")) if("inventory-upload-toko".equals(item.path("id").asText()))((ObjectNode)item).put("pic","STEM pengganti");
        mvc.perform(put("/api/schedule").session(session).contentType("application/json").content(body(0,data))).andExpect(status().isOk());
        mvc.perform(put("/api/schedule").contentType("application/json").content(body(1,data))).andExpect(status().isOk());
        assertEquals(data,store.get().data);
    }
    @Test void addonCountsIncludeChildrenAndPreserveUnknown() {
        List<Map<String,Object>> ts=Arrays.asList(Collections.<String,Object>singletonMap("name","HEAD"),Collections.<String,Object>singletonMap("name","CHILD"));
        Map<String,Long> counts=new HashMap<>();counts.put("@HEAD",0L);
        assertNull(AddonController.objectRowCount(ts,counts));counts.put("@CHILD",0L);
        assertEquals(Long.valueOf(0),AddonController.objectRowCount(ts,counts));counts.put("@CHILD",3L);
        assertEquals(Long.valueOf(3),AddonController.objectRowCount(ts,counts));
    }
}
