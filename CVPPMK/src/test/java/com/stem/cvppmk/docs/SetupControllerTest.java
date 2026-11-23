package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.web.server.ResponseStatusException;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.*;
import java.util.stream.Stream;
import org.junit.jupiter.params.provider.Arguments;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class SetupControllerTest {
    final ObjectMapper json = new ObjectMapper();
    JdbcTemplate jdbc;
    ServiceLayerClient sl;
    SetupController controller;

    @BeforeEach void setup() throws Exception {
        jdbc = mock(JdbcTemplate.class);
        sl = mock(ServiceLayerClient.class);
        when(sl.companyDatabase()).thenReturn("QA");
        when(jdbc.queryForObject("SELECT CURRENT_SCHEMA FROM DUMMY", String.class)).thenReturn("QA");
        when(jdbc.queryForObject("SELECT \"MltpBrnchs\" FROM OADM", String.class)).thenReturn("Y");
        when(jdbc.queryForList(contains("FROM OBPL"), eq(String.class), anyString())).thenAnswer(inv ->
            "1".equals(inv.getArgument(2)) ? Collections.singletonList("1") : Collections.emptyList());
        when(sl.write(anyString(), anyString(), any(JsonNode.class))).thenReturn(json.createObjectNode());
        controller = new SetupController(jdbc, sl, new MockEnvironment(), json, new SetupAccessController(true, ""), "unused", "unused", "unused", "", "", "");
    }

    static Stream<Arguments> matrix() {
        List<Arguments> cases = new ArrayList<>();
        for (String id : Arrays.asList("warehouses", "asset-classes", "document-numbering"))
            for (boolean branches : new boolean[]{true, false})
                for (String branch : new String[]{"", "0", "1", "999"})
                    for (boolean update : new boolean[]{false, true}) cases.add(Arguments.of(id, branches, branch, update));
        return cases.stream();
    }

    ObjectNode base(String id) {
        ObjectNode data = json.createObjectNode();
        if (id.equals("warehouses")) return data.put("WarehouseCode", "GDG01").put("WarehouseName", "Gudang");
        if (id.equals("asset-classes")) return data.put("Code", "MESIN").put("Description", "Mesin");
        return data.put("Document", "13").put("Name", "IN26").put("PeriodIndicator", "2026");
    }
    ObjectNode request(ObjectNode data, boolean update) {
        ObjectNode row = json.createObjectNode().put("action", update ? "update" : "create").put("key", "7");
        row.set("data", data);
        ObjectNode body = json.createObjectNode(); body.putArray("rows").add(row); return body;
    }

    @ParameterizedTest(name="{0} branch={1} value={2} update={3}") @MethodSource("matrix")
    void validatesBranchMatrixBeforeCallingServiceLayer(String id, boolean branches, String branch, boolean update) throws Exception {
        when(jdbc.queryForObject("SELECT \"MltpBrnchs\" FROM OADM", String.class)).thenReturn(branches ? "Y" : "N");
        String field = id.equals("warehouses") ? "BusinessPlaceID" : "BPLID";
        ObjectNode data = base(id);
        if (branch.isEmpty()) data.putNull(field); else data.put(field, Integer.parseInt(branch));
        boolean valid = branches ? branch.equals("1") || (id.equals("document-numbering") && branch.isEmpty()) : branch.isEmpty();
        Map<?,?> result = ((List<Map<?,?>>) controller.upload(id, request(data, update)).get("results")).get(0);
        assertEquals(valid, result.get("ok"));
        if (valid) {
            org.mockito.ArgumentCaptor<JsonNode> sent = org.mockito.ArgumentCaptor.forClass(JsonNode.class);
            verify(sl).write(anyString(), anyString(), sent.capture());
            JsonNode actual = id.equals("document-numbering") ? sent.getValue().path("Series") : sent.getValue();
            assertEquals(branches, actual.has(field));
            if (!branches) verify(jdbc, never()).queryForList(contains("OBPL"), eq(String.class), anyString());
        } else verify(sl, never()).write(anyString(), anyString(), any());
    }

    @Test void branchZeroIsAcceptedOnlyWhenItIsAnActualTargetBranch() throws Exception {
        when(jdbc.queryForList(contains("FROM OBPL"), eq(String.class), eq("0"))).thenReturn(Collections.singletonList("0"));
        ObjectNode data = base("warehouses").put("BusinessPlaceID", 0);
        assertEquals(true, ((List<Map<?,?>>)controller.upload("warehouses", request(data,false)).get("results")).get(0).get("ok"));
    }

    @ParameterizedTest @NullAndEmptySource @ValueSource(strings={"0", "?", "false"})
    void uncertainModeBlocksAllWrites(String flag) throws Exception {
        when(jdbc.queryForObject("SELECT \"MltpBrnchs\" FROM OADM", String.class)).thenReturn(flag);
        assertEquals(false, controller.capabilities().get("uploadAllowed"));
        assertNull(controller.capabilities().get("branchEnabled"));
        assertThrows(ResponseStatusException.class, () -> controller.upload("warehouses", request(base("warehouses"),false)));
        verify(sl, never()).write(anyString(), anyString(), any());
    }

    @Test void mismatchedTargetFailsClosed() throws Exception {
        when(sl.companyDatabase()).thenReturn("OTHER");
        assertEquals(false, controller.capabilities().get("uploadAllowed"));
        assertThrows(ResponseStatusException.class, () -> controller.upload("warehouses", request(base("warehouses"),false)));
        verify(sl, never()).write(anyString(), anyString(), any());
    }

    @Test void requiredFieldsAreCheckedOnServerToo() throws Exception {
        when(jdbc.queryForObject("SELECT \"MltpBrnchs\" FROM OADM", String.class)).thenReturn("N");
        Map<?,?> result = ((List<Map<?,?>>)controller.upload("warehouses", request(json.createObjectNode(),false)).get("results")).get(0);
        assertEquals(false,result.get("ok")); verify(sl,never()).write(anyString(),anyString(),any());
    }

    @Test void blankAndNullNestedBranchFieldsNeverReachSL() throws Exception {
        when(jdbc.queryForObject("SELECT \"MltpBrnchs\" FROM OADM", String.class)).thenReturn("N");
        ObjectNode data = json.readValue("{\"CardCode\":\"C1\",\"CardName\":\"Pelanggan\",\"CardType\":\"cCustomer\",\"DefaultBranch\":null,\"BPBranchAssignment\":[],\"Other\":[{\"U_BRANCH\":\"\",\"BPLID\":null,\"Name\":\"A\"}]}",ObjectNode.class);
        controller.upload("business-partners",request(data,false));
        org.mockito.ArgumentCaptor<JsonNode> sent = org.mockito.ArgumentCaptor.forClass(JsonNode.class);
        verify(sl).write(eq("POST"),eq("BusinessPartners"),sent.capture());
        assertEquals("{\"CardCode\":\"C1\",\"CardName\":\"Pelanggan\",\"CardType\":\"cCustomer\",\"Other\":[{\"Name\":\"A\"}]}",sent.getValue().toString());
    }

    @Test void directNestedBranchInputIsRejected() throws Exception {
        when(jdbc.queryForObject("SELECT \"MltpBrnchs\" FROM OADM", String.class)).thenReturn("N");
        ObjectNode data=base("warehouses"); data.putArray("Other").addObject().put("BPLID",0);
        assertEquals(false,((List<Map<?,?>>)controller.upload("warehouses",request(data,false)).get("results")).get(0).get("ok"));
        verify(sl,never()).write(anyString(),anyString(),any());
    }

    @ParameterizedTest @ValueSource(ints={0,1})
    void missingShiftUdfUsesNullAlias(int present) throws Exception {
        Connection conn=mock(Connection.class); Statement st=mock(Statement.class); ResultSet rs=mock(ResultSet.class);
        when(conn.createStatement()).thenReturn(st); when(st.executeQuery(anyString())).thenReturn(rs);
        when(rs.next()).thenReturn(true); when(rs.getInt(1)).thenReturn(present);
        String sql="SELECT \"Code\", \"U_BRANCH\" FROM \"@ST_SHIFT\"";
        String result=SetupController.compatibleSql(conn,"st-shift",sql);
        assertEquals(present==0,result.contains("CAST(NULL AS NVARCHAR(254)) AS \"U_BRANCH\""));
        if(present==1) assertEquals(sql,result);
        verify(rs).close(); verify(st).close();
    }

    @ParameterizedTest @ValueSource(ints={0,1})
    void optionalAddonAvailabilityChecksExactTargetTables(int present) throws Exception {
        Connection conn=mock(Connection.class); java.sql.PreparedStatement st=mock(java.sql.PreparedStatement.class); ResultSet rs=mock(ResultSet.class);
        when(conn.prepareStatement(anyString())).thenReturn(st); when(st.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true); when(rs.getInt(1)).thenReturn(present);
        assertEquals(present==1,SetupController.addonTablesExist(conn,"SELECT \"Code\" FROM \"@STEM_MSTD\""));
        verify(st).setString(1,"@STEM_MSTD"); verify(rs).close(); verify(st).close();
    }

    @Test void unavailableFarmBreedingRejectsDirectUpload() throws Exception {
        assertThrows(ResponseStatusException.class,()->controller.upload("stem-mstd",request(json.createObjectNode().put("Code","1").put("Name","Tes"),false)));
        verify(sl,never()).write(anyString(),anyString(),any());
    }

    @Test void retailProfileDisablesAllFarmStepsEvenIfSharedTablesExist() throws Exception {
        SetupController retail = new SetupController(jdbc, sl, new MockEnvironment().withProperty("setup.farm-breeding.enabled","false"),json,
            new SetupAccessController(true,""),"unused","unused","unused","","","");
        for(JsonNode s:retail.steps()) assertNotEquals("G",s.path("tier").asText());
        assertThrows(ResponseStatusException.class,()->retail.data("breeding-params",null));
        assertThrows(ResponseStatusException.class,()->retail.upload("breeding-params",request(json.createObjectNode(),false)));
        verifyNoInteractions(jdbc); verify(sl,never()).write(anyString(),anyString(),any());
    }
}
