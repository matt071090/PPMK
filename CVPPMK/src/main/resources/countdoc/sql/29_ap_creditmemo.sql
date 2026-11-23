-- Count Document: AP_CreditMemo (kelompok Purchasing). Hanya SELECT; schema ditentukan koneksi (currentschema).
-- Parameter: 1 = tanggal awal, 2 = tanggal akhir (inklusif). Baris tanpa tanggal ikut sebagai NULL.
SELECT Z."USER_CODE", Z."U_NAME", Z."CreateDate", Z."Counted", Z."Status"
FROM (
	SELECT 9 AS "No", 'AP_CreditMemo' AS "ObjType" , 'Purchasing' AS "GroupType",
				B."USER_CODE",B."U_NAME",
				A."CreateDate" AS "CreateDate",
				COUNT(*) AS "Counted" , A."DocStatus" AS "Status"
				FROM "ORPC" A
				LEFT JOIN "OUSR" B ON A."UserSign"=B."USERID"
				GROUP BY B."USER_CODE",B."U_NAME", A."CreateDate" , A."DocStatus"
) Z
WHERE (Z."CreateDate" >= ? AND Z."CreateDate" <= ?) OR Z."CreateDate" IS NULL
