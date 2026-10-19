-- Setup F · Addon STEM · @STEM_STDSPEC (Standard Specification). Kolom diambil dari DBCreator STEM.
-- Entity Service Layer: STEM_STDSPEC (UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_IsActive", "U_ItemCode", "U_ItemName", "U_WCCode", "U_WCDesc", "U_Criteria", "U_CriteriaName", "U_Standard", "U_ValueType", "U_Tolerance", "U_MinStd", "U_MaxStd", "U_UoM", "U_ITEMTARGET"
FROM "@STEM_STDSPEC"
ORDER BY "Code"
