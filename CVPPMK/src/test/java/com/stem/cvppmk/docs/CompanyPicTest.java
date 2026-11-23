package com.stem.cvppmk.docs;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.env.MockEnvironment;import org.springframework.test.web.servlet.MockMvc;import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.Path;import java.util.*;
import static org.junit.jupiter.api.Assertions.*;import static org.mockito.Mockito.*;import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
class CompanyPicTest {
 @TempDir Path root;
 DataFiles files(String code){return new DataFiles(code,root.toString(),new MockEnvironment());}
 @Test void publicMetadataSelectsPerCompanyDirectoryWithoutBorrowingCvUsers() throws Exception {
  CompanyProfile cv=new CompanyProfile(files("")),wbi=new CompanyProfile(files("wbi")),other=new CompanyProfile(files("other"));
  assertEquals("PPMK",cv.group);assertEquals("file",cv.source);assertEquals("ppmk-users.json",cv.usersFile);
  assertEquals("WBI",wbi.group);assertEquals("sap",wbi.source);assertEquals("",wbi.usersFile);assertTrue(wbi.excludedUsers().contains("WORKFLOW"));
  assertEquals("none",other.source);assertEquals("OTHER",other.group);
  MockMvc mvc=MockMvcBuilders.standaloneSetup(new CompanyController(files("wbi"),"Company QA")).build();
  mvc.perform(get("/api/company")).andExpect(status().isOk()).andExpect(jsonPath("$.picGroup").value("WBI")).andExpect(jsonPath("$.picSource").value("sap"));
 }
 @Test void savedWbiPicLogResolvesSapCodeAndUsernameWithoutCvFile() throws Exception {
  ObjectMapper mapper=new ObjectMapper();DataFiles f=files("wbi");ScheduleStore store=new ScheduleStore(f.dir(root.toString()),"schedule/default-wbi.json");
  SectionController section=mock(SectionController.class);
  Map<String,Object> table=new LinkedHashMap<>();table.put("columns",Arrays.asList("USER_CODE","U_NAME","Locked"));table.put("rows",Arrays.asList(Arrays.asList("WBI-ACC-STF1","Rizky","N")));
  when(section.section("users",null)).thenReturn(Collections.singletonMap("results",Collections.singletonMap("users",table)));
  ScheduleChatController chat=new ScheduleChatController(root.toString(),f);
  MockMvc mvc=MockMvcBuilders.standaloneSetup(new ScheduleController(store,new SetupAccessController(false,""),chat,f,section)).build();
  com.fasterxml.jackson.databind.node.ObjectNode data=(com.fasterxml.jackson.databind.node.ObjectNode)store.get().data.deepCopy();
  ((com.fasterxml.jackson.databind.node.ObjectNode)data.path("items").get(0)).put("pic","WBI:WBI-ACC-STF1");
  Map<String,Object> body=new LinkedHashMap<>();body.put("rev",0);body.put("data",data);
  mvc.perform(put("/api/schedule").contentType("application/json").content(mapper.writeValueAsString(body))).andExpect(status().isOk());
  String messages=new String(java.nio.file.Files.readAllBytes(f.dir(root.toString()).resolve("schedule/chat.jsonl")),"UTF-8");assertTrue(messages.contains("WBI · WBI-ACC-STF1 (Rizky)"));assertFalse(messages.contains("PPMK"));
 }
}
