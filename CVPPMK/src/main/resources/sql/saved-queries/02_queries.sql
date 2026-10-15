-- 5.4 Saved Query (Tools > Queries > Query Manager), tanpa teks query
SELECT Q."IntrnalKey", C."CatName", Q."QName", LENGTH(Q."QString") AS "Len", TO_VARCHAR(Q."QLastDate", 'YYYY-MM-DD') AS "LastRun"
FROM OUQR Q LEFT JOIN OQCN C ON C."CategoryId" = Q."QCategory"
ORDER BY C."CatName", Q."QName"
