-- User SAP B1 (kolom password sengaja tidak diambil)
SELECT U."USER_CODE", U."U_NAME", U."SUPERUSER", U."Locked", TO_VARCHAR(U."lastLogin", 'YYYY-MM-DD') AS "LastLogin",
       (SELECT STRING_AGG(B."BPLName", ', ') FROM USR6 X JOIN OBPL B ON B."BPLId" = X."BPLId"
         WHERE X."UserCode" = U."USER_CODE") AS "Branches"
FROM OUSR U
ORDER BY U."USER_CODE"
