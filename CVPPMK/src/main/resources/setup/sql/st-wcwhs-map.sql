-- Setup F · Addon STEM · @ST_WCWHS_MAP (STEM WC Group Warehouse). Kolom diambil dari DBCreator STEM.
-- Entity Service Layer: ST_WCWHS_MAP (UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_WCGroupCode", "U_WhsCode", "U_WhsName"
FROM "@ST_WCWHS_MAP"
ORDER BY "Code"
