-- Dropdown template upload: akun posting
SELECT "AcctCode" || ' - ' || "AcctName" AS "v" FROM OACT WHERE "Postable" = 'Y' ORDER BY "AcctCode"
