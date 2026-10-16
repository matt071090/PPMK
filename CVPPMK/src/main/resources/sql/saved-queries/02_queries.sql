-- 5.4 Saved Query (Tools > Queries > Query Manager), tanpa teks query. IsSystem: lihat 01_categories.sql
SELECT Q."IntrnalKey", C."CatName", Q."QName", LENGTH(Q."QString") AS "Len", TO_VARCHAR(Q."QLastDate", 'YYYY-MM-DD') AS "LastRun",
       TO_VARCHAR(Q."CreateDate", 'YYYY-MM-DD') AS "Created",
       CASE WHEN Q."QCategory" = -2 OR C."CatName" LIKE 'SAP\_DASHBOARD\_%' ESCAPE '\' OR C."CatName" LIKE 'KPI\_MOBILE%' ESCAPE '\'
            THEN 'Y' ELSE 'N' END AS "IsSystem"
FROM OUQR Q LEFT JOIN OQCN C ON C."CategoryId" = Q."QCategory"
ORDER BY C."CatName", Q."QName"
