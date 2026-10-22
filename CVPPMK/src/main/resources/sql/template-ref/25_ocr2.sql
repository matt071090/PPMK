-- Dropdown template upload: distribution rule (cost center) dimension 2 yang aktif
SELECT "OcrCode" AS "v" FROM OOCR WHERE "DimCode" = 2 AND "Active" = 'Y' ORDER BY "OcrCode"
