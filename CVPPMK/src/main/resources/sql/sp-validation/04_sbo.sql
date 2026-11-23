-- 4.4 Isi procedure yang dipanggil SAP B1 saat dokumen disimpan, dipecah per object di halaman (js/pages/sp-parse.js)
SELECT PROCEDURE_NAME AS "Name", DEFINITION AS "Definition"
FROM SYS.PROCEDURES
WHERE SCHEMA_NAME = CURRENT_SCHEMA AND PROCEDURE_NAME LIKE 'SBO\_SP\_%' ESCAPE '\'
ORDER BY PROCEDURE_NAME
