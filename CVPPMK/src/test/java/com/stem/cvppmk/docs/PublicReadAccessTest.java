package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.info.BuildProperties;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import java.nio.file.Path;
import java.sql.ResultSet;
import java.util.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Real MVC access checks; every DB/SL/SLD dependency is a mock, file stores use TempDir only. */
class PublicReadAccessTest {
    @TempDir Path root;
    MockMvc mvc;
    @BeforeEach void setup() throws Exception {
        JdbcTemplate jdbc=mock(JdbcTemplate.class); ServiceLayerClient sl=mock(ServiceLayerClient.class);
        SldClient sld=mock(SldClient.class); UdfExpander udf=mock(UdfExpander.class);
        when(jdbc.queryForObject("SELECT 1 FROM DUMMY",Integer.class)).thenReturn(1);
        when(jdbc.queryForObject("SELECT \"CompnyName\" FROM OADM",String.class)).thenReturn("Company QA");
        when(udf.expand(anyString())).thenAnswer(i->new UdfExpander.Expanded(i.getArgument(0),Collections.emptyList()));
        doAnswer(i->{
            if(((String)i.getArgument(0)).contains("FROM OUTB")) {
                ResultSet rs=mock(ResultSet.class);
                when(rs.getString(1)).thenReturn("ST_PARAM");when(rs.getString(2)).thenReturn("Parameter");when(rs.getString(3)).thenReturn("0");
                ((RowCallbackHandler)i.getArgument(1)).processRow(rs);
            }
            return null;
        }).when(jdbc).query(anyString(),any(RowCallbackHandler.class));
        ObjectMapper json=new ObjectMapper();when(sl.post(anyString())).thenReturn(json.readTree("{\"value\":[]}"));
        SetupAccessController access=new SetupAccessController(false,"");
        DataFiles files=new DataFiles("wbi",root.toString(),new MockEnvironment());
        SectionController section=spy(new SectionController(jdbc,udf,false,access));
        doAnswer(i->{Map<String,Object> t=new LinkedHashMap<>();t.put("columns",Collections.emptyList());t.put("rows",Collections.emptyList());return t;})
            .when(section).run(anyString(),anyString());
        ObjectProvider<BuildProperties> build=mock(ObjectProvider.class);
        ScheduleChatController chat=new ScheduleChatController(root.toString(),files);
        mvc=MockMvcBuilders.standaloneSetup(access,new CompanyController(files,"Company QA"),section,
            new AddonController(jdbc,udf,section,access,root.resolve("mapping.json").toString(),root.toString(),false,build,files),
            new ReviewController(root.toString(),root.resolve("remarks.json").toString(),false,build,files),
            new HealthController(jdbc,sl,"","",""),new ServiceLayerController(sl),new SldController(sld),
            new ScheduleController(new ScheduleStore(files.dir(root.toString()),"schedule/default-wbi.json"),access,chat,files),chat).build();
    }
    @ParameterizedTest @ValueSource(strings={
        "/api/company","/api/setup-access","/api/review","/api/review/mode","/api/review/log?page=udt","/api/review/remarks",
        "/api/section/company-name","/api/section/company-details","/api/section/udo","/api/section/udt","/api/section/udf","/api/section/saved-queries",
        "/api/addon/objects","/api/addon/data/ST_PARAM","/api/schedule","/api/schedule/access","/api/schedule/export",
        "/api/schedule/chat?thread=umum","/api/schedule/chat/summary","/api/schedule/chat/latest?limit=5",
        "/api/health","/api/sl/admin-info","/api/sl/company-info","/api/sl/period-category","/api/sld/license"})
    void checkListHomeScheduleReadsDoNotRequireSetupSession(String path) throws Exception {
        mvc.perform(get(path)).andExpect(status().isOk());
    }
    @Test void companySelectedMappingReachesPublicAddonEndpoint() throws Exception {
        mvc.perform(get("/api/addon/objects")).andExpect(status().isOk())
            .andExpect(jsonPath("$.objects[0].code").value("ST_PARAM"))
            .andExpect(jsonPath("$.objects[0].cat").value("STEM Base"))
            .andExpect(jsonPath("$.categories[?(@ == 'Farm Breeding')]").isEmpty());
    }
    @Test void templateReferenceKeepsItsExistingSetupGate() throws Exception {
        mvc.perform(get("/api/section/template-ref")).andExpect(status().isForbidden());
    }
}
