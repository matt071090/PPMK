-- Setup E · Item -> Items (template T06), header saja (tanpa UDF, harga, gudang). Item group dicocokkan lewat nama (_ItemGroup).
SELECT I."ItemCode" AS "_key", I."ItemCode", I."ItemName", I."FrgnName" AS "ForeignName",
       CASE I."ItemType" WHEN 'L' THEN 'itLabor' WHEN 'T' THEN 'itTravel' WHEN 'F' THEN 'itFixedAssets' ELSE 'itItems' END AS "ItemType",
       G."ItmsGrpNam" AS "_ItemGroup",
       CASE I."InvntItem" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "InventoryItem",
       CASE I."SellItem" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "SalesItem",
       CASE I."PrchseItem" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "PurchaseItem",
       I."InvntryUom" AS "InventoryUOM", I."BuyUnitMsr" AS "PurchaseUnit", I."NumInBuy" AS "PurchaseItemsPerUnit",
       I."SalUnitMsr" AS "SalesUnit", I."NumInSale" AS "SalesItemsPerUnit",
       CASE I."ManBtchNum" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "ManageBatchNumbers",
       CASE I."ManSerNum" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "ManageSerialNumbers",
       I."VatGroupPu" AS "PurchaseVATGroup", I."VatGourpSa" AS "SalesVATGroup",
       CASE I."EvalSystem" WHEN 'S' THEN 'bis_Standard' WHEN 'F' THEN 'bis_FIFO' WHEN 'B' THEN 'bis_SNB' ELSE 'bis_MovingAverage' END AS "CostAccountingMethod",
       CASE I."GLMethod" WHEN 'W' THEN 'glm_WH' WHEN 'L' THEN 'glm_ItemLevel' ELSE 'glm_ItemClass' END AS "GLMethod"
FROM OITM I LEFT JOIN OITB G ON G."ItmsGrpCod" = I."ItmsGrpCod"
WHERE I."ItemType" <> 'F'
ORDER BY I."ItemCode"
