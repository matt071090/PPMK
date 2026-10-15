-- 1.4 Profit Center / Cost Center per dimension (Financials > Cost Accounting > Profit Centers)
SELECT P."DimCode", P."PrcCode", P."PrcName", P."Active", P."Locked",
       TO_VARCHAR(P."ValidFrom", 'YYYY-MM-DD') AS "ValidFrom", TO_VARCHAR(P."ValidTo", 'YYYY-MM-DD') AS "ValidTo",
       P."CCTypeCode", P."CCOwner"
FROM OPRC P
ORDER BY P."DimCode", P."PrcCode"
