-- 2.1 Chart of Accounts (Financials > Chart of Accounts)
SELECT "AcctCode", "AcctName", "FormatCode", "FatherNum", "Levels", "Postable", "GroupMask", "ActType", "ActCurr",
       "LocManTran", "Finanse", "FrozenFor", "CfwRlvnt", "Dim1Relvnt", "PrjRelvnt"
FROM OACT
ORDER BY "AcctCode"
