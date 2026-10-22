-- Dropdown template upload: distribution rule (cost center) dimension 5 yang aktif
SELECT "OcrCode" AS "v" FROM OOCR WHERE "DimCode" = 5 AND "Active" = 'Y' ORDER BY "OcrCode"
