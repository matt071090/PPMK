-- Template yang dipakai tiap user (OUSR.TPLId)
SELECT U."USER_CODE", U."U_NAME", U."TPLId", T."TPLName", T."IsTemplate"
FROM OUSR U
LEFT JOIN UICU T ON T."TPLId" = U."TPLId"
ORDER BY U."USER_CODE"
