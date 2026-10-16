-- Detail izin per user. Nama izin tidak tersimpan di database (OUPT kosong), jadi hanya ID izin
SELECT U."USER_CODE", P."PermId", P."Permission"
FROM USR3 P JOIN OUSR U ON U."USERID" = P."UserLink"
ORDER BY U."USER_CODE", P."PermId"
