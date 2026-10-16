-- User SAP B1 (kolom password sengaja tidak diambil). Branches dipisah "|" untuk ditampilkan sebagai tag.
SELECT U."USER_CODE", U."U_NAME", U."SUPERUSER", U."Locked", TO_VARCHAR(U."lastLogin", 'YYYY-MM-DD') AS "LastLogin",
       (SELECT STRING_AGG(B."BPLName", '|' ORDER BY B."BPLId") FROM USR6 X JOIN OBPL B ON B."BPLId" = X."BPLId"
         WHERE X."UserCode" = U."USER_CODE") AS "Branches"
/*@udf-cols OUSR U*/
FROM OUSR U
/*@udf-joins OUSR U*/
ORDER BY U."USER_CODE"
