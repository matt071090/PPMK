-- Referensi (tidak tampil di menu): branch, untuk mengubah nama branch jadi BPLID tujuan
SELECT B."BPLId" AS "_key", B."BPLName" AS "Name"
FROM OBPL B
ORDER BY B."BPLId"
