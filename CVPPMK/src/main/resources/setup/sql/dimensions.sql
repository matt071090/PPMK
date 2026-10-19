-- Referensi (tidak tampil di menu): dimension cost accounting, untuk mengubah nama dimension (template T02) jadi DimCode
SELECT D."DimCode" AS "_key", D."DimDesc" AS "Name"
FROM ODIM D
ORDER BY D."DimCode"
