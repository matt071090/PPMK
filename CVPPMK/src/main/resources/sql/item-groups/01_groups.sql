-- 3.1 Item Group (Administration > Setup > Inventory > Item Groups)
SELECT G."ItmsGrpCod", G."ItmsGrpNam", G."InvntSys", G."PlaningSys", G."PrcrmntMtd", G."Locked",
       (SELECT COUNT(*) FROM OITM I WHERE I."ItmsGrpCod" = G."ItmsGrpCod") AS "ItemCount"
FROM OITB G ORDER BY G."ItmsGrpCod"
