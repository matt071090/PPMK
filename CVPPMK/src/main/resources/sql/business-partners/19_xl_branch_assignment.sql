-- 3.4 Excel BP Master Data, sheet "Branch Assignment" (CRD8: satu baris per BP per branch, tab Branch Assignment).
-- Is Default = Default Branch di header BP (OCRD.DflBranch). Disabled = branch tidak boleh dipakai BP ini.
SELECT C."CardCode" AS "BP Code", C."CardName" AS "BP Name", X."BPLId" AS "Branch ID", B."BPLName" AS "Branch",
       CASE WHEN X."BPLId" = C."DflBranch" THEN 'Y' ELSE 'N' END AS "Is Default", X."DisabledBP" AS "Disabled"
FROM CRD8 X
JOIN OCRD C ON C."CardCode" = X."CardCode"
LEFT JOIN OBPL B ON B."BPLId" = X."BPLId"
ORDER BY C."CardCode", X."BPLId"
