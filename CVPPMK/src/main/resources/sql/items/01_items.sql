-- 3.2 Item Master Data (Inventory > Item Master Data). Dasar: query list view dari user (2026-10-16).
-- Kolom standar SAP di bawah tetap; semua UDF OITM ditambahkan otomatis dari CUFD lewat penanda @udf-cols / @udf-joins
-- (valid values tampil "kode - deskripsi").
SELECT
  IFNULL(T0."ItemCode", '')                       AS "Item No."
, IFNULL(T0."ItemName", '')                       AS "Description"
, IFNULL(T0."FrgnName", '')                       AS "Foreign Name"
, CASE T0."ItemType" WHEN 'I' THEN 'Items' WHEN 'L' THEN 'Labor'
                     WHEN 'T' THEN 'Travel' WHEN 'F' THEN 'Fixed Assets'
                     ELSE IFNULL(T0."ItemType", '') END AS "Item Type"
, IFNULL(T1."ItmsGrpNam", '')                     AS "Item Group"
, IFNULL(T0."InvntItem", '')                      AS "Inventory Item"
, IFNULL(T0."SellItem", '')                       AS "Sales Item"
, IFNULL(T0."PrchseItem", '')                     AS "Purchasing Item"
, CASE WHEN T0."UgpEntry" = -1 THEN 'Manual'
       ELSE IFNULL(T2."UgpName", '') END          AS "UoM Group"
, IFNULL(T0."WTLiable", '')                       AS "Withholding Tax Liable"
, CASE WHEN T0."ManSerNum" = 'Y' THEN 'Serial Numbers'
       WHEN T0."ManBtchNum" = 'Y' THEN 'Batches'
       ELSE 'None' END                            AS "Manage Item by"
, CASE T0."MngMethod" WHEN 'A' THEN 'On Every Transaction'
                      WHEN 'R' THEN 'On Release Only'
                      ELSE '' END                 AS "Management Method"
, CASE WHEN T0."validFor" = 'Y' AND T0."frozenFor" = 'Y' THEN 'Advanced'
       WHEN T0."frozenFor" = 'Y' THEN 'Inactive'
       ELSE 'Active' END                          AS "Status"
, IFNULL(TO_VARCHAR(CASE WHEN T0."frozenFor" = 'Y' AND T0."validFor" = 'N'
       THEN T0."frozenFrom" ELSE T0."validFrom" END, 'YYYYMMDD'), '') AS "Status From"
, IFNULL(TO_VARCHAR(CASE WHEN T0."frozenFor" = 'Y' AND T0."validFor" = 'N'
       THEN T0."frozenTo" ELSE T0."validTo" END, 'YYYYMMDD'), '')     AS "Status To"
, IFNULL(CASE WHEN T0."frozenFor" = 'Y' AND T0."validFor" = 'N'
       THEN T0."FrozenComm" ELSE T0."ValidComm" END, '')              AS "Status Remarks"
, IFNULL(T0."BuyUnitMsr", '')                     AS "Purchasing UoM Name"
, IFNULL(T0."NumInBuy", 0)                        AS "Items per Purchasing Unit"
, IFNULL(T0."PurPackMsr", '')                     AS "Purch. Packaging UoM Name"
, IFNULL(T0."PurPackUn", 0)                       AS "Purch. Qty per Package"
, IFNULL(T0."BLength1", 0)                        AS "Purch. Length"
, IFNULL(T0."BWidth1", 0)                         AS "Purch. Width"
, IFNULL(T0."BHeight1", 0)                        AS "Purch. Height"
, IFNULL(T0."BVolume", 0)                         AS "Purch. Volume"
, IFNULL(T6."UnitDisply", '')                     AS "Purch. Volume Unit"
, IFNULL(T0."BWeight1", 0)                        AS "Purch. Weight"
, IFNULL(T0."PurFactor1", 0)                      AS "Purch. Factor 1"
, IFNULL(T0."PurFactor2", 0)                      AS "Purch. Factor 2"
, IFNULL(T0."PurFactor3", 0)                      AS "Purch. Factor 3"
, IFNULL(T0."PurFactor4", 0)                      AS "Purch. Factor 4"
, CASE WHEN T0."CstGrpCode" = -1 THEN 'Customs Exempt'
       ELSE IFNULL(T3."CstGrpName", '') END       AS "Customs Group"
, IFNULL(T4."Name", '')                           AS "Purchase Tax Group"
, IFNULL(T5."Name", '')                           AS "Sales Tax Group"
, IFNULL(T0."SalUnitMsr", '')                     AS "Sales UoM Name"
, IFNULL(T0."NumInSale", 0)                       AS "Items per Sales Unit"
, IFNULL(T0."SalPackMsr", '')                     AS "Sales Packaging UoM Name"
, IFNULL(T0."SalPackUn", 0)                       AS "Sales Qty per Package"
, IFNULL(T0."SLength1", 0)                        AS "Sales Length"
, IFNULL(T0."SWidth1", 0)                         AS "Sales Width"
, IFNULL(T0."SHeight1", 0)                        AS "Sales Height"
, IFNULL(T0."SVolume", 0)                         AS "Sales Volume"
, IFNULL(T7."UnitDisply", '')                     AS "Sales Volume Unit"
, IFNULL(T0."SWeight1", 0)                        AS "Sales Weight"
, CASE T0."GLMethod" WHEN 'W' THEN 'Warehouse' WHEN 'C' THEN 'Item Group'
                     WHEN 'L' THEN 'Item Level' ELSE '' END AS "Set G/L Accounts By"
, IFNULL(T0."InvntryUom", '')                     AS "Inventory UoM Name"
, IFNULL(T0."IWeight1", 0)                        AS "Inventory Weight"
, CASE T0."EvalSystem" WHEN 'A' THEN 'Moving Average' WHEN 'S' THEN 'Standard'
                       WHEN 'F' THEN 'FIFO' WHEN 'B' THEN 'Serial/Batch'
                       ELSE '' END                AS "Valuation Method"
, IFNULL(T0."ByWh", '')                           AS "Manage Inventory by Whse"
, CASE T0."PlaningSys" WHEN 'M' THEN 'MRP' WHEN 'N' THEN 'None'
                       ELSE '' END                AS "Planning Method"
, CASE T0."PrcrmntMtd" WHEN 'B' THEN 'Buy' WHEN 'M' THEN 'Make'
                       ELSE '' END                AS "Procurement Method"
, IFNULL(T0."Phantom", '')                        AS "Phantom Item"
, CASE T0."IssueMthd" WHEN 'B' THEN 'Backflush' WHEN 'M' THEN 'Manual'
                      ELSE '' END                 AS "Issue Method"
/*@udf-cols OITM T0*/
FROM OITM T0
LEFT JOIN OITB T1 ON T1."ItmsGrpCod" = T0."ItmsGrpCod"
LEFT JOIN OUGP T2 ON T2."UgpEntry"   = T0."UgpEntry"
LEFT JOIN OARG T3 ON T3."CstGrpCode" = T0."CstGrpCode"
LEFT JOIN OVTG T4 ON T4."Code"       = T0."VatGroupPu"
LEFT JOIN OVTG T5 ON T5."Code"       = T0."VatGourpSa"
LEFT JOIN OLGT T6 ON T6."UnitCode"   = T0."BVolUnit"
LEFT JOIN OLGT T7 ON T7."UnitCode"   = T0."SVolUnit"
/*@udf-joins OITM T0*/
ORDER BY T0."ItemCode"
