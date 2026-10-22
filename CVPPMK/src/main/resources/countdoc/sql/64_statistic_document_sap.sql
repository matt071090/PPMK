-- Count Document: Statistic Document_SAP (kelompok Farm). Hanya SELECT; schema ditentukan koneksi (currentschema).
-- Parameter: 1 = tanggal awal, 2 = tanggal akhir (inklusif). Baris tanpa tanggal ikut sebagai NULL.
SELECT Z."USER_CODE", Z."U_NAME", Z."CreateDate", Z."Counted", Z."Status"
FROM (
	SELECT 87 AS "No", 'Statistic Document_SAP' AS "ObjType", 'Farm' AS "GroupType",B."USER_CODE",B."U_NAME",A."CreateDate" AS "CreateDate",
			COUNT(*) AS "Counted" , A."Status"
			FROM "@STEM_MSTATISTIC" A
			LEFT JOIN "OUSR" B ON A."UserSign"=B."USERID"
			WHERE "Canceled" = 'N'
			AND B."U_NAME" NOT IN ('IFLOCS02', 'INTERFACE', 'NGINO Indirect', 'Tenesan Indirect', 'Jombok Indirect')
			GROUP BY B."USER_CODE",B."U_NAME", A."CreateDate", A."Status"
) Z
WHERE (Z."CreateDate" >= ? AND Z."CreateDate" <= ?) OR Z."CreateDate" IS NULL
