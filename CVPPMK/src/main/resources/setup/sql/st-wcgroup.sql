-- Setup F · Addon STEM · @ST_WCGROUP (Work Center Group). Kolom diambil dari DBCreator STEM.
-- Entity Service Layer: ST_WCGROUP (UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_IsActive"
FROM "@ST_WCGROUP"
ORDER BY "Code"
