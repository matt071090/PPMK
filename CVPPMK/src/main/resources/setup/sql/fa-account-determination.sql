-- Setup D · FA Account Determination -> FAAccountDeterminations (template T14)
SELECT D."Code" AS "_key", D."Code", D."Descr" AS "Description", D."BalanceAct" AS "AssetBalanceSheetAccount",
       D."ClrAcqAct" AS "ClearingAccountAcquisition", D."OrdDprAct" AS "OrdinaryDepreciation", D."OrdDprAcc" AS "AccumulatedOrdinaryDepr",
       D."UnpDprAct" AS "UnplannedDepreciation", D."UnpDprAcc" AS "AccumulatedUnplannedDepr", D."SpDprAct" AS "SpecialDepreciation",
       D."SpDprAcc" AS "AccumulatedSpecialDepr", D."RevResvAct" AS "RevaluationReserveAccount", D."RevResvClr" AS "RevaluationReserveClearing",
       D."RevAct" AS "RevaluationAccount", D."SaRevNAct" AS "RevenuefromAssetSalesNet", D."ReExpNAct" AS "RetirementwithExpenseNet",
       D."ReRevNAct" AS "RetirementwithRevenueNet", D."ReNBVeAct" AS "LeavewithExpenseNBVGross", D."ReNBVrAct" AS "LeavewithRevenueNBVGross",
       D."RevReAct" AS "RevenueAccountforRetirement", D."ClearAccRe" AS "RevenueClearingAccount"
FROM OADT D
ORDER BY D."Code"
