-- 5.4 Kategori Query Manager
SELECT C."CategoryId", C."CatName", (SELECT COUNT(*) FROM OUQR Q WHERE Q."QCategory" = C."CategoryId") AS "QueryCount"
FROM OQCN C ORDER BY C."CatName"
