-- Numbering Series per dokumen/objek
-- DocSubType: series terpisah per sub-tipe (mis. BP: C = Customer, S = Vendor), '--' kalau objek tidak punya sub-tipe.
-- IsManual = 'Y': series manual, tidak punya range nomor.
SELECT N."ObjectCode", O."Name" AS "UdoName", N."DocSubType", N."Series", N."SeriesName", N."IsManual",
       N."InitialNum", N."NextNumber", N."LastNum", N."BPLId", B."BPLName", N."Indicator", N."Locked", N."Remark"
FROM NNM1 N
LEFT JOIN OUDO O ON O."Code" = N."ObjectCode"
LEFT JOIN OBPL B ON B."BPLId" = N."BPLId"
ORDER BY N."ObjectCode", N."Series"
