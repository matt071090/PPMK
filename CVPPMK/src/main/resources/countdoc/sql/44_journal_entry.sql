-- Count Document: Journal_Entry (kelompok Finance). Hanya SELECT; schema ditentukan koneksi (currentschema).
-- Parameter: 1 = tanggal awal, 2 = tanggal akhir (inklusif). Baris tanpa tanggal ikut sebagai NULL.
SELECT Z."USER_CODE", Z."U_NAME", Z."CreateDate", Z."Counted", Z."Status"
FROM (
	SELECT 68 AS "No", 'Journal_Entry' AS "ObjType", 'Finance' AS "GroupType",
				B."USER_CODE",B."U_NAME",
				A."CreateDate" AS "CreateDate",
				COUNT(*) AS "Counted", '' AS "Status"
				FROM "OJDT" A
				LEFT JOIN "OUSR" B ON A."UserSign"=B."USERID"
				WHERE A."TransType" = '30'
				GROUP BY B."USER_CODE",B."U_NAME", A."CreateDate"
) Z
WHERE (Z."CreateDate" >= ? AND Z."CreateDate" <= ?) OR Z."CreateDate" IS NULL
