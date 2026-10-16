-- Dropdown template upload: dimension aktif (nama tampil)
SELECT "DimDesc" AS "v" FROM ODIM WHERE "DimActive" = 'Y' ORDER BY "DimCode"
