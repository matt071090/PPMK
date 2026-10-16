-- 1.17 Shipping Types (Administration > Setup > General > Shipping Types)
SELECT S."TrnspCode", S."TrnspName", S."WebSite", S."Active"
/*@udf-cols OSHP S*/
FROM OSHP S
/*@udf-joins OSHP S*/
ORDER BY S."TrnspCode"
