-- Count Document: Standard (kelompok Farm). Hanya SELECT; schema ditentukan koneksi (currentschema).
-- Parameter: 1 = tanggal awal, 2 = tanggal akhir (inklusif). Baris tanpa tanggal ikut sebagai NULL.
SELECT Z."USER_CODE", Z."U_NAME", Z."CreateDate", Z."Counted", Z."Status"
FROM (
	SELECT 92 AS "No", 'Standard' AS "ObjType", 'Farm' AS "GroupType",B."USER_CODE",B."U_NAME",A."CreateDate" AS "CreateDate",
			COUNT(*) AS "Counted" , A."U_STEM_Status" AS "Status"
			FROM "@STEM_MSTD" A
			LEFT JOIN "OUSR" B ON A."UserSign"=B."USERID"
			WHERE "Canceled" = 'N'
			GROUP BY B."USER_CODE",B."U_NAME", A."CreateDate"	, A."U_STEM_Status"
) Z
WHERE (Z."CreateDate" >= ? AND Z."CreateDate" <= ?) OR Z."CreateDate" IS NULL
