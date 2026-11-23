-- Setup G · Addon Farm Breeding · @ST_MACHINE (Machine Hatchery Master Data). Kolom diambil dari DBCreator Farm Breeding.
-- Entity Service Layer: ST_MACHINE (UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_MACHTYPE", "U_TYPE", "U_SERIALNUM", "U_REMARKS", "U_WAREHOUSE"
FROM "@ST_MACHINE"
ORDER BY "Code"
