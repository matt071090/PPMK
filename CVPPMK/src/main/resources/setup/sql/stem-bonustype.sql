-- Setup G · Addon Farm Breeding · @STEM_BONUSTYPE (Bonus Type). Kolom diambil dari DBCreator Farm Breeding.
-- Entity Service Layer: U_STEM_BONUSTYPE (tabel tanpa UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_Type"
FROM "@STEM_BONUSTYPE"
ORDER BY "Code"
