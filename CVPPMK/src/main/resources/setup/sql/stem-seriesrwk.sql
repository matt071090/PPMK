-- Setup F · Addon STEM · @STEM_SERIESRWK (SERIES REWORK MAPPING). Kolom diambil dari DBCreator STEM.
-- Entity Service Layer: U_STEM_SERIESRWK (tabel tanpa UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_SeriesRework", "U_SeriesGI", "U_SeriesGR", "U_Description"
FROM "@STEM_SERIESRWK"
ORDER BY "Code"
