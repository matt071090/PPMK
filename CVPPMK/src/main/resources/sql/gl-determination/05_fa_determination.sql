-- 2.2 tab Fixed Assets: Account Determination aset tetap (Administration > Setup > Fixed Assets > Account Determination)
-- Asset class terhubung ke sini lewat ACS1.AcctDtn per depreciation area
SELECT D."Code", D."Descr", D."BalanceAct", D."ClrAcqAct", D."OrdDprAct", D."OrdDprAcc", D."UnpDprAct", D."UnpDprAcc", D."SpDprAct", D."SpDprAcc",
       D."RevAct", D."RevResvAct", D."RevResvClr", D."ReNBVrAct", D."ReNBVeAct", D."SaRevNAct", D."ReRevNAct", D."ReExpNAct", D."RevReAct", D."ClearAccRe"
/*@udf-cols OADT D*/
FROM OADT D
/*@udf-joins OADT D*/
ORDER BY D."Code"
