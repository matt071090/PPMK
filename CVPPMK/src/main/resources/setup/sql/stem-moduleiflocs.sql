-- Setup F · Addon STEM · @STEM_MODULEIFLOCS (Module iFlocs). Kolom diambil dari DBCreator STEM.
-- Entity Service Layer: U_STEM_MODULEIFLOCS (tabel tanpa UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_MODULECODE"
FROM "@STEM_MODULEIFLOCS"
ORDER BY "Code"
