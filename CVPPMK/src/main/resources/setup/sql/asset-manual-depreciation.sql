-- Setup E - Asset Manual Depreciation (OMDP). Dokumen dicocokkan lewat Comments (field SL: Remarks), satu aset per dokumen, unik per aset.
-- BELUM DIVERIFIKASI: nama kolom OMDP belum dicek di PAS. Comments dipakai karena OACQ juga begitu (bukan Remarks). Jalankan:
--   SELECT "COLUMN_NAME", "DATA_TYPE_NAME" FROM SYS.TABLE_COLUMNS WHERE "TABLE_NAME" = 'OMDP' AND "SCHEMA_NAME" = CURRENT_SCHEMA ORDER BY "POSITION";
-- Hanya Remarks yang dibandingkan: dokumen yang sudah posting tidak diubah dari sini.
SELECT O."Comments" AS "_key", O."Comments" AS "Remarks"
FROM OMDP O
WHERE O."Comments" IS NOT NULL AND O."Comments" <> ''
ORDER BY O."DocEntry"
