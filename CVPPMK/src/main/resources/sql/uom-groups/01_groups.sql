-- 1.13 UoM Group (Administration > Setup > Inventory > UoM Groups)
SELECT G."UgpEntry", G."UgpCode", G."UgpName", U."UomCode" AS "BaseUomCode", G."Locked"
/*@udf-cols OUGP G*/
FROM OUGP G LEFT JOIN OUOM U ON U."UomEntry" = G."BaseUom"
/*@udf-joins OUGP G*/
ORDER BY G."UgpCode"
