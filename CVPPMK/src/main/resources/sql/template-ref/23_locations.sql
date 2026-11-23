-- Dropdown template upload: location aset (kode - nama), dipakai Items.Location
SELECT TO_VARCHAR("Code") || ' - ' || "Location" AS "v" FROM OLCT ORDER BY "Code"
