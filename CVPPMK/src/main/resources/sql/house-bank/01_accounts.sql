-- 1.8 House Bank Accounts (Administration > Setup > Banking > House Bank Accounts)
SELECT D."AbsEntry", D."BankCode", B."BankName", D."Country", D."Branch", D."Account", D."AcctName",
       D."GLAccount", A."AcctName" AS "GLName", D."Currency"
FROM DSC1 D
LEFT JOIN ODSC B ON B."BankCode" = D."BankCode" AND B."CountryCod" = D."Country"
LEFT JOIN OACT A ON A."AcctCode" = D."GLAccount"
ORDER BY D."BankCode", D."Account"
