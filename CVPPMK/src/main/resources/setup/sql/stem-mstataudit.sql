-- Setup G · Addon Farm Breeding · Status Audit: header @STEM_MSTATAUDIT + detail @STEM_DSTATAUDIT. Entity SL: STEM_MSTATAUDIT.
-- _Detail* = baris detail digabung (baris dipisah '¦', kolom '^', urut LineId): dibandingkan antar DB, tidak dikirim sebagai field; dipecah lagi saat baris BARU dibuat.
SELECT H."Code" AS "_key", H."Code", H."Name",
       (SELECT STRING_AGG(IFNULL(CAST(D."U_StatusDesc" AS NVARCHAR(500)),''), '¦' ORDER BY D."LineId") FROM "@STEM_DSTATAUDIT" D WHERE D."Code" = H."Code") AS "_Detail"
FROM "@STEM_MSTATAUDIT" H
ORDER BY H."Code"
