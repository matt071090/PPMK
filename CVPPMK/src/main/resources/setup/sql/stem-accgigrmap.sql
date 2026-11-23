-- Setup F · Addon STEM · @STEM_ACCGIGRMAP (STEM GIGR Acct Mapping). Kolom diambil dari DBCreator STEM.
-- Entity Service Layer: U_STEM_ACCGIGRMAP (tabel tanpa UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_ObjectType", "U_TypeCode", "U_TypeName", "U_Account"
FROM "@STEM_ACCGIGRMAP"
ORDER BY "Code"
