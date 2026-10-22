-- Count Document: Issue_For_Production (kelompok Production). Hanya SELECT; schema ditentukan koneksi (currentschema).
-- Parameter: 1 = tanggal awal, 2 = tanggal akhir (inklusif). Baris tanpa tanggal ikut sebagai NULL.
SELECT Z."USER_CODE", Z."U_NAME", Z."CreateDate", Z."Counted", Z."Status"
FROM (
	SELECT 16 AS "No", 'Issue_For_Production' AS "ObjType", 'Production' AS "GroupType",
				B."USER_CODE",B."U_NAME",
				A."CreateDate" AS "CreateDate",
				COUNT(*) AS "Counted" , A."DocStatus" AS "Status"
				FROM "OIGE" A
				LEFT JOIN "OUSR" B ON A."UserSign"=B."USERID"
				WHERE A."DocEntry" IN
				(SELECT DISTINCT "DocEntry" FROM IGE1 WHERE "BaseType" = '202')
				GROUP BY B."USER_CODE",B."U_NAME", A."CreateDate", A."DocStatus"
) Z
WHERE (Z."CreateDate" >= ? AND Z."CreateDate" <= ?) OR Z."CreateDate" IS NULL
