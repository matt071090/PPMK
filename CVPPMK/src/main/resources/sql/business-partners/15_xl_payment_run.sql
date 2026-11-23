-- 3.4 Excel BP Master Data, sheet "Payment Run" (CRD2: payment method yang dicentang di tab Payment Run)
SELECT C."CardCode" AS "BP Code", C."CardName" AS "BP Name", P."PymCode" AS "Payment Method Code", M."Descript" AS "Payment Method Description",
       CASE WHEN P."PymCode" = C."PymCode" THEN 'Y' ELSE 'N' END AS "Is Default"
FROM CRD2 P
JOIN OCRD C ON C."CardCode" = P."CardCode"
LEFT JOIN OPYM M ON M."PayMethCod" = P."PymCode"
ORDER BY C."CardCode", P."PymCode"
