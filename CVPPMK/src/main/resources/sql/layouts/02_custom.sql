-- 4.3 Layout yang dibuat sendiri (bukan bawaan SAP)
SELECT "DocCode", "DocName", "TypeCode", "Author", "Category", "B1Version"
FROM RDOC WHERE "Author" <> 'System' ORDER BY "TypeCode", "DocName"
