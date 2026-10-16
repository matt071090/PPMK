-- Authorization per user (Administration > System Initialization > Authorizations > General Authorizations)
-- USR3: izin per user (F = Full, R = Read Only, N = No Authorization), USR7: keanggotaan authorization group
SELECT U."USERID", U."USER_CODE", U."U_NAME", U."SUPERUSER", U."Locked",
       (SELECT STRING_AGG(G."GroupName", '|') FROM USR7 X JOIN OUGR G ON G."GroupId" = X."GroupId" WHERE X."UserId" = U."USERID") AS "AuthGroups",
       (SELECT COUNT(*) FROM USR3 P WHERE P."UserLink" = U."USERID" AND P."Permission" = 'F') AS "PermFull",
       (SELECT COUNT(*) FROM USR3 P WHERE P."UserLink" = U."USERID" AND P."Permission" = 'R') AS "PermRead",
       (SELECT COUNT(*) FROM USR3 P WHERE P."UserLink" = U."USERID" AND P."Permission" = 'N') AS "PermNone"
FROM OUSR U
ORDER BY U."USER_CODE"
