-- Warehouse per branch
SELECT W."WhsCode", W."WhsName", W."BPLid", B."BPLName", W."U_STEM_TYPE", W."Inactive", W."Locked", W."BinActivat", W."City"
FROM OWHS W LEFT JOIN OBPL B ON B."BPLId" = W."BPLid"
ORDER BY W."BPLid", W."WhsCode"
