-- 5.4 Kategori Query Manager. IsSystem = kategori bawaan SAP (System, query dashboard SAP_DASHBOARD_*, KPI aplikasi mobile KPI_MOBILE*);
-- OUQR tidak punya penanda resmi query sistem, jadi dibedakan dari kategorinya.
SELECT C."CategoryId", C."CatName", (SELECT COUNT(*) FROM OUQR Q WHERE Q."QCategory" = C."CategoryId") AS "QueryCount",
       CASE WHEN C."CategoryId" = -2 OR C."CatName" LIKE 'SAP\_DASHBOARD\_%' ESCAPE '\' OR C."CatName" LIKE 'KPI\_MOBILE%' ESCAPE '\'
            THEN 'Y' ELSE 'N' END AS "IsSystem"
FROM OQCN C ORDER BY C."CatName"
