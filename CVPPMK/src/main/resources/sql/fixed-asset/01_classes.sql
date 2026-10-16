-- 2.3 Asset Class + depreciation area (Administration > Setup > Fixed Assets > Asset Classes)
-- Asset class wajib terikat ke 1 branch (OACS.BPLId)
SELECT C."Code", C."Name", C."AssetType", B."BPLName", A."DprAreaID", A."AcctDtn", A."DprTypID", A."UseLife", A."Active"
/*@udf-cols OACS C*/
FROM OACS C LEFT JOIN ACS1 A ON A."Code" = C."Code"
LEFT JOIN OBPL B ON B."BPLId" = C."BPLId"
/*@udf-joins OACS C*/
ORDER BY C."BPLId", C."Code", A."LineNum"
