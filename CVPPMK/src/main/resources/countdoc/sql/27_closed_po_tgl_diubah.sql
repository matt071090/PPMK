-- Count Document: Closed_PO (tgl diubah) (kelompok Purchasing). Hanya SELECT; schema ditentukan koneksi (currentschema).
-- Parameter: 1 = tanggal awal, 2 = tanggal akhir (inklusif). Baris tanpa tanggal ikut sebagai NULL.
SELECT Z."USER_CODE", Z."U_NAME", Z."CreateDate", Z."Counted", Z."Status"
FROM (
	SELECT 10 AS "No", 'Closed_PO (tgl diubah)' AS "ObjType" , 'Purchasing' AS "GroupType",
				B."USER_CODE",B."U_NAME",
				A."UpdateDate" AS "CreateDate",
				COUNT(*) AS "Counted", '' AS "Status"
				FROM "OPOR" A
				LEFT JOIN "OUSR" B ON A."UserSign2"=B."USERID"
				WHERE  A."DocStatus" = 'C' AND A."InvntSttus" = 'O'
				GROUP BY B."USER_CODE",B."U_NAME", A."UpdateDate"
) Z
WHERE (Z."CreateDate" >= ? AND Z."CreateDate" <= ?) OR Z."CreateDate" IS NULL
