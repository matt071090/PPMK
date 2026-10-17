-- 1.5 Employee: Employee Master Data (Human Resources > Employee Master Data). salesPrson = link ke Sales Employee / Buyer (OSLP).
SELECT E."empID", E."firstName", E."middleName", E."lastName", E."jobTitle", D."Name" AS "DeptName", P."name" AS "PosName",
       BR."Name" AS "BranchName", B."BPLName", TRIM(IFNULL(M."firstName", '') || ' ' || IFNULL(M."lastName", '')) AS "Manager",
       U."USER_CODE", E."salesPrson", S."SlpName", E."officeTel", E."mobile", E."email", E."Active",
       TO_VARCHAR(E."startDate", 'YYYY-MM-DD') AS "startDate", TO_VARCHAR(E."termDate", 'YYYY-MM-DD') AS "termDate"
/*@udf-cols OHEM E*/
FROM OHEM E
LEFT JOIN OUDP D ON D."Code" = E."dept"
LEFT JOIN OHPS P ON P."posID" = E."position"
LEFT JOIN OUBR BR ON BR."Code" = E."branch"
LEFT JOIN OHEM M ON M."empID" = E."manager"
LEFT JOIN OUSR U ON U."USERID" = E."userId"
LEFT JOIN OSLP S ON S."SlpCode" = E."salesPrson"
LEFT JOIN OBPL B ON B."BPLId" = E."BPLId"
/*@udf-joins OHEM E*/
ORDER BY E."empID"
