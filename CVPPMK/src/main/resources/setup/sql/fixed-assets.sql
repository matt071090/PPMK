-- Setup E · Fixed Asset Master Data -> Items dengan ItemType itFixedAssets. Item group dicocokkan lewat nama (_ItemGroup).
SELECT I."ItemCode" AS "_key", I."ItemCode", I."ItemName", 'itFixedAssets' AS "ItemType", G."ItmsGrpNam" AS "_ItemGroup", I."AssetClass"
FROM OITM I LEFT JOIN OITB G ON G."ItmsGrpCod" = I."ItmsGrpCod"
WHERE I."ItemType" = 'F'
ORDER BY I."ItemCode"
