-- 3.4 Excel BP Master Data, sheet "Accounting - General" (tab Accounting > General)
SELECT C."CardCode" AS "Code", C."CardName" AS "Name", C."DebPayAcct" AS "Control Account", A."AcctName" AS "Control Account Name",
       C."DpmClear" AS "DP Clearing Account", D."AcctName" AS "DP Clearing Account Name", C."ConnBP" AS "Connected BP", K."CardName" AS "Connected BP Name"
FROM OCRD C
LEFT JOIN OACT A ON A."AcctCode" = C."DebPayAcct"
LEFT JOIN OACT D ON D."AcctCode" = C."DpmClear"
LEFT JOIN OCRD K ON K."CardCode" = C."ConnBP"
ORDER BY C."CardCode"
