-- 1.4 License: jumlah user SAP sebagai pembanding jumlah license (data license sendiri dari License Server, /api/sld/license)
SELECT COUNT(*) AS "Total",
       SUM(CASE WHEN U."Locked" = 'N' THEN 1 ELSE 0 END) AS "Aktif",
       SUM(CASE WHEN U."Locked" = 'N' AND U."SUPERUSER" = 'Y' THEN 1 ELSE 0 END) AS "Superuser"
FROM OUSR U
