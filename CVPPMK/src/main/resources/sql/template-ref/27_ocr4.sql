-- Dropdown template upload: distribution rule (cost center) dimension 4 yang aktif
SELECT "OcrCode" AS "v" FROM OOCR WHERE "DimCode" = 4 AND "Active" = 'Y' ORDER BY "OcrCode"
