package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CompanyDataTest {
    @TempDir Path root;
    final ObjectMapper mapper = new ObjectMapper();
    DataFiles company(String code) { return new DataFiles(code,root.toString(),new MockEnvironment()); }

    @ParameterizedTest @ValueSource(strings={"../wbi","WBI","wbi/test","wbi\\test","wbi..","-wbi","wbi-","wbi test","wbi:test"})
    void unsafeCompanyCodesAreRejected(String code) { assertThrows(IllegalArgumentException.class,()->company(code)); }

    @Test void legacyCvPathsAndNamesStayExactlyTheSame() throws Exception {
        DataFiles cv=company("");
        assertEquals(root.toAbsolutePath(),cv.dir(root.toString()));
        assertEquals(Paths.get("remarks.json").toAbsolutePath(),cv.legacyFile(root.toString(),"remarks.json"));
        assertEquals("schedule.json",cv.filename("schedule.json"));
        assertEquals("count-document.csv",cv.filename("count-document.csv"));
    }
    @Test void namespacedFilesAndExportsStayInsideCompanyRoot() throws Exception {
        DataFiles wbi=company("wbi");
        assertEquals(root.resolve("wbi"),wbi.dir(root.toString()));
        assertEquals(root.resolve("wbi/remarks.json"),wbi.legacyFile(root.toString(),"remarks.json"));
        assertEquals("schedule-wbi.json",wbi.filename("schedule.json"));
        assertEquals("count-document-wbi.csv",wbi.filename("count-document.csv"));
    }
    @Test void wbiProfileRequiresNamespaceAndDataRoot() {
        MockEnvironment env=new MockEnvironment(); env.setActiveProfiles("wbi");
        assertThrows(IllegalArgumentException.class,()->new DataFiles("",root.toString(),env));
        assertThrows(IllegalArgumentException.class,()->new DataFiles("cv",root.toString(),env));
        assertThrows(IllegalArgumentException.class,()->new DataFiles("wbi","",env));
        assertDoesNotThrow(()->new DataFiles("wbi",root.toString(),env));
    }
    @Test void wbiSeedHasIdenticalDatesButNoPicOrProgress() throws Exception {
        ScheduleStore.Document cv=new ScheduleStore(company("").dir(root.toString())).get();
        ScheduleStore.Document wbi=new ScheduleStore(company("wbi").dir(root.toString()),"schedule/default-wbi.json").get();
        assertEquals(cv.data.path("project").path("goLiveDate"),wbi.data.path("project").path("goLiveDate"));
        assertEquals(37,cv.data.path("items").size());
        assertEquals(40,wbi.data.path("items").size());
        Map<String,JsonNode> cvItems=new HashMap<>();
        for(JsonNode a:cv.data.path("items")) cvItems.put(a.path("id").asText(),a);
        assertTrue(cvItems.containsKey("training"));assertTrue(cvItems.containsKey("training-1"));
        for(JsonNode b:wbi.data.path("items")) {
            JsonNode a=cvItems.get(b.path("id").asText());
            if(a!=null) a.fieldNames().forEachRemaining(k->{ if(k.endsWith("Date")||k.endsWith("Time")) assertEquals(a.get(k),b.get(k)); });
            assertEquals(wbiFixedIds().contains(b.path("id").asText())?"STEM":"",b.path("pic").asText()); assertEquals("belum",b.path("status").asText());
        }
    }
    @Test void wbiSeedHasNoTrainingOrFarmAndIncludesBothStockLocations() throws Exception {
        JsonNode data=new ScheduleStore(company("wbi").dir(root.toString()),"schedule/default-wbi.json").get().data;
        assertFalse(data.toString().toLowerCase(java.util.Locale.ROOT).contains("training"));
        assertFalse(data.toString().toLowerCase(java.util.Locale.ROOT).contains("farm"));
        Map<String,Integer> sections=new HashMap<>();
        for(JsonNode it:data.path("items")) {
            String section=it.path("section").asText();sections.put(section,sections.getOrDefault(section,0)+1);
            if("opname".equals(it.path("id").asText())) assertTrue(it.path("note").asText().contains("Produksi / Pabrik / Central Kitchen"));
            if("master-E0".equals(it.path("id").asText())) assertEquals("Add-On Master Data (STEM, Retail, iReapBiz)",it.path("title").asText());
        }
        assertEquals(Integer.valueOf(18),sections.get("milestone"));assertEquals(Integer.valueOf(16),sections.get("master"));
        assertEquals(Integer.valueOf(6),sections.get("balance"));assertEquals(3,sections.size());
        assertTrue(data.path("rules").toString().contains("Produksi / Pabrik / Central Kitchen"));
    }
    @Test void midnightIsSingleTimeAndKeepsCalendarDate() throws Exception {
        JsonNode data=new ScheduleStore(company("wbi").dir(root.toString()),"schedule/default-wbi.json").get().data.deepCopy();
        ObjectNode row=null;for(JsonNode item:data.path("items"))if("balance-inv-toko".equals(item.path("id").asText()))row=(ObjectNode)item;
        assertNotNull(row);ScheduleStore.validate(data);assertEquals("2026-12-31",row.path("uploadDate").asText());
        for(String invalid:Arrays.asList("24:01","24:00-24:00","25:00")) {row.put("uploadTime",invalid);assertThrows(ScheduleStore.ScheduleException.class,()->ScheduleStore.validate(data));}
    }
    private Set<String> wbiFixedIds() { return new HashSet<>(Arrays.asList("upload-master","inventory-upload","inventory-upload-toko","ap-ar","fa","gl")); }
    @Test void wbiLocationsHaveSeparateTimesAndStemRoles() throws Exception {
        ScheduleStore store=new ScheduleStore(company("wbi").dir(root.toString()),"schedule/default-wbi.json");
        Map<String,JsonNode> items=new HashMap<>();for(JsonNode it:store.get().data.path("items"))items.put(it.path("id").asText(),it);
        assertEquals(wbiFixedIds(),store.fixedPicIds());
        assertEquals("19:00",items.get("balance-inv").path("handoverTime").asText());
        assertEquals("19:00-20:00",items.get("balance-inv").path("uploadTime").asText());
        assertEquals("22:00",items.get("balance-inv-toko").path("handoverTime").asText());
        assertEquals("24:00",items.get("balance-inv-toko").path("uploadTime").asText());
        assertTrue(items.get("inventory-toko").path("note").asText().contains("31 Desember 2026 pukul 22:00"));
        assertFalse(store.get().data.toString().matches("(?is).*(asumsi|Fakhri|koordinator|TODO|FIXME|worker).*"));
        assertTrue(items.get("inventory-upload-toko").path("note").asText().contains("pukul 24:00"));
        for(String id:Arrays.asList("opname","cutoff","inventory","inventory-upload")) {
            assertEquals(items.get(id).path("startDate"),items.get(id+"-toko").path("startDate"));
            assertEquals(items.get(id).path("endDate"),items.get(id+"-toko").path("endDate"));
            assertTrue(items.get(id).path("title").asText().contains("Produksi / Pabrik / Central Kitchen"));
            assertTrue(items.get(id+"-toko").path("title").asText().contains("Toko / Store"));
        }
    }
    @Test void newWbiSeedDoesNotMigrateAnExistingScheduleWithTraining() throws Exception {
        Path legacy=root.resolve("existing-wbi");ScheduleStore original=new ScheduleStore(legacy,"schedule/default.json");
        ScheduleStore.Document before=original.get();
        ((ObjectNode)before.data.path("project")).put("name","PT Warung Begok Indonesia");original.put(before.rev,before.data);
        ScheduleStore.Document after=new ScheduleStore(legacy,"schedule/default-wbi.json").get();
        assertEquals(37,after.data.path("items").size());assertEquals(before.data,after.data);
        assertTrue(after.data.toString().contains("training-1"));assertEquals(1,after.rev);
    }

    @Test void schedulesShareBaseDirWithoutOverwritingEachOtherAndKeepAtomicWrites() throws Exception {
        ScheduleStore cv=new ScheduleStore(root),wbi=new ScheduleStore(root.resolve("wbi"),"schedule/default-wbi.json");
        ScheduleStore.Document a=cv.get(),b=wbi.get();
        ObjectNode next=((ObjectNode)a.data).deepCopy(); ((ObjectNode)next.path("items").get(0)).put("pic","Tim CV");
        cv.put(a.rev,next);
        assertEquals("",wbi.get().data.path("items").get(0).path("pic").asText());
        ObjectNode wb=((ObjectNode)b.data).deepCopy(); ((ObjectNode)wb.path("items").get(0)).put("pic","Tim WBI");
        wbi.put(b.rev,wb);
        assertEquals("Tim CV",cv.get().data.path("items").get(0).path("pic").asText());
        assertEquals(409,assertThrows(ScheduleStore.ScheduleException.class,()->wbi.put(b.rev,wb)).status);
        assertEquals(1,wbi.get().rev);
        try(java.util.stream.Stream<Path> paths=Files.walk(root)) { assertFalse(paths.anyMatch(p->p.toString().endsWith(".tmp"))); }
    }
    @Test void existingScheduleIsNeverReseededOnNewBuild() throws Exception {
        ScheduleStore store=new ScheduleStore(root,"schedule/default-wbi.json"); ScheduleStore.Document d=store.get();
        ((ObjectNode)d.data.path("items").get(0)).put("pic","User WBI"); store.put(d.rev,d.data);
        assertEquals("User WBI",new ScheduleStore(root,"schedule/default.json").get().data.path("items").get(0).path("pic").asText());
    }
    @Test void corruptScheduleIsPreserved() throws Exception {
        new ScheduleStore(root).get(); Path file=root.resolve("schedule/schedule.json"); Files.write(file,"broken".getBytes("UTF-8"));
        assertThrows(ScheduleStore.ScheduleException.class,()->new ScheduleStore(root).get());
        assertEquals("broken",new String(Files.readAllBytes(file),"UTF-8"));
    }
    @Test void countdocChecksCustomAndPivotsUseCentralNamespace() throws Exception {
        DataFiles cv=company(""),wbi=company("wbi");
        CountDocCheckStore cvc=new CountDocCheckStore(root.toString(),cv),wc=new CountDocCheckStore(root.toString(),wbi);
        cvc.put("q1",0,"cocok","CV"); wc.put("q1",0,"selisih","WBI");
        assertEquals("CV",cvc.all().get("q1").note); assertEquals("WBI",wc.all().get("q1").note);
        CountDocCustomStore cvq=new CountDocCustomStore(root.toString(),cv),wq=new CountDocCustomStore(root.toString(),wbi);
        cvq.create("Query CV","","SELECT 1 AS Counted FROM DUMMY","");
        wq.create("Query WBI","","SELECT 1 AS Counted FROM DUMMY","");
        assertEquals("Query CV",cvq.all().get(0).name); assertEquals("Query WBI",wq.all().get(0).name);
        CountDocPivotStore cvp=new CountDocPivotStore(root.toString(),cv),wp=new CountDocPivotStore(root.toString(),wbi);
        CountDocPivotStore.Input cp=new CountDocPivotStore.Input(); cp.name="Pivot CV";cp.scope="team";cp.spec=cvp.presets().get(0).spec;
        CountDocPivotStore.Input bp=new CountDocPivotStore.Input(); bp.name="Pivot WBI";bp.scope="team";bp.spec=wp.presets().get(0).spec;
        cvp.create("QA",cp);wp.create("QA",bp);
        assertEquals("Pivot CV",cvp.list("team",null,"QA").get(0).get("name"));assertEquals("Pivot WBI",wp.list("team",null,"QA").get(0).get("name"));
        for(String p:Arrays.asList("countdoc/queries/custom","countdoc/pivots","countdoc/trash")) {
            assertTrue(Files.isDirectory(root.resolve(p))); assertTrue(Files.isDirectory(root.resolve("wbi").resolve(p)));
        }
    }
    @Test void chatSharesImplementationButSeparatesModuleAndCompanyData() throws Exception {
        ScheduleChatController cv=new ScheduleChatController(root.toString(),company(""));
        ScheduleChatController wbi=new ScheduleChatController(root.toString(),company("wbi"));
        SetupChatController setup=new SetupChatController(root.toString(),new SetupAccessController(true,""),company("wbi"));
        cv.append("umum","CV","Catatan CV",null); wbi.append("umum","WBI","Catatan WBI",null); setup.append("setup:umum","WBI","Setup WBI",null);
        assertTrue(Files.exists(root.resolve("schedule/chat.jsonl"))); assertTrue(Files.exists(root.resolve("wbi/schedule/chat.jsonl"))); assertTrue(Files.exists(root.resolve("wbi/setup/chat.jsonl")));
        assertFalse(new String(Files.readAllBytes(root.resolve("wbi/setup/chat.jsonl")),"UTF-8").contains("Catatan CV"));
    }
    @Test void setupChatRequiresSetupSessionAndScheduleChatRetainsAccessContract() throws Exception {
        SetupChatController setup=new SetupChatController(root.toString(),new SetupAccessController(false,""),company("wbi"));
        MockMvc mvc=MockMvcBuilders.standaloneSetup(setup).build();
        mvc.perform(get("/api/setup/chat/summary")).andExpect(status().isForbidden());
        mvc.perform(post("/api/setup/chat").contentType("application/json").content("{\"thread\":\"setup:umum\",\"editor\":\"QA\",\"text\":\"Tes\"}")).andExpect(status().isForbidden());
        assertFalse(Files.exists(root.resolve("wbi/setup/chat.jsonl")));
    }
    @Test void setupChatEscapedTextIsSavedLiterallyAndReturnsJson() throws Exception {
        SetupChatController setup=new SetupChatController(root.toString(),new SetupAccessController(true,""),company("wbi"));
        MockMvc mvc=MockMvcBuilders.standaloneSetup(setup).build();
        mvc.perform(post("/api/setup/chat").contentType("application/json").content("{\"thread\":\"setup:warehouses\",\"editor\":\"QA\",\"text\":\"<script>tes</script>\"}")).andExpect(status().isOk());
        mvc.perform(get("/api/setup/chat").param("thread","setup:warehouses")).andExpect(status().isOk()).andExpect(jsonPath("$.messages[0].text").value("<script>tes</script>"));
    }
    @Test void scheduleExportIncludesCompanyCode() throws Exception {
        DataFiles files=company("wbi");
        ScheduleController ctrl=new ScheduleController(new ScheduleStore(root,"schedule/default-wbi.json"),new SetupAccessController(true,""),new ScheduleChatController(root.toString(),files),files);
        assertEquals("attachment; filename=\"schedule-wbi.json\"",ctrl.export().getHeaders().getFirst("Content-Disposition"));
    }
}
