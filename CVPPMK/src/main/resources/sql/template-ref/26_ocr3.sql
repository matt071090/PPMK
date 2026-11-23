-- Dropdown template upload: distribution rule (cost center) dimension 3 yang aktif
SELECT "OcrCode" AS "v" FROM OOCR WHERE "DimCode" = 3 AND "Active" = 'Y' ORDER BY "OcrCode"
