-- 3.4 Excel BP Master Data, sheet "Bank Accounts" (OCRB). Is Default = rekening default di tab Payment Terms.
SELECT C."CardCode" AS "BP Code", C."CardName" AS "BP Name", B."BankCode" AS "Bank Code", D."BankName" AS "Bank Name",
       IFNULL(Y."Name", B."Country") AS "Country/Region", B."Account" AS "Account No.", B."AcctName" AS "Bank Account Name",
       B."ControlKey" AS "Ctrl Int. ID", B."Branch" AS "Branch", B."IBAN" AS "IBAN", B."SwiftNum" AS "BIC/SWIFT Code",
       B."MandateID" AS "Mandate ID", TO_VARCHAR(B."SignDate", 'YYYY-MM-DD') AS "Date of Signature",
       CASE WHEN B."BankCode" = C."BankCode" AND B."Account" = C."DflAccount" THEN 'Y' ELSE 'N' END AS "Is Default"
FROM OCRB B
JOIN OCRD C ON C."CardCode" = B."CardCode"
LEFT JOIN ODSC D ON D."BankCode" = B."BankCode" AND D."CountryCod" = B."Country"
LEFT JOIN OCRY Y ON Y."Code" = B."Country"
ORDER BY C."CardCode", B."AbsEntry"
