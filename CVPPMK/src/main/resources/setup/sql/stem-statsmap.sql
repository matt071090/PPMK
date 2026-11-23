-- Setup G · Addon Farm Breeding · @STEM_STATSMAP (Type of Statistic Mapping). Kolom diambil dari DBCreator Farm Breeding.
-- Entity Service Layer: U_STEM_STATSMAP (tabel tanpa UDO). Code sama di sumber dan tujuan.
SELECT "Code" AS "_key", "Code", "Name", "U_TypeOfStat", "U_ItemGroup", "U_ItemCodeSH"
FROM "@STEM_STATSMAP"
ORDER BY "Code"
