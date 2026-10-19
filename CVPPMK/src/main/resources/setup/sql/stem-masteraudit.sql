-- Setup G · Addon Farm Breeding · @STEM_MASTERAUDIT (Audit Master Data). Kolom diambil dari DBCreator Farm Breeding.
-- Entity Service Layer: STEM_MASTERAUDIT (UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_Type", "U_Photo", "U_Status"
FROM "@STEM_MASTERAUDIT"
ORDER BY "Code"
