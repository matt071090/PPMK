-- Setup B · Employee -> EmployeesInfo (belum ada template; mapping perlu direview)
SELECT E."empID" AS "_key", E."firstName" AS "FirstName", E."middleName" AS "MiddleName", E."lastName" AS "LastName",
       E."jobTitle" AS "JobTitle", E."officeTel" AS "OfficePhone", E."mobile" AS "MobilePhone", E."email" AS "eMail",
       CASE E."Active" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "Active"
FROM OHEM E
ORDER BY E."empID"
