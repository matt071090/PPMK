-- 5.3 Daftar UDF di tabel standar SAP (tabel UDT dan tabel arsip A* yang hanya salinan UDF tabel lain tidak termasuk)
SELECT F."TableID", 'U_' || F."AliasID" AS "Field", F."Descr", F."TypeID", F."EditType", F."SizeID", F."Dflt", F."NotNull", F."RTable", F."RelUDO"
FROM CUFD F WHERE "TableID" NOT LIKE '@%' AND NOT (F."TableID" LIKE 'A%' AND EXISTS (SELECT 1 FROM CUFD X WHERE X."AliasID" = F."AliasID" AND X."TableID" NOT LIKE 'A%' AND X."TableID" NOT LIKE '@%')) ORDER BY F."TableID", F."FieldID"
