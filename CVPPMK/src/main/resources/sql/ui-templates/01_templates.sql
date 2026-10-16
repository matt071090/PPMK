-- UI Configuration Template (Administration > Setup > General > UI Configuration Template)
-- IsTemplate = 'Y': template bersama yang bisa di-assign; 'N': template lokal milik satu user
SELECT T."TPLId", T."TPLName", T."TPLDesc", T."IsTemplate", O."USER_CODE" AS "Owner",
       (SELECT COUNT(*) FROM UIC1 F WHERE F."TPLId" = T."TPLId") AS "Forms",
       (SELECT STRING_AGG(S."USER_CODE", '|') FROM OUSR S WHERE S."TPLId" = T."TPLId") AS "Users",
       (SELECT STRING_AGG(G."GroupName", '|') FROM OUGR G WHERE G."TPLId" = T."TPLId") AS "Groups"
FROM UICU T
LEFT JOIN OUSR O ON O."USERID" = T."UserID"
ORDER BY T."TPLId"
