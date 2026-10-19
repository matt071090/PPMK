-- Setup D · House Bank Account -> HouseBankAccounts (template T18)
SELECT D."AbsEntry" AS "_key", D."BankCode", D."Country", D."Account" AS "AccNo", D."Branch", D."AcctName" AS "AccountName", D."GLAccount"
FROM DSC1 D
ORDER BY D."BankCode", D."Account"
