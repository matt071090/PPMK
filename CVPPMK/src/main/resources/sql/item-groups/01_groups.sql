-- 3.1 Item Group (Administration > Setup > Inventory > Item Groups), termasuk akun di tab Accounting
SELECT G."ItmsGrpCod", G."ItmsGrpNam", G."InvntSys", G."PlaningSys", G."PrcrmntMtd", G."Locked",
       G."BalInvntAc", G."SaleCostAc", G."TransferAc", G."VarianceAc", G."PriceDifAc", G."DecreasAc", G."IncreasAc",
       G."ReturnAc", G."RevenuesAc", G."StkInTnAct", G."WipAcct", (SELECT "GLMethod" FROM OADM) AS "GLMethod",
       (SELECT COUNT(*) FROM OITM I WHERE I."ItmsGrpCod" = G."ItmsGrpCod") AS "ItemCount"
/*@udf-cols OITB G*/
FROM OITB G
/*@udf-joins OITB G*/
ORDER BY G."ItmsGrpCod"
