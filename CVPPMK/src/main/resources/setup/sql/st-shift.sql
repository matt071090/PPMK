-- Setup F · Addon STEM · @ST_SHIFT (Shift Master Data). Kolom diambil dari DBCreator STEM.
-- Entity Service Layer: ST_SHIFT (UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_IsActive", "U_BRANCH"
FROM "@ST_SHIFT"
ORDER BY "Code"
