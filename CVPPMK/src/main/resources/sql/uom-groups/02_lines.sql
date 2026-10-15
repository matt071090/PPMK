-- 1.13 Definisi konversi per UoM Group
SELECT L."UgpEntry", A."UomCode", L."AltQty", L."BaseQty"
FROM UGP1 L LEFT JOIN OUOM A ON A."UomEntry" = L."UomEntry"
ORDER BY L."UgpEntry", L."LineNum"
