-- Dropdown template upload: distribution rule (cost center) dimension 1 yang aktif
SELECT "OcrCode" AS "v" FROM OOCR WHERE "DimCode" = 1 AND "Active" = 'Y' ORDER BY "OcrCode"
