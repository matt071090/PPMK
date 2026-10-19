-- Setup B · Bank -> Banks (template T17)
SELECT B."AbsEntry" AS "_key", B."BankCode", B."BankName", B."CountryCod" AS "CountryCode", B."SwiftNum" AS "SwiftNo"
FROM ODSC B
ORDER BY B."BankCode"
