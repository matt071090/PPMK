-- 1.16 Landed Costs (Administration > Setup > Inventory > Landed Costs)
SELECT C."AlcCode", C."AlcName", C."OhType", C."LaCAllcAcc", A."AcctName" AS "AllocName", C."AcctCode"
/*@udf-cols OALC C*/
FROM OALC C LEFT JOIN OACT A ON A."AcctCode" = C."LaCAllcAcc"
/*@udf-joins OALC C*/
ORDER BY C."AlcCode"
