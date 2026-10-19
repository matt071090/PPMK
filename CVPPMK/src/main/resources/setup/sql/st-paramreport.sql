-- Setup G · Addon Farm Breeding · @ST_PARAMREPORT (Report Parameter). Kolom diambil dari DBCreator Farm Breeding.
-- Entity Service Layer: U_ST_PARAMREPORT (tabel tanpa UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_Desc", "U_Value", "U_Key"
FROM "@ST_PARAMREPORT"
ORDER BY "Code"
