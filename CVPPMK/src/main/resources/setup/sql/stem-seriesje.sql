-- Setup F · Addon STEM · @STEM_SERIESJE (Series JE Mapping). Kolom diambil dari DBCreator STEM.
-- Entity Service Layer: U_STEM_SERIESJE (tabel tanpa UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_SeriesBase", "U_SeriesTarget", "U_Description"
FROM "@STEM_SERIESJE"
ORDER BY "Code"
