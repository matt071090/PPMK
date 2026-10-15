-- 1.16 Landed Costs (Administration > Setup > Inventory > Landed Costs)
SELECT C."AlcCode", C."AlcName", C."OhType", C."LaCAllcAcc", A."AcctName" AS "AllocName", C."AcctCode"
FROM OALC C LEFT JOIN OACT A ON A."AcctCode" = C."LaCAllcAcc"
ORDER BY C."AlcCode"
