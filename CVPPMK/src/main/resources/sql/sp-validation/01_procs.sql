-- 4.4 Semua stored procedure di company ini (pemisahan bawaan SAP dilakukan di halaman, lihat js/pages/sp-validation.js)
SELECT PROCEDURE_NAME AS "Name", LENGTH(DEFINITION) AS "Len", TO_VARCHAR(CREATE_TIME, 'YYYY-MM-DD HH24:MI') AS "Created"
FROM SYS.PROCEDURES
WHERE SCHEMA_NAME = CURRENT_SCHEMA
ORDER BY PROCEDURE_NAME
