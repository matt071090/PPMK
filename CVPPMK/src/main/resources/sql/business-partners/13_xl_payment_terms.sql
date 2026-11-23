-- 3.4 Excel BP Master Data, sheet "Payment Terms" (tab Payment Terms)
SELECT C."CardCode" AS "Code", C."CardName" AS "Name", T."PymntGroup" AS "Payment Terms", L."ListName" AS "Price List",
       C."CreditLine" AS "Credit Limit", C."DebtLine" AS "Commitment Limit"
FROM OCRD C
LEFT JOIN OCTG T ON T."GroupNum" = C."GroupNum"
LEFT JOIN OPLN L ON L."ListNum" = C."ListNum"
ORDER BY C."CardCode"
