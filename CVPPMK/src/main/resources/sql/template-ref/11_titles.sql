-- Dropdown template upload: akun judul (induk)
SELECT "AcctCode" || ' - ' || "AcctName" AS "v" FROM OACT WHERE "Postable" = 'N' ORDER BY "AcctCode"
