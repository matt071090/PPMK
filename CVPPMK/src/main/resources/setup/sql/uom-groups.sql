-- Setup B · UoM Groups (bandingkan saja; baris konversi UGP1 & base UoM memakai nomor entry, upload menyusul)
SELECT G."UgpEntry" AS "_key", G."UgpCode" AS "Code", G."UgpName" AS "Name", U."UomCode" AS "BaseUoM",
       (SELECT STRING_AGG(A."UomCode" || '=' || TO_VARCHAR(L."AltQty") || '/' || TO_VARCHAR(L."BaseQty"), ', ' ORDER BY L."LineNum")
          FROM UGP1 L LEFT JOIN OUOM A ON A."UomEntry" = L."UomEntry" WHERE L."UgpEntry" = G."UgpEntry") AS "Conversions"
FROM OUGP G LEFT JOIN OUOM U ON U."UomEntry" = G."BaseUom"
WHERE G."UgpEntry" <> -1
ORDER BY G."UgpCode"
