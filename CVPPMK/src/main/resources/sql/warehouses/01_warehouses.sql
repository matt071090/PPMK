-- 3.3 Warehouse (Inventory > Warehouses), termasuk akun di tab Accounting (dipakai kalau Set Inventory Method By = Warehouse).
-- UDF OWHS (mis. tipe warehouse) ikut otomatis dari CUFD.
SELECT W."WhsCode", W."WhsName", W."BPLid", B."BPLName", W."Inactive", W."Locked", W."BinActivat", W."City",
       W."BalInvntAc", W."SaleCostAc", W."TransferAc", W."VarianceAc", W."PriceDifAc", W."DecreasAc", W."IncreasAc",
       W."ReturnAc", W."RevenuesAc", W."StkInTnAct", W."WipAcct", (SELECT "GLMethod" FROM OADM) AS "GLMethod"
/*@udf-cols OWHS W*/
FROM OWHS W LEFT JOIN OBPL B ON B."BPLId" = W."BPLid"
/*@udf-joins OWHS W*/
ORDER BY W."BPLid", W."WhsCode"
