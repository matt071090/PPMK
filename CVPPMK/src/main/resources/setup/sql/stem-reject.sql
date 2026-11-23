-- Setup F · Addon STEM · @STEM_REJECT (Reject Master Data). Kolom diambil dari DBCreator STEM.
-- Entity Service Layer: STEM_REJECT (UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_IsActive"
FROM "@STEM_REJECT"
ORDER BY "Code"
