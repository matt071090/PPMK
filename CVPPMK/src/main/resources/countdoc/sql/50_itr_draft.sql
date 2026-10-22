-- Count Document: ITR_Draft (kelompok InventoryMovement). Hanya SELECT; schema ditentukan koneksi (currentschema).
-- Parameter: 1 = tanggal awal, 2 = tanggal akhir (inklusif). Baris tanpa tanggal ikut sebagai NULL.
SELECT Z."USER_CODE", Z."U_NAME", Z."CreateDate", Z."Counted", Z."Status"
FROM (
	SELECT 20 AS "No", 'ITR_Draft' AS "ObjType", 'InventoryMovement' AS "GroupType",B."USER_CODE",B."U_NAME",A."CreateDate" AS "CreateDate",
				COUNT(*) AS "Counted" , A."DocStatus" AS "Status"
				FROM "ODRF" A
				LEFT JOIN "OUSR" B ON A."UserSign"=B."USERID"
				WHERE A."ObjType"='1250000001'
				GROUP BY B."USER_CODE",B."U_NAME", A."CreateDate", A."DocStatus"
) Z
WHERE (Z."CreateDate" >= ? AND Z."CreateDate" <= ?) OR Z."CreateDate" IS NULL
