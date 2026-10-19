-- Setup G · Addon Farm Breeding · @STEM_TYPEOFSTAT (Type of Statistic Header). Kolom diambil dari DBCreator Farm Breeding.
-- Entity Service Layer: STEM_TYPEOFSTAT (UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_CreateDoc", "U_GLActCode", "U_GLActName", "U_UseGender", "U_StatGroup", "U_StatGroupNm", "U_CreateGI", "U_Gender", "U_StatCategory"
FROM "@STEM_TYPEOFSTAT"
ORDER BY "Code"
