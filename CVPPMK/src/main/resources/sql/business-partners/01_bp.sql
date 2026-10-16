-- 3.3 Business Partner (Business Partners > Business Partner Master Data)
-- Branches: branch yang di-assign di tab Branches (CRD8, DisabledBP = 'N'), dipisah "|" untuk ditampilkan sebagai tag
SELECT C."CardCode", C."CardName", C."CardType", G."GroupName", C."Currency", C."validFor", C."frozenFor",
       (SELECT STRING_AGG(B."BPLName", '|' ORDER BY B."BPLId") FROM CRD8 X JOIN OBPL B ON B."BPLId" = X."BPLId"
         WHERE X."CardCode" = C."CardCode" AND X."DisabledBP" = 'N') AS "Branches"
FROM OCRD C
LEFT JOIN OCRG G ON G."GroupCode" = C."GroupCode"
ORDER BY C."CardType", C."CardCode"
