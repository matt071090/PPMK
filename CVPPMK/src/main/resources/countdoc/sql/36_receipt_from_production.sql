-- Count Document: Receipt_From_Production (kelompok Production). Hanya SELECT; schema ditentukan koneksi (currentschema).
-- Parameter: 1 = tanggal awal, 2 = tanggal akhir (inklusif). Baris tanpa tanggal ikut sebagai NULL.
SELECT Z."USER_CODE", Z."U_NAME", Z."CreateDate", Z."Counted", Z."Status"
FROM (
	SELECT 17 AS "No", 'Receipt_From_Production' AS "ObjType", 'Production' AS "GroupType",
				B."USER_CODE",B."U_NAME",
				A."CreateDate" AS "CreateDate",
				COUNT(*) AS "Counted" , A."DocStatus" AS "Status"
				FROM "OIGN" A
				LEFT JOIN "OUSR" B ON A."UserSign"=B."USERID"
				Where A."DocEntry" IN
				(SELECT DISTINCT "DocEntry" FROM IGN1 WHERE "BaseType" = '202')
				GROUP BY B."USER_CODE",B."U_NAME", A."CreateDate", A."DocStatus"
) Z
WHERE (Z."CreateDate" >= ? AND Z."CreateDate" <= ?) OR Z."CreateDate" IS NULL
