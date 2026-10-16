-- 2.2 Akun persediaan per warehouse (dipakai kalau Set Inventory Method By = Warehouse), Inventory > Warehouses > tab Accounting
SELECT W."WhsCode", W."WhsName", B."BPLName", W."BalInvntAc", W."SaleCostAc", W."TransferAc", W."VarianceAc", W."PriceDifAc",
       W."DecreasAc", W."IncreasAc", W."ReturnAc", W."RevenuesAc", W."ExpensesAc", W."StkInTnAct", W."NegStckAct", W."WipAcct", W."Inactive"
FROM OWHS W LEFT JOIN OBPL B ON B."BPLId" = W."BPLid"
ORDER BY W."BPLid", W."WhsCode"
