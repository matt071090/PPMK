-- 3.2 Customer / Vendor Group (Administration > Setup > Business Partners)
SELECT G."GroupCode", G."GroupName", G."GroupType", P."ListName" AS "PriceListName", G."Locked",
       (SELECT COUNT(*) FROM OCRD C WHERE C."GroupCode" = G."GroupCode") AS "BpCount"
FROM OCRG G LEFT JOIN OPLN P ON P."ListNum" = G."PriceList"
ORDER BY G."GroupType", G."GroupCode"
