-- Setup 3.1 Item Group -> Service Layer ItemGroups, termasuk akun tab Accounting.
SELECT G."ItmsGrpCod" AS "_key", G."ItmsGrpNam" AS "GroupName",
       CASE G."InvntSys" WHEN 'A' THEN 'bis_MovingAverage' WHEN 'S' THEN 'bis_Standard' WHEN 'F' THEN 'bis_FIFO' WHEN 'B' THEN 'bis_SNB' END AS "InventorySystem",
       G."BalInvntAc" AS "InventoryAccount", G."SaleCostAc" AS "CostAccount", G."RevenuesAc" AS "RevenuesAccount", G."ReturnAc" AS "ReturningAccount",
       G."ExpensesAc" AS "ExpensesAccount", G."TransferAc" AS "TransfersAccount", G."VarianceAc" AS "VarianceAccount", G."PriceDifAc" AS "PriceDifferencesAccount",
       G."DecreasAc" AS "DecreasingAccount", G."IncreasAc" AS "IncreasingAccount", G."StkInTnAct" AS "StockInTransitAccount", G."WipAcct" AS "WIPMaterialAccount"
FROM OITB G
ORDER BY G."ItmsGrpCod"
