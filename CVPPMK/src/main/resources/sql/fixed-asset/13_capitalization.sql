-- Kesiapan upload aset: dokumen Capitalization yang sudah ada di DB tujuan
SELECT COUNT(*) AS "Dokumen", MIN(TO_VARCHAR("PostDate", 'YYYY-MM-DD')) AS "Awal", MAX(TO_VARCHAR("PostDate", 'YYYY-MM-DD')) AS "Akhir" FROM OACQ
