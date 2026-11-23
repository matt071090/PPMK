-- Kesiapan upload aset: SP yang menyebut kode objek Capitalization 1470000049 (mis. SP Notif dengan batas nilai minimum)
SELECT PROCEDURE_NAME AS "PROCEDURE_NAME" FROM SYS.PROCEDURES WHERE SCHEMA_NAME = CURRENT_SCHEMA AND DEFINITION LIKE '%1470000049%'
