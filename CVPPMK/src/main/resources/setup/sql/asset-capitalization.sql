-- Setup E - Asset Capitalization (OACQ). Dokumen dicocokkan lewat Comments (field SL: Remarks), satu aset per dokumen, unik per aset.
-- Kolom OACQ di PAS (dicek 2026-10-21): PostDate, DocDate, AssetDate, Comments, JrnlMemo, Reference. Tidak ada kolom Remarks.
-- Hanya Remarks yang dibandingkan: dokumen capitalization yang sudah posting tidak diubah dari sini.
SELECT O."Comments" AS "_key", O."Comments" AS "Remarks"
FROM OACQ O
WHERE O."Comments" IS NOT NULL AND O."Comments" <> ''
ORDER BY O."DocEntry"
