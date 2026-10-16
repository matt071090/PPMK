-- 1.9 Banks (Administration > Setup > Banking > Banks)
SELECT B."BankCode", B."BankName", B."CountryCod", B."SwiftNum", B."AliasName", B."Locked"
/*@udf-cols ODSC B*/
FROM ODSC B
/*@udf-joins ODSC B*/
ORDER BY B."BankCode"
