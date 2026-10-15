-- 1.18 Payment Methods (Banking > Payment Methods / Payment Wizard)
SELECT "PayMethCod", "Descript", "Type", "BankTransf", "BnkDflt", "BankCountr", "DflAccount", "GLAccount", "Format", "Active"
FROM OPYM
ORDER BY "Type", "PayMethCod"
