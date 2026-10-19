-- Setup F · Addon STEM · @STEM_SERIESMAP (STEM Series Mapping). Kolom diambil dari DBCreator STEM.
-- Entity Service Layer: U_STEM_SERIESMAP (tabel tanpa UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_ObjectType", "U_Group", "U_AssetClass", "U_Series"
FROM "@STEM_SERIESMAP"
ORDER BY "Code"
