-- 2.1 Chart of Accounts (Financials > Chart of Accounts)
-- Branch: OACT hanya punya satu kolom BPLId (tidak ada tabel assignment akun-branch lain di database, dicek 2026-10-16)
SELECT A."AcctCode", A."AcctName", A."FormatCode", A."FatherNum", A."Levels", A."Postable", A."GroupMask", A."ActType", A."ActCurr",
       A."LocManTran", A."Finanse", A."FrozenFor", A."CfwRlvnt", A."Dim1Relvnt", A."PrjRelvnt", B."BPLName" AS "Branches"
/*@udf-cols OACT A*/
FROM OACT A
LEFT JOIN OBPL B ON B."BPLId" = A."BPLId"
/*@udf-joins OACT A*/
ORDER BY A."AcctCode"
