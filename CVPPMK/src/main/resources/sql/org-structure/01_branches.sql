-- Branch (OBPL) + jumlah warehouse & user per branch
SELECT B."BPLId", B."BPLName", B."MainBPL", B."Disabled", B."DflWhs", B."TaxIdNum", B."City",
       (SELECT COUNT(*) FROM OWHS W WHERE W."BPLid" = B."BPLId") AS "WhsCount",
       (SELECT COUNT(*) FROM USR6 U WHERE U."BPLId" = B."BPLId") AS "UserCount"
/*@udf-cols OBPL B*/
FROM OBPL B
/*@udf-joins OBPL B*/
ORDER BY B."BPLId"
