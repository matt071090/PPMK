-- Setup D · Warehouse -> Warehouses (template T09). Akun tab Accounting belum dibawa.
-- Branch dicocokkan lewat nama (_Branch) lalu diubah jadi BusinessPlaceID tujuan saat upload.
SELECT W."WhsCode" AS "_key", W."WhsCode" AS "WarehouseCode", W."WhsName" AS "WarehouseName", B."BPLName" AS "_Branch",
       W."Street", W."City", CASE W."BinActivat" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "EnableBinLocations"
FROM OWHS W LEFT JOIN OBPL B ON B."BPLId" = W."BPLid"
ORDER BY W."BPLid", W."WhsCode"
