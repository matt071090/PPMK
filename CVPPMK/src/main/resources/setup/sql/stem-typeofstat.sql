-- Setup G · Addon Farm Breeding · Type of Statistic: header @STEM_TYPEOFSTAT + detail @STEM_DTYPEOFSTAT (U_StatisticValue).
-- Entity Service Layer: STEM_TYPEOFSTAT (UDO, baris anak = koleksi STEM_DTYPEOFSTATCollection). Code sama di sumber dan tujuan.
-- _Detail = nilai detail digabung dengan '|' urut LineId: dibandingkan antar DB, tidak dikirim sebagai field; dipecah lagi saat baris BARU dibuat.
SELECT H."Code" AS "_key", H."Code", H."Name", H."U_CreateDoc", H."U_GLActCode", H."U_GLActName", H."U_UseGender", H."U_StatGroup",
       H."U_StatGroupNm", H."U_CreateGI", H."U_Gender", H."U_StatCategory",
       (SELECT STRING_AGG(D."U_StatisticValue", '|' ORDER BY D."LineId") FROM "@STEM_DTYPEOFSTAT" D WHERE D."Code" = H."Code") AS "_Detail"
FROM "@STEM_TYPEOFSTAT" H
ORDER BY H."Code"
