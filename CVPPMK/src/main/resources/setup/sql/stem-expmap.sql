-- Setup G · Addon Farm Breeding · @STEM_EXPMAP (Expense Mapping). Kolom diambil dari DBCreator Farm Breeding.
-- Entity Service Layer: U_STEM_EXPMAP (tabel tanpa UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_GLActCode", "U_GLActName", "U_Type"
FROM "@STEM_EXPMAP"
ORDER BY "Code"
