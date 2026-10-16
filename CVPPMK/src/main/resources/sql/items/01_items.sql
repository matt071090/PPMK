-- 3.2 Item Master Data (Inventory > Item Master Data). Kolom list view masih dasar, bisa ditambah belakangan.
SELECT I."ItemCode", I."ItemName", I."FrgnName", G."ItmsGrpNam", I."ItemType", I."InvntItem", I."SellItem", I."PrchseItem",
       I."InvntryUom", I."ManBtchNum", I."ManSerNum", I."validFor", I."frozenFor"
FROM OITM I
LEFT JOIN OITB G ON G."ItmsGrpCod" = I."ItmsGrpCod"
ORDER BY I."ItemCode"
