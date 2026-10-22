-- Count Document: Goods_Receipt (kelompok InventoryMovement). Hanya SELECT; schema ditentukan koneksi (currentschema).
-- Parameter: 1 = tanggal awal, 2 = tanggal akhir (inklusif). Baris tanpa tanggal ikut sebagai NULL.
SELECT Z."USER_CODE", Z."U_NAME", Z."CreateDate", Z."Counted", Z."Status"
FROM (
	SELECT 23 AS "No", 'Goods_Receipt' AS "ObjType", 'InventoryMovement' AS "GroupType",
				B."USER_CODE",B."U_NAME",
				A."CreateDate" AS "CreateDate",
				COUNT(*) AS "Counted" , A."DocStatus" AS "Status"
				FROM "OIGN" A
				LEFT JOIN "OUSR" B ON A."UserSign"=B."USERID"
				WHERE A."DataSource" <> 'O'
				AND A."DocEntry" IN
				(SELECT DISTINCT "DocEntry" FROM IGN1 WHERE "BaseType" <> '202')
				GROUP BY B."USER_CODE",B."U_NAME", A."CreateDate", A."DocStatus"
) Z
WHERE (Z."CreateDate" >= ? AND Z."CreateDate" <= ?) OR Z."CreateDate" IS NULL
