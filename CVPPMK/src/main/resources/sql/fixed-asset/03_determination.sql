-- 2.3 Account Determination aset tetap (Administration > Setup > Fixed Assets > Account Determination)
-- Asset class terhubung ke sini lewat ACS1.AcctDtn per depreciation area
SELECT "Code", "Descr", "BalanceAct", "ClrAcqAct", "OrdDprAct", "OrdDprAcc", "UnpDprAct", "UnpDprAcc", "SpDprAct", "SpDprAcc",
       "RevAct", "RevResvAct", "RevResvClr", "ReNBVrAct", "ReNBVeAct", "SaRevNAct", "ReRevNAct", "ReExpNAct", "RevReAct", "ClearAccRe"
FROM OADT
ORDER BY "Code"
