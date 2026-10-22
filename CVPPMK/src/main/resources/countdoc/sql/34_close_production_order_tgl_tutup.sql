-- Count Document: Close Production Order (tgl tutup) (kelompok Production). Hanya SELECT; schema ditentukan koneksi (currentschema).
-- Parameter: 1 = tanggal awal, 2 = tanggal akhir (inklusif). Baris tanpa tanggal ikut sebagai NULL.
SELECT Z."USER_CODE", Z."U_NAME", Z."CreateDate", Z."Counted", Z."Status"
FROM (
	SELECT 18 AS "No", 'Close Production Order (tgl tutup)' AS "ObjType", 'Production' AS "GroupType",
				B."USER_CODE",B."U_NAME",
				A."CloseDate" AS "CreateDate",
				COUNT(*) AS "Counted" , A."Status" AS "Status"
				FROM "OWOR" A
				LEFT JOIN "OUSR" B ON A."UserSign"=B."USERID"
				WHERE A."CloseDate" IS NOT NULL
				GROUP BY B."USER_CODE",B."U_NAME", A."CloseDate", A."Status"
) Z
WHERE (Z."CreateDate" >= ? AND Z."CreateDate" <= ?) OR Z."CreateDate" IS NULL
