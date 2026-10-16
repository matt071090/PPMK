-- 3.1 Item Group (Administration > Setup > Inventory > Item Groups)
SELECT G."ItmsGrpCod", G."ItmsGrpNam", G."InvntSys", G."PlaningSys", G."PrcrmntMtd", G."Locked", (SELECT "GLMethod" FROM OADM) AS "GLMethod",
       (SELECT COUNT(*) FROM OITM I WHERE I."ItmsGrpCod" = G."ItmsGrpCod") AS "ItemCount"
/*@udf-cols OITB G*/
FROM OITB G
/*@udf-joins OITB G*/
ORDER BY G."ItmsGrpCod"
