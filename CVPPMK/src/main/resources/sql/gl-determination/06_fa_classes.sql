-- 2.2 tab Fixed Assets: asset class yang memakai tiap account determination (+ metode penyusutan, untuk akun wajib)
SELECT C."Code", C."Name", A."DprAreaID", A."AcctDtn", A."DprTypID", T."DprMeth"
FROM OACS C JOIN ACS1 A ON A."Code" = C."Code"
LEFT JOIN ODTP T ON T."Code" = A."DprTypID"
ORDER BY C."Code", A."LineNum"
