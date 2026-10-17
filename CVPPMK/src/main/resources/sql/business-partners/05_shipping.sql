-- 3.4 Business Partner: Shipping Type (Administration > Setup > General > Shipping Types), dipakai di BP Master Data tab General
SELECT S."TrnspCode", S."TrnspName", S."WebSite", S."Active"
/*@udf-cols OSHP S*/
FROM OSHP S
/*@udf-joins OSHP S*/
ORDER BY S."TrnspCode"
