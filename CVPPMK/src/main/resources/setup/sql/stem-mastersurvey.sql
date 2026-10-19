-- Setup G · Addon Farm Breeding · @STEM_MASTERSURVEY (Survey Master Data). Kolom diambil dari DBCreator Farm Breeding.
-- Entity Service Layer: STEM_MASTERSURVEY (UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_Type", "U_Photo", "U_Status"
FROM "@STEM_MASTERSURVEY"
ORDER BY "Code"
