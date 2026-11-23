-- Count Document: GRPO_Rejected (kelompok Approval). Hanya SELECT; schema ditentukan koneksi (currentschema).
-- Parameter: 1 = tanggal awal, 2 = tanggal akhir (inklusif). Baris tanpa tanggal ikut sebagai NULL.
SELECT Z."USER_CODE", Z."U_NAME", Z."CreateDate", Z."Counted", Z."Status"
FROM (
	SELECT
				12 AS "No", 'GRPO_Rejected' AS "ObjType" , 'Approval' AS "GroupType",
				Y."USER_CODE",Y."U_NAME",
				Y."CreateDate",
				SUM(Y."Counted") AS "Counted", Y."DocStatus" AS "Status"
				FROM
				(
					SELECT  DISTINCT
					T3."USER_CODE",T3."U_NAME", T1."CreateDate", COUNT(*) AS "Counted" , T1."DocStatus"
					FROM "OWDD" T0
					INNER JOIN "ODRF" T1 ON T0."DocEntry" = T1."DocEntry"
					INNER JOIN "WDD1" T2 ON T0."WddCode" = T2."WddCode" AND T2."Status" != 'W'
					LEFT JOIN "OUSR" T3 ON T2."UserID"=T3."USERID"
					WHERE T0."Status" = 'N' AND (T0."ObjType" = 20 OR T0."ObjType" = 112) AND (T1."ObjType" = 20)
					GROUP BY T3."USER_CODE",T3."U_NAME", T1."CreateDate",T1."DocStatus"
					UNION ALL
					SELECT DISTINCT T3."USER_CODE",T3."U_NAME", T1."CreateDate",COUNT(*) AS "Counted" , T1."DocStatus"
					FROM "OWDD" T0
					INNER JOIN "OPDN" T1 ON T0."DocEntry" = T1."DocEntry"
					INNER JOIN "WDD1" T2 ON T0."WddCode" = T2."WddCode" AND T2."Status" != 'W'
					LEFT JOIN "OUSR" T3 ON T2."UserID"=T3."USERID"
					WHERE T0."Status" = 'N' AND (T0."ObjType" = 20 OR T0."ObjType" = 112)
					GROUP BY T3."USER_CODE",T3."U_NAME", T1."CreateDate", T1."DocStatus"
				) Y
				GROUP BY Y."USER_CODE",Y."U_NAME", Y."CreateDate",Y."DocStatus"
) Z
WHERE (Z."CreateDate" >= ? AND Z."CreateDate" <= ?) OR Z."CreateDate" IS NULL
