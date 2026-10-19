-- Setup G · Addon Farm Breeding · Standard Master: header @STEM_MSTD + detail @STEM_DSTD. Entity SL: STEM_MSTD.
-- _Detail* = baris detail digabung (baris dipisah '¦', kolom '^', urut LineId): dibandingkan antar DB, tidak dikirim sebagai field; dipecah lagi saat baris BARU dibuat.
SELECT H."Code" AS "_key", H."Code", H."Name", H."U_STEM_Status",
       (SELECT STRING_AGG(IFNULL(CAST(D."U_ItemCode" AS NVARCHAR(500)),'') || '^' || IFNULL(CAST(D."U_ItemName" AS NVARCHAR(500)),'') || '^' || IFNULL(CAST(D."U_UOM" AS NVARCHAR(500)),'') || '^' || IFNULL(CAST(D."U_Value" AS NVARCHAR(500)),'') || '^' || IFNULL(CAST(D."U_isItem" AS NVARCHAR(500)),'') || '^' || IFNULL(CAST(D."U_Budget" AS NVARCHAR(500)),'') || '^' || IFNULL(CAST(D."U_Gender" AS NVARCHAR(500)),'') || '^' || IFNULL(CAST(D."U_perEkor" AS NVARCHAR(500)),''), '¦' ORDER BY D."LineId") FROM "@STEM_DSTD" D WHERE D."Code" = H."Code") AS "_Detail"
FROM "@STEM_MSTD" H
ORDER BY H."Code"
