-- Setup G · Addon Farm Breeding · @ST_STATGRP (Group of Statistics). Kolom diambil dari DBCreator Farm Breeding.
-- Entity Service Layer: ST_STATGRP (UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_ST_STATGCode", "U_ST_STATGName"
FROM "@ST_STATGRP"
ORDER BY "Code"
