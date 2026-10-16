-- 2.2 Akun persediaan per item group (dipakai kalau Set Inventory Method By = Item Group), Item Groups > tab Accounting
SELECT G."ItmsGrpCod", G."ItmsGrpNam", G."BalInvntAc", G."SaleCostAc", G."TransferAc", G."VarianceAc", G."PriceDifAc",
       G."DecreasAc", G."IncreasAc", G."ReturnAc", G."RevenuesAc", G."StkInTnAct", G."WipAcct"
FROM OITB G
ORDER BY G."ItmsGrpCod"
