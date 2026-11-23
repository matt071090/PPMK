-- Kesiapan upload aset: distribution rule per dimension (cost center di baris Capitalization: ACQ1.OcrCode 1-5)
SELECT "DimCode", "OcrCode", "OcrName", "Active", "Locked" FROM OOCR ORDER BY "DimCode", "OcrCode"
