-- 5.2 User-Defined Table (Tools > Customization Tools > User-Defined Tables - Setup)
SELECT T."TableName", T."Descr", T."ObjectType",
       (SELECT COUNT(*) FROM CUFD F WHERE F."TableID" = '@' || T."TableName") AS "FieldCount",
       (SELECT MAX(O."Code") FROM OUDO O WHERE O."TableName" = T."TableName") AS "UdoCode",
       (SELECT MAX(C."Code") FROM UDO1 C WHERE C."TableName" = T."TableName") AS "UdoChildOf"
FROM OUTB T ORDER BY T."TableName"
