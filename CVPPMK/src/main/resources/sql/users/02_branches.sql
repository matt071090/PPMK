-- 1.6 User, sheet Excel "Branch Assignment" (USR6: satu baris per user per branch yang boleh diakses)
SELECT U."USER_CODE" AS "User Code", U."U_NAME" AS "User Name", X."BPLId" AS "Branch ID", B."BPLName" AS "Branch",
       X."AcsDsbldBP" AS "Access Disabled BP"
FROM USR6 X
JOIN OUSR U ON U."USER_CODE" = X."UserCode"
LEFT JOIN OBPL B ON B."BPLId" = X."BPLId"
ORDER BY U."USER_CODE", X."BPLId"
