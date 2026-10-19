-- Setup E · Document Numbering -> SeriesService_AddSeries / SeriesService_UpdateSeries (bukan entity; body dibungkus "Series").
-- _key = nomor Series di DB yang dibaca. Branch dicocokkan lewat nama (_Branch) lalu diubah jadi BPLID tujuan.
SELECT N."Series" AS "_key", N."ObjectCode" AS "Document", N."DocSubType" AS "DocumentSubType", N."SeriesName" AS "Name",
       N."Indicator" AS "PeriodIndicator", B."BPLName" AS "_Branch",
       CASE N."IsManual" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "IsManual",
       N."InitialNum" AS "InitialNumber", N."LastNum" AS "LastNumber", N."BeginStr" AS "Prefix", N."EndStr" AS "Suffix",
       CASE N."Locked" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "Locked", N."Remark" AS "Remarks"
FROM NNM1 N LEFT JOIN OBPL B ON B."BPLId" = N."BPLId"
ORDER BY N."ObjectCode", N."Series"
