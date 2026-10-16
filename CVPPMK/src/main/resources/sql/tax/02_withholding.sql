-- 1.7 Withholding Tax (Administration > Setup > Financials > Tax > Withholding Tax)
SELECT W."WTCode", W."WTName", W."Category", W."Rate", W."BaseType", W."PrctBsAmnt",
       TO_VARCHAR(W."EffecDate", 'YYYY-MM-DD') AS "EffecDate", W."Account", W."Inactive"
/*@udf-cols OWHT W*/
FROM OWHT W
/*@udf-joins OWHT W*/
ORDER BY W."WTCode"
