package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BranchModeControllerTest {
    final ObjectMapper json=new ObjectMapper();
    JdbcTemplate jdbc; ServiceLayerClient sl; MockMvc mvc;
    @BeforeEach void setup() {
        jdbc=mock(JdbcTemplate.class); sl=mock(ServiceLayerClient.class);
        when(jdbc.queryForObject("SELECT CURRENT_SCHEMA FROM DUMMY",String.class)).thenReturn("QA");
        when(sl.companyDatabase()).thenReturn("QA");
        SetupAccessController access=new SetupAccessController(false,"");
        SetupController setup=new SetupController(jdbc,sl,new MockEnvironment(),json,access,"unused","unused","unused","","","");
        mvc=MockMvcBuilders.standaloneSetup(new BranchModeController(jdbc,sl),setup,access).build();
    }
    void expectPublic(Boolean flag) throws Exception {
        MvcResult result=mvc.perform(get("/api/branch-mode")).andExpect(status().isOk())
            .andExpect(header().string("Cache-Control","no-store")).andReturn();
        assertEquals(json.readTree("{\"branchEnabled\":"+flag+"}"),json.readTree(result.getResponse().getContentAsString()));
        assertNull(result.getRequest().getSession(false));
    }
    @ParameterizedTest @ValueSource(strings={"Y","N"})
    void lockedSessionGetsOnlyPublicFlagAndSetupUsesIdenticalReader(String flag) throws Exception {
        when(jdbc.queryForObject("SELECT \"MltpBrnchs\" FROM OADM",String.class)).thenReturn(flag);
        expectPublic("Y".equals(flag));
        mvc.perform(get("/api/setup-access")).andExpect(status().isOk()).andExpect(jsonPath("$.unlocked").value(false));
        mvc.perform(get("/api/setup/capabilities")).andExpect(status().isForbidden());
        MockHttpSession session=new MockHttpSession();session.setAttribute("cvppmk.setup.unlocked",true);
        mvc.perform(get("/api/setup/capabilities").session(session)).andExpect(status().isOk())
            .andExpect(jsonPath("$.branchEnabled").value("Y".equals(flag))).andExpect(jsonPath("$.uploadAllowed").value(true));
        verify(sl,times(2)).companyDatabase();verifyNoMoreInteractions(sl);
    }
    @ParameterizedTest @NullSource @ValueSource(strings={"","?","tNO","false"})
    void unrecognizedFlagsReturnOnlyNull(String flag) throws Exception {
        when(jdbc.queryForObject("SELECT \"MltpBrnchs\" FROM OADM",String.class)).thenReturn(flag);
        expectPublic(null);
    }
    @Test void mismatchedReadAndServiceLayerDatabasesReturnNullWithoutReadingOadm() throws Exception {
        when(sl.companyDatabase()).thenReturn("OTHER_QA");expectPublic(null);
        verify(jdbc,never()).queryForObject("SELECT \"MltpBrnchs\" FROM OADM",String.class);
    }
    @Test void missingSchemaReturnsNull() throws Exception {
        when(jdbc.queryForObject("SELECT CURRENT_SCHEMA FROM DUMMY",String.class)).thenReturn(null);expectPublic(null);
        verifyNoInteractions(sl);
    }
    @Test void databaseErrorReturnsOnlyNullWithoutLeakingExceptionDetails() throws Exception {
        when(jdbc.queryForObject("SELECT CURRENT_SCHEMA FROM DUMMY",String.class)).thenThrow(new IllegalStateException("internal diagnostic must stay private"));
        expectPublic(null);verifyNoInteractions(sl);
    }
    @ParameterizedTest @ValueSource(strings={"/api/setup/capabilities","/api/setup/steps","/api/setup/sources","/api/setup/warehouses"})
    void allSetupReadsStayLockedAndNeverTouchDependencies(String path) throws Exception {
        mvc.perform(get(path)).andExpect(status().isForbidden()).andExpect(jsonPath("$.message").value("Setup terkunci. Masukkan password Setup dulu."));
        verifyNoInteractions(jdbc,sl);
    }
}
