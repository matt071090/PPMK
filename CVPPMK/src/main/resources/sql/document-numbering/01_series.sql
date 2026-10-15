-- Numbering Series per dokumen/objek
SELECT N."ObjectCode", O."Name" AS "UdoName", N."Series", N."SeriesName", N."InitialNum", N."NextNumber", N."LastNum",
       N."BPLId", B."BPLName", N."Indicator", N."Locked", N."Remark"
FROM NNM1 N
LEFT JOIN OUDO O ON O."Code" = N."ObjectCode"
LEFT JOIN OBPL B ON B."BPLId" = N."BPLId"
ORDER BY N."ObjectCode", N."Series"
