-- Setup 1.5 Sales Employee / Buyer -> Service Layer SalesPersons. Alias kolom = nama field SL; _key = key entity di DB yang dibaca.
SELECT S."SlpCode" AS "_key", S."SlpName" AS "SalesEmployeeName", S."Memo" AS "Remarks", S."Commission" AS "CommissionForSalesEmployee",
       S."Telephone", S."Mobil" AS "Mobile", S."Email", CASE S."Active" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "Active"
FROM OSLP S
WHERE S."SlpCode" <> -1
ORDER BY S."SlpCode"
