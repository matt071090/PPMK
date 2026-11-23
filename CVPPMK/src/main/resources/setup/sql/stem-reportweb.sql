-- Setup G · Addon Farm Breeding · @STEM_REPORTWEB (Master Report Web). Kolom diambil dari DBCreator Farm Breeding.
-- Entity Service Layer: U_STEM_REPORTWEB (tabel tanpa UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_REPORTCODE", "U_USEAPIGATEWAY"
FROM "@STEM_REPORTWEB"
ORDER BY "Code"
