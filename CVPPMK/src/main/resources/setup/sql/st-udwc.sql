-- Setup F · Addon STEM · @ST_UDWC (Work Center). Kolom diambil dari DBCreator STEM.
-- Entity Service Layer: ST_UDWC (UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_GroupCode", "U_IsActive"
FROM "@ST_UDWC"
ORDER BY "Code"
