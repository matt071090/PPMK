-- Count Document: Outgoing_Payment_Approved (kelompok Approval). Hanya SELECT; schema ditentukan koneksi (currentschema).
-- Parameter: 1 = tanggal awal, 2 = tanggal akhir (inklusif). Baris tanpa tanggal ikut sebagai NULL.
SELECT Z."USER_CODE", Z."U_NAME", Z."CreateDate", Z."Counted", Z."Status"
FROM (
	SELECT
				83 AS "No", 'Outgoing_Payment_Approved' AS "ObjType" , 'Approval' AS "GroupType",
				X."USER_CODE",X."U_NAME",
				X."CreateDate",
				SUM(X."Counted") AS "Counted", '' AS "Status"
				FROM
				(
					SELECT  DISTINCT
					T3."USER_CODE",T3."U_NAME", T1."CreateDate", COUNT(*) AS "Counted"
					FROM "OWDD" T0
					INNER JOIN "ODRF" T1 ON T0."DocEntry" = T1."DocEntry"
					INNER JOIN "WDD1" T2 ON T0."WddCode" = T2."WddCode" AND T2."Status" != 'W'
					LEFT JOIN "OUSR" T3 ON T2."UserID"=T3."USERID"
					WHERE T0."Status" = 'Y' AND (T0."ObjType" = 46 OR T0."ObjType" = 112) AND (T1."ObjType" = 46)
					GROUP BY T3."USER_CODE",T3."U_NAME", T1."CreateDate"
					UNION ALL
					SELECT DISTINCT T3."USER_CODE",T3."U_NAME", T1."CreateDate",COUNT(*) AS "Counted"
					FROM "OWDD" T0
					INNER JOIN "OVPM" T1 ON T0."DocEntry" = T1."DocEntry"
					INNER JOIN "WDD1" T2 ON T0."WddCode" = T2."WddCode" AND T2."Status" != 'W'
					LEFT JOIN "OUSR" T3 ON T2."UserID"=T3."USERID"
					WHERE T0."Status" = 'Y' AND (T0."ObjType" = 46 OR T0."ObjType" = 112)
					GROUP BY T3."USER_CODE",T3."U_NAME", T1."CreateDate"
				) X
				GROUP BY X."USER_CODE",X."U_NAME", X."CreateDate"
) Z
WHERE (Z."CreateDate" >= ? AND Z."CreateDate" <= ?) OR Z."CreateDate" IS NULL
