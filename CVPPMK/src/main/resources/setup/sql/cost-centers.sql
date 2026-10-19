-- Setup B · Profit Center / Cost Center -> ProfitCenters (template T02). Centr_z* = General Center bawaan SAP, tidak dibawa.
SELECT P."PrcCode" AS "_key", P."PrcCode" AS "CenterCode", P."PrcName" AS "CenterName", P."DimCode" AS "InWhichDimension",
       TO_VARCHAR(P."ValidFrom", 'YYYY-MM-DD') AS "EffectiveFrom", CASE P."Active" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "Active"
FROM OPRC P
WHERE P."PrcCode" NOT LIKE 'Centr_z%'
ORDER BY P."DimCode", P."PrcCode"
