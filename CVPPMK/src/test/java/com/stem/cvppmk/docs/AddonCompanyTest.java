package com.stem.cvppmk.docs;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
class AddonCompanyTest {
 final ObjectMapper json=new ObjectMapper();
 @SuppressWarnings("unchecked") Map<String,Object> defaults(String company){return json.convertValue(new CompanyProfile(new DataFiles(company,"",new MockEnvironment())).addonMapping(),Map.class);}
 Map<String,Object> row(Map<String,Object> mapping,String code){return AddonMapping.object(mapping,code,Collections.singletonList(code));}
 @Test void cvMappingIdentityAndCustomFieldsRemainUnchanged() {
  Map<String,Object> cv=new LinkedHashMap<>();cv.put("categories",Arrays.asList("Farm Breeding","STEM Addon","Custom"));cv.put("objects",Collections.singletonMap("STEM_REPORTWEB",Collections.singletonMap("cat","Farm Breeding")));
  assertSame(cv,AddonMapping.normalize(cv,defaults("")));assertEquals("Farm Breeding",row(cv,"STEM_REPORTWEB").get("cat"));assertTrue(defaults("other").isEmpty());
  assertTrue(AddonMapping.object(Collections.singletonMap("objects",Collections.singletonMap("NULL",null)),"NULL",Collections.singletonList("NULL")).isEmpty());
 }
 @Test void wbiRulesClassifyAllOwnedFamiliesWithoutFarmAndKeepUnknownVisible() {
  Map<String,Object> mapping=AddonMapping.normalize(Collections.emptyMap(),defaults("wbi"));
  for(String c:Arrays.asList("ST_PLCATEGORY","ST_IREAPCOMP","ST_PARAMQC","ST_UDRTH","ST_OPERQC"))assertEquals("Retail & iReapBiz",row(mapping,c).get("cat"));
  for(String c:Arrays.asList("ST_PARAM","ST_SHIFT","STEM_STDSPEC","STEM_BOMCOSD"))assertEquals("STEM Base",row(mapping,c).get("cat"));
  for(String c:Arrays.asList("STEM_REPORTWEB","STEM_MODULEWEBP","STEM_PETTYCASHCAT"))assertEquals("WebPortal SAP",row(mapping,c).get("cat"));
  for(String c:Arrays.asList("ST_ITR_DOCWEBH","ST_GIW_DOCWEBD","STEM_DAILYSTOCKH","ST_BUFFER"))assertEquals("Transaksi/Log",row(mapping,c).get("cat"));
  for(String c:Arrays.asList("STEM_MPLAN","STEM_DPLAN","STEM_TYPEOFSTAT","ST_MACHINE","STEM_MSTDANALYSIS","STEM_DSTDANALYSIS","STEM_DSTATAUDIT","STEM_DTYPEOFSTAT"))assertEquals(true,row(mapping,c).get("hide"));
  assertNotEquals(true,row(mapping,"STEM_REPORTWEB").get("hide"));assertEquals("Lainnya",row(mapping,"UNRECOGNIZED").get("cat"));assertEquals("Lainnya",row(mapping,"ST_PARAMREPORT").get("cat"));
  assertEquals("Retail & iReapBiz",AddonMapping.object(mapping,"CUSTOM_UDO",Collections.singletonList("ST_PLCATEGORY")).get("cat"));
 }
 @Test void existingLegacyMappingCannotRestoreFarmCategoryOrUnhideBreeding() {
  Map<String,Object> old=new LinkedHashMap<>();old.put("categories",Arrays.asList("Farm Breeding","STEM Addon","Khusus"));
  Map<String,Object> objects=new LinkedHashMap<>();Map<String,Object> custom=new LinkedHashMap<>();custom.put("cat","Farm Breeding");custom.put("title","Laporan Perusahaan");objects.put("STEM_REPORTWEB",custom);objects.put("STEM_MPLAN",Collections.singletonMap("hide",false));objects.put("ST_PARAMREPORT",Collections.singletonMap("cat","Farm Breeding"));old.put("objects",objects);
  Map<String,Object> m=AddonMapping.normalize(old,defaults("wbi"));assertFalse(((List<?>)m.get("categories")).contains("Farm Breeding"));assertTrue(((List<?>)m.get("categories")).contains("Khusus"));
  assertEquals("WebPortal SAP",row(m,"STEM_REPORTWEB").get("cat"));assertEquals("Laporan Perusahaan",row(m,"STEM_REPORTWEB").get("title"));assertEquals(true,row(m,"STEM_MPLAN").get("hide"));assertEquals("Lainnya",row(m,"ST_PARAMREPORT").get("cat"));
 }
}
