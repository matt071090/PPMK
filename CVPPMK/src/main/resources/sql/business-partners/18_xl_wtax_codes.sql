-- 3.4 Excel BP Master Data, sheet "WTax Codes" (CRD4: kode PPh yang di-assign ke BP)
SELECT C."CardCode" AS "BP Code", C."CardName" AS "BP Name", W."WTCode" AS "WTax Code", H."WTName" AS "WTax Description"
FROM CRD4 W
JOIN OCRD C ON C."CardCode" = W."CardCode"
LEFT JOIN OWHT H ON H."WTCode" = W."WTCode"
ORDER BY C."CardCode", W."WTCode"
