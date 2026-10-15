-- 2.3 Asset Class + depreciation area (Administration > Setup > Fixed Assets > Asset Classes)
SELECT C."Code", C."Name", C."AssetType", A."DprAreaID", A."AcctDtn", A."DprTypID", A."UseLife", A."Active"
FROM OACS C LEFT JOIN ACS1 A ON A."Code" = C."Code"
ORDER BY C."Code", A."LineNum"
