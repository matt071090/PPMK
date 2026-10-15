-- 5.1 User-Defined Object (Tools > Customization Tools > Object Registration Wizard)
SELECT O."Code", O."Name", O."TableName", O."TYPE", O."MngSeries", O."CanFind", O."CanCancel", O."CanClose", O."CanDelete", O."CanLog", O."CanApprove",
       (SELECT STRING_AGG(C."TableName", ', ' ORDER BY C."SonNum") FROM UDO1 C WHERE C."Code" = O."Code") AS "ChildTables"
FROM OUDO O ORDER BY O."Code"
