package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.sql.*;
import java.util.*;
import java.util.stream.Stream;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.jdbc.core.*;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class SetupRetailTest {
    final ObjectMapper json = new ObjectMapper();
    JdbcTemplate jdbc; ServiceLayerClient sl; SetupController controller;
    MockEnvironment env;
    static Stream<String> ids() {
        return Stream.of("st-plcategory","st-plconfig","st-udroute","st-operqc","st-instype","st-instypemap","st-paramqc","stem-pettycashcat","stem-ruletransfer","stem-orpurpose","stem-reason");
    }
    @BeforeEach void setup() throws Exception {
        jdbc=mock(JdbcTemplate.class); sl=mock(ServiceLayerClient.class);
        env=new MockEnvironment().withProperty("setup.farm-breeding.enabled","false")
            .withProperty("setup.retail.enabled","true").withProperty("setup.source.allow-target","true");
        controller=new SetupController(jdbc,sl,env,json,new SetupAccessController(true,""),"unused","unused","unused","QA","","");
        when(sl.companyDatabase()).thenReturn("QA");
        when(jdbc.queryForObject("SELECT CURRENT_SCHEMA FROM DUMMY",String.class)).thenReturn("QA");
        when(jdbc.queryForObject("SELECT \"MltpBrnchs\" FROM OADM",String.class)).thenReturn("N");
        when(jdbc.execute(any(ConnectionCallback.class))).thenReturn(true);
        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM"),eq(Long.class))).thenReturn(1L);
        when(sl.write(anyString(),anyString(),any(JsonNode.class))).thenReturn(json.createObjectNode());
    }
    JsonNode step(String id) throws Exception {
        for(JsonNode s:controller.steps()) if(id.equals(s.path("id").asText())) return s;
        throw new AssertionError(id);
    }
    ObjectNode data(JsonNode step) {
        ObjectNode d=json.createObjectNode();
        for(JsonNode f:step.path("required")) d.put(f.asText(),"Value");
        if("stem-ruletransfer".equals(step.path("id").asText())) d.put("U_ST_CK_User","User");
        return d;
    }
    ObjectNode body(ObjectNode data, boolean update) {
        ObjectNode b=json.createObjectNode().put("source","same:QA");
        b.putArray("rows").addObject().put("action",update?"update":"create").put("key","7").set("data",data);
        return b;
    }
    boolean ok(String id,ObjectNode d,boolean update) throws Exception {
        return Boolean.TRUE.equals(((Map<?,?>)((List<?>)controller.upload(id,body(d,update)).get("results")).get(0)).get("ok"));
    }
    @Test void cvDefaultCatalogIsByteEquivalentAsJson() throws Exception {
        SetupController cv=new SetupController(jdbc,sl,new MockEnvironment(),json,new SetupAccessController(true,""),"unused","unused","unused","","","");
        try(java.io.InputStream in=getClass().getResourceAsStream("/setup/steps.json")) { assertEquals(json.readTree(in),cv.steps()); }
    }
    @Test void retailReplacesAllFarmStepsAndUsesOnlyVerifiedMasterTables() throws Exception {
        int count=0;
        JsonNode evidence=json.readTree(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("docs/qa-wbi/retail-metadata.json"))).path("entities");
        for(JsonNode s:controller.steps()) if("G".equals(s.path("tier").asText())) {
            count++; assertTrue(s.path("retail").asBoolean());
            JsonNode e=evidence.path(s.path("entity").asText());
            assertEquals(e.path("table").asText(),s.path("table").asText());
            Map<String,String> types=new HashMap<>();e.path("fields").forEach(f->types.put(f.path("Name").asText(),f.path("Type").asText()));
            s.path("fieldTypes").fields().forEachRemaining(f->assertEquals(types.get(f.getKey()),f.getValue().asText()));
        }
        assertEquals(11,count);
        assertThrows(ResponseStatusException.class,()->controller.data("breeding-params",null));
    }
    @Test void targetCanBeASourceOnlyWhenExplicitlyEnabled() {
        when(jdbc.queryForList(startsWith("SELECT SCHEMA_NAME"),eq(String.class))).thenReturn(Arrays.asList("QA","OTHER"));
        List<?> sources=(List<?>)controller.sources().get("same");assertEquals(1,sources.size());
        assertEquals("same:QA",((Map<?,?>)sources.get(0)).get("id"));
        env.setProperty("setup.source.allow-target","false"); assertTrue(((List<?>)controller.sources().get("same")).isEmpty());
    }
    @ParameterizedTest @MethodSource("ids") void verifiedRetailCreatesOnlySendWhitelistedFields(String id) throws Exception {
        JsonNode s=step(id); ObjectNode d=data(s);
        if(id.equals("st-udroute")) d.putArray("ST_UDRTDCollection").addObject().put("U_WCCode","WC1").put("U_WCDesc","Name | ^ quote \"").put("U_Seq",1);
        assertTrue(ok(id,d,false)); verify(sl).write(eq("POST"),eq(s.path("entity").asText()),eq(d));
    }
    @ParameterizedTest @MethodSource("ids") void headerUpdatesUseVerifiedKeyType(String id) throws Exception {
        assertTrue(ok(id,json.createObjectNode().put("Name","Changed"),true));
        verify(sl).write(eq("PATCH"),eq(step(id).path("entity").asText()+(id.equals("stem-ruletransfer")?"(7)":"('7')")),any(JsonNode.class));
    }
    @Test void emptyMissingOrUnknownSourceBlocksRetailBeforeAnySLWrite() throws Exception {
        ObjectNode d=data(step("st-instype"));
        for(String source:Arrays.asList("","same:OTHER","conn:untrusted")) {
            ObjectNode b=body(d,false).put("source",source);
            assertThrows(ResponseStatusException.class,()->controller.upload("st-instype",b));
        }
        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM"),eq(Long.class))).thenReturn(0L);
        assertThrows(ResponseStatusException.class,()->controller.upload("st-instype",body(d,false)));
        when(jdbc.queryForObject(startsWith("SELECT COUNT(*) FROM"),eq(Long.class))).thenReturn(null);
        assertThrows(ResponseStatusException.class,()->controller.upload("st-instype",body(d,false)));
        verify(sl,never()).write(anyString(),anyString(),any());
    }
    @Test void payloadRejectsUnverifiedFieldsWrongTypesAutomaticKeysAndDetailUpdates() throws Exception {
        assertFalse(ok("st-plcategory",data(step("st-plcategory")).put("U_Discount",5),false));
        assertFalse(ok("st-plcategory",data(step("st-plcategory")).put("U_Level","1"),false));
        assertFalse(ok("stem-ruletransfer",data(step("stem-ruletransfer")).put("Code",1),false));
        assertFalse(ok("st-instype",json.createObjectNode().put("Code","Changed"),true));
        ObjectNode d=data(step("st-udroute")); d.putArray("ST_UDRTDCollection").addObject().put("LineId",1);
        assertFalse(ok("st-udroute",d,false));
        assertFalse(ok("st-udroute",d,true));
        verify(sl,never()).write(anyString(),anyString(),any());
    }
    @Test void populatedTargetIsReusedAsSourceWithoutOpeningAnySourceConnection() throws Exception {
        Map<String,Object> result=new LinkedHashMap<>();result.put("columns",Arrays.asList("Code"));result.put("rows",Collections.singletonList(Collections.singletonList("A")));
        when(jdbc.execute(any(ConnectionCallback.class))).thenReturn(result);
        Map<String,Object> d=controller.data("st-instype","same:QA");assertSame(d.get("target"),d.get("source"));
        verify(jdbc,times(1)).execute(any(ConnectionCallback.class)); verifyNoInteractions(sl);
    }
    @Test void retailUpdateRejectsMissingOrNonIntegerKeysBeforeSL() throws Exception {
        for(String key:Arrays.asList("","abc","1.5","2147483648")) {
            ObjectNode b=body(json.createObjectNode().put("Name","Changed"),true);
            ((ObjectNode)b.path("rows").get(0)).put("key",key);
            Map<?,?> result=(Map<?,?>)((List<?>)controller.upload("stem-ruletransfer",b).get("results")).get(0);
            assertEquals(false,result.get("ok"));
        }
        verify(sl,never()).write(anyString(),anyString(),any());
    }
    @Test void emptyRetailTableShowsUnavailableAndDoesNotQuerySource() throws Exception {
        Connection con=mock(Connection.class);PreparedStatement ps=mock(PreparedStatement.class);Statement st=mock(Statement.class);
        ResultSet exists=mock(ResultSet.class),rows=mock(ResultSet.class);ResultSetMetaData md=mock(ResultSetMetaData.class);
        when(con.prepareStatement(anyString())).thenReturn(ps);when(ps.executeQuery()).thenReturn(exists);when(exists.next()).thenReturn(true);when(exists.getInt(1)).thenReturn(1);
        when(con.createStatement()).thenReturn(st);when(st.executeQuery(anyString())).thenReturn(rows);when(rows.getMetaData()).thenReturn(md);when(md.getColumnCount()).thenReturn(1);when(md.getColumnLabel(1)).thenReturn("Code");when(rows.next()).thenReturn(false);
        when(jdbc.execute(any(ConnectionCallback.class))).thenAnswer(inv->((ConnectionCallback<?>)inv.getArgument(0)).doInConnection(con));
        Map<?,?> target=(Map<?,?>)controller.data("st-instype","same:QA").get("target");assertEquals(true,target.get("unavailable"));
        assertTrue(target.get("message").toString().contains("belum berisi data"));
        verify(con).setReadOnly(true);
    }
    @Test void routeJoinPreservesOrderAndJSONEscapingWithoutCopyingSystemIdentity() throws Exception {
        Map<String,Object> h=new LinkedHashMap<>(),d=new LinkedHashMap<>();
        h.put("columns",new ArrayList<>(Arrays.asList("Code","Name"))); h.put("rows",Arrays.asList(new ArrayList<>(Arrays.asList("A","Route")),new ArrayList<>(Arrays.asList("B","No detail"))));
        d.put("columns",Arrays.asList("_parent","U_WCCode","U_WCDesc","U_Seq"));
        d.put("rows",Arrays.asList(Arrays.asList("A","W1","Name | ^ \" quote","2"),Arrays.asList("A","W2",null,"3")));
        SetupRetailPolicy.attachDetails(h,d,step("st-udroute").path("children").get(0),json);
        List<List<String>> rows=(List<List<String>>)h.get("rows");JsonNode detail=json.readTree(rows.get(0).get(2));
        assertEquals("Name | ^ \" quote",detail.get(0).path("U_WCDesc").asText()); assertEquals(2,detail.get(0).path("U_Seq").asInt());assertFalse(detail.get(1).has("U_WCDesc")); assertEquals("[]",rows.get(1).get(2));
    }
}
