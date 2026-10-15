-- 4.3 Ringkasan layout dokumen per jenis (P = PLD, C = Crystal) dan pembuat
SELECT "Category", "Author", COUNT(*) AS "Jumlah" FROM RDOC GROUP BY "Category", "Author" ORDER BY "Category", "Author"
