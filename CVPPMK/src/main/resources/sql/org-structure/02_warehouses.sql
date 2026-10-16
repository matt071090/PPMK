-- Warehouse per branch. UDF OWHS (mis. tipe warehouse) ikut otomatis dari CUFD.
SELECT W."WhsCode", W."WhsName", W."BPLid", B."BPLName", W."Inactive", W."Locked", W."BinActivat", W."City"
/*@udf-cols OWHS W*/
FROM OWHS W LEFT JOIN OBPL B ON B."BPLId" = W."BPLid"
/*@udf-joins OWHS W*/
ORDER BY W."BPLid", W."WhsCode"
