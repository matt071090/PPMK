-- Count Document: GR_PO_SAP (kelompok Purchasing). Hanya SELECT; schema ditentukan koneksi (currentschema).
-- Parameter: 1 = tanggal awal, 2 = tanggal akhir (inklusif). Baris tanpa tanggal ikut sebagai NULL.
SELECT Z."USER_CODE", Z."U_NAME", Z."CreateDate", Z."Counted", Z."Status"
FROM (
	SELECT 6 AS "No", 'GR_PO_SAP' AS "ObjType" , 'Purchasing' AS "GroupType",
				B."USER_CODE",B."U_NAME",
				A."CreateDate" AS "CreateDate",
				COUNT(*) AS "Counted" , A."DocStatus" AS "Status"
				FROM "OPDN" A
				LEFT JOIN "OUSR" B ON A."UserSign"=B."USERID"
				WHERE B."U_NAME" NOT IN('IFLOCS02', 'INTERFACE', 'NGINO Indirect', 'Tenesan Indirect', 'Jombok Indirect')
				GROUP BY B."USER_CODE",B."U_NAME", A."CreateDate", A."DocStatus"
) Z
WHERE (Z."CreateDate" >= ? AND Z."CreateDate" <= ?) OR Z."CreateDate" IS NULL
