-- Setup C · Chart of Accounts -> ChartOfAccounts (template T12). _Level = level akun (info saja, tidak dikirim);
-- saat upload baris diurutkan: akun judul dari level terendah dulu, baru akun aktif, supaya akun induk selalu dibuat lebih dulu.
SELECT A."AcctCode" AS "_key", A."AcctCode" AS "Code", A."Levels" AS "_Level", A."AcctName" AS "Name", A."FatherNum" AS "FatherAccountKey",
       CASE A."Postable" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "ActiveAccount",
       CASE A."ActType" WHEN 'I' THEN 'at_Revenues' WHEN 'E' THEN 'at_Expenses' ELSE 'at_Other' END AS "AccountType",
       A."ActCurr" AS "AcctCurrency", CASE A."Finanse" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "CashAccount",
       CASE A."LocManTran" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "LockManualTransaction"
FROM OACT A
ORDER BY A."Levels", A."AcctCode"
