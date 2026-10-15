-- 1.4 Dimension (Financials > Setup > Cost Accounting > Dimensions) + jumlah cost center per dimension
SELECT D."DimCode", D."DimName", D."DimDesc", D."DimActive",
       (SELECT COUNT(*) FROM OPRC P WHERE P."DimCode" = D."DimCode") AS "CcCount",
       (SELECT COUNT(*) FROM OPRC P WHERE P."DimCode" = D."DimCode" AND P."Active" = 'Y') AS "CcActive"
FROM ODIM D
ORDER BY D."DimCode"
