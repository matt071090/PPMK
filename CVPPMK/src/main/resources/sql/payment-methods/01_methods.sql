-- 1.18 Payment Methods (Banking > Payment Methods / Payment Wizard)
SELECT P."PayMethCod", P."Descript", P."Type", P."BankTransf", P."BnkDflt", P."BankCountr", P."DflAccount", P."GLAccount", P."Format", P."Active"
/*@udf-cols OPYM P*/
FROM OPYM P
/*@udf-joins OPYM P*/
ORDER BY P."Type", P."PayMethCod"
