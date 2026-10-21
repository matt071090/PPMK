-- 3.4 Excel BP Master Data, sheet "General" (layar BP Master Data: header + tab General). Alias = judul kolom Excel.
-- UDF OCRD ditambahkan otomatis di akhir (label dari CUFD), jadi mengikuti UDF company mana pun.
-- Branch Assignment bisa lebih dari satu per BP, jadi ada di sheet sendiri (19_xl_branch_assignment.sql).
SELECT N."SeriesName" AS "Series", C."CardCode" AS "Code",
       CASE C."CardType" WHEN 'C' THEN 'Customer' WHEN 'S' THEN 'Vendor' WHEN 'L' THEN 'Lead' ELSE C."CardType" END AS "Card Type",
       C."CardName" AS "Name", C."CardFName" AS "Foreign Name", G."GroupName" AS "Group",
       CASE WHEN C."Currency" = '##' THEN 'All Currencies' ELSE IFNULL(R."CurrName", C."Currency") END AS "Currency",
       C."LicTradNum" AS "Federal Tax ID", C."Phone1" AS "Tel 1", C."Phone2" AS "Tel 2", C."Cellular" AS "Mobile Phone",
       C."E_Mail" AS "E-Mail", C."IntrntSite" AS "Web Site", H."TrnspName" AS "Shipping Type", I."IndName" AS "Industry",
       CASE C."CmpPrivate" WHEN 'C' THEN 'Company' WHEN 'I' THEN 'Private' WHEN 'E' THEN 'Employee' ELSE C."CmpPrivate" END AS "Type of Business",
       S."SlpName" AS "Buyer / Sales Employee", C."AliasName" AS "Alias Name",
       CASE WHEN C."frozenFor" = 'Y' THEN 'Inactive' ELSE 'Active' END AS "Status",
       TO_VARCHAR(CASE WHEN C."frozenFor" = 'Y' THEN C."frozenFrom" ELSE C."validFrom" END, 'YYYY-MM-DD') AS "Status From",
       TO_VARCHAR(CASE WHEN C."frozenFor" = 'Y' THEN C."frozenTo" ELSE C."validTo" END, 'YYYY-MM-DD') AS "Status To",
       CASE WHEN C."frozenFor" = 'Y' THEN C."FrozenComm" ELSE C."ValidComm" END AS "Status Remarks",
       C."CntctPrsn" AS "Default Contact Person"
       /*@udf-cols OCRD C*/
FROM OCRD C
LEFT JOIN NNM1 N ON N."Series" = C."Series"
LEFT JOIN OCRG G ON G."GroupCode" = C."GroupCode"
LEFT JOIN OCRN R ON R."CurrCode" = C."Currency"
LEFT JOIN OSHP H ON H."TrnspCode" = C."ShipType"
LEFT JOIN OOND I ON I."IndCode" = C."IndustryC"
LEFT JOIN OSLP S ON S."SlpCode" = C."SlpCode"
/*@udf-joins OCRD C*/
ORDER BY C."CardCode"
