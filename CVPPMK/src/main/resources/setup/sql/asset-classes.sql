-- Setup D · Asset Class -> AssetClasses (template T15), header saja; depreciation area (ACS1) belum dibawa.
-- Branch dicocokkan lewat nama (_Branch) lalu diubah jadi BPLID tujuan saat upload.
SELECT C."Code" AS "_key", C."Code", C."Name" AS "Description",
       CASE C."AssetType" WHEN 'L' THEN 'atAssetTypeLowValueAsset' ELSE 'atAssetTypeGeneral' END AS "AssetType",
       B."BPLName" AS "_Branch"
FROM OACS C LEFT JOIN OBPL B ON B."BPLId" = C."BPLId"
ORDER BY C."Code"
