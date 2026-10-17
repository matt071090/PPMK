-- 3.4 Business Partner (Business Partners > Business Partner Master Data): header + tab General, Payment Terms, Payment Run, Accounting
-- Branches: branch yang di-assign di Branch Assignment (CRD8, DisabledBP = 'N'), dipisah "|" untuk ditampilkan sebagai tag
SELECT C."CardCode", C."CardName", C."CardFName", C."CardType", C."GroupCode", G."GroupName", C."Currency", C."LicTradNum", C."validFor", C."frozenFor",
       (SELECT STRING_AGG(B."BPLName", '|' ORDER BY B."BPLId") FROM CRD8 X JOIN OBPL B ON B."BPLId" = X."BPLId"
         WHERE X."CardCode" = C."CardCode" AND X."DisabledBP" = 'N') AS "Branches",
       -- tab General
       C."Phone1", C."Phone2", C."Cellular", C."Fax", C."E_Mail", C."IntrntSite", SH."TrnspName" AS "ShipType", C."CmpPrivate",
       C."CntctPrsn", S."SlpName", C."AliasName", C."Free_Text",
       -- tab Payment Terms
       T."PymntGroup", P."ListName" AS "PriceList", C."Discount", C."CreditLine", C."DebtLine",
       -- tab Payment Run
       C."HouseBank", C."HousBnkAct", C."PymCode",
       (SELECT STRING_AGG(M."PymCode", '|') FROM CRD2 M WHERE M."CardCode" = C."CardCode") AS "PymMethods",
       -- tab Accounting
       C."DebPayAcct", A1."AcctName" AS "DebPayName", C."DpmClear", A2."AcctName" AS "DpmClearName"
/*@udf-cols OCRD C*/
FROM OCRD C
LEFT JOIN OCRG G ON G."GroupCode" = C."GroupCode"
LEFT JOIN OSHP SH ON SH."TrnspCode" = C."ShipType"
LEFT JOIN OSLP S ON S."SlpCode" = C."SlpCode"
LEFT JOIN OCTG T ON T."GroupNum" = C."GroupNum"
LEFT JOIN OPLN P ON P."ListNum" = C."ListNum"
LEFT JOIN OACT A1 ON A1."AcctCode" = C."DebPayAcct"
LEFT JOIN OACT A2 ON A2."AcctCode" = C."DpmClear"
/*@udf-joins OCRD C*/
ORDER BY C."CardType", C."CardCode"
