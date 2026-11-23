-- Count Document: Goods_Issue_SAP (kelompok InventoryMovement). Hanya SELECT; schema ditentukan koneksi (currentschema).
-- Parameter: 1 = tanggal awal, 2 = tanggal akhir (inklusif). Baris tanpa tanggal ikut sebagai NULL.
SELECT Z."USER_CODE", Z."U_NAME", Z."CreateDate", Z."Counted", Z."Status"
FROM (
	SELECT 22 AS "No", 'Goods_Issue_SAP' AS "ObjType", 'InventoryMovement' AS "GroupType",
				B."USER_CODE",B."U_NAME",
				A."CreateDate" AS "CreateDate",
				COUNT(*) AS "Counted" , A."DocStatus" AS "Status"
				FROM "OIGE" A
				LEFT JOIN "OUSR" B ON A."UserSign"=B."USERID"
				WHERE A."DataSource" <> 'O'
				AND A."DocEntry" IN
				(SELECT DISTINCT "DocEntry" FROM IGE1 WHERE "BaseType" <> '202')
				AND  B."U_NAME" NOT IN('IFLOCS02', 'INTERFACE', 'NGINO Indirect', 'Tenesan Indirect', 'Jombok Indirect')
				GROUP BY B."USER_CODE",B."U_NAME", A."CreateDate", A."DocStatus"
) Z
WHERE (Z."CreateDate" >= ? AND Z."CreateDate" <= ?) OR Z."CreateDate" IS NULL
