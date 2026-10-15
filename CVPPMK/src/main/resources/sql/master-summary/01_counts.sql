-- 3.4 Jumlah master data yang sudah di-load
SELECT 'Item' AS "Objek", 'OITM' AS "Tabel", COUNT(*) AS "Jumlah" FROM OITM UNION ALL
SELECT 'Customer', 'OCRD', COUNT(*) FROM OCRD WHERE "CardType" = 'C' UNION ALL
SELECT 'Vendor', 'OCRD', COUNT(*) FROM OCRD WHERE "CardType" = 'S' UNION ALL
SELECT 'Lead', 'OCRD', COUNT(*) FROM OCRD WHERE "CardType" = 'L' UNION ALL
SELECT 'Bill of Materials', 'OITT', COUNT(*) FROM OITT UNION ALL
SELECT 'Resource', 'ORSC', COUNT(*) FROM ORSC UNION ALL
SELECT 'Route Stage', 'ORST', COUNT(*) FROM ORST UNION ALL
SELECT 'Fixed Asset', 'OITM', COUNT(*) FROM OITM WHERE "ItemType" = 'F' UNION ALL
SELECT 'Employee', 'OHEM', COUNT(*) FROM OHEM
