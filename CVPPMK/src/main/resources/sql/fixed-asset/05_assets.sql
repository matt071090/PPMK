-- 2.13.2 Master data aset tetap (item tipe Fixed Asset) + parameter penyusutan per depreciation area (ITM7)
SELECT I."ItemCode", I."ItemName", I."AssetClass", G."ItmsGrpNam", D."DprArea", TO_VARCHAR(D."DprStart", 'YYYY-MM-DD') AS "DprStart", D."UsefulLife", D."DprType"
FROM OITM I
LEFT JOIN OITB G ON G."ItmsGrpCod" = I."ItmsGrpCod"
LEFT JOIN ITM7 D ON D."ItemCode" = I."ItemCode"
WHERE I."ItemType" = 'F'
ORDER BY I."AssetClass", I."ItemCode", D."DprArea"
