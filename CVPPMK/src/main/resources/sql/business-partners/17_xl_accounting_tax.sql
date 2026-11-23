-- 3.4 Excel BP Master Data, sheet "Accounting - Tax" (tab Accounting > Tax)
SELECT C."CardCode" AS "Code", C."CardName" AS "Name",
       CASE C."VatStatus" WHEN 'Y' THEN 'Liable' WHEN 'N' THEN 'Exempt' WHEN 'E' THEN 'EU' ELSE C."VatStatus" END AS "Tax Status",
       IFNULL(NULLIF(C."ECVatGroup", ''), C."VatGroup") AS "Tax Group", V."Name" AS "Tax Group Name",
       C."WTLiable" AS "Subject to Withholding Tax",
       -- AccCritria = "Accrual Criteria": Y = Accrual, N = Cash
       CASE C."AccCritria" WHEN 'Y' THEN 'Accrual' WHEN 'N' THEN 'Cash' ELSE C."AccCritria" END AS "WTax Accrual/Cash",
       C."CrtfcateNO" AS "WTax Certificate No.", TO_VARCHAR(C."ExpireDate", 'YYYY-MM-DD') AS "WTax Expiration Date", C."NINum" AS "NI Number",
       CASE C."TypWTReprt" WHEN 'C' THEN 'Company' WHEN 'P' THEN 'Person' ELSE C."TypWTReprt" END AS "Type for WTax Rpt"
FROM OCRD C
LEFT JOIN OVTG V ON V."Code" = IFNULL(NULLIF(C."ECVatGroup", ''), C."VatGroup")
ORDER BY C."CardCode"
