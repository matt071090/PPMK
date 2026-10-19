-- Setup D · Withholding Tax (bandingkan saja; upload menyusul setelah field SL WithholdingTaxCodes dicocokkan)
SELECT W."WTCode" AS "_key", W."WTCode" AS "Code", W."WTName" AS "Name", W."Category", W."Rate", W."BaseType",
       W."PrctBsAmnt" AS "BaseAmountPercent", W."Account"
FROM OWHT W
ORDER BY W."WTCode"
