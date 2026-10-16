-- 1.14 Sales Employee / Buyer (Administration > Setup > General > Sales Employees/Buyers)
SELECT S."SlpCode", S."SlpName", S."Memo", S."Commission", S."Active", S."Locked", S."Telephone", S."Mobil", S."Email"
/*@udf-cols OSLP S*/
FROM OSLP S
/*@udf-joins OSLP S*/
ORDER BY S."SlpCode"
