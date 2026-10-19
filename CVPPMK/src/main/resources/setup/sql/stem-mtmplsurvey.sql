-- Setup G · Addon Farm Breeding · Template Survey: header @STEM_MTMPLSURVEY + detail @STEM_DTMPLSURVEY. Entity SL: STEM_MTMPLSURVEY.
-- _Detail = baris detail digabung (baris dipisah '¦', kolom '^', urut LineId): dibandingkan antar DB, tidak dikirim sebagai field; dipecah lagi saat baris BARU dibuat.
-- Dokumen tidak punya kode: dicocokkan lewat deskripsi; DocEntry tujuan dipakai sebagai _key.
SELECT H."DocEntry" AS "_key", H."U_TempDesc", H."U_Type", H."U_Remarks",
       (SELECT STRING_AGG(IFNULL(CAST(D."U_SurveyID" AS NVARCHAR(100)),'') || '^' || IFNULL(CAST(D."U_SurveyDesc" AS NVARCHAR(100)),'') || '^' || IFNULL(CAST(D."U_Photo" AS NVARCHAR(100)),''), '¦' ORDER BY D."LineId") FROM "@STEM_DTMPLSURVEY" D WHERE D."DocEntry" = H."DocEntry") AS "_Detail"
FROM "@STEM_MTMPLSURVEY" H
ORDER BY H."DocEntry"
