-- Kesiapan upload aset: posting period per bulan sampai 2027 (PeriodStat N = terbuka, selain itu tertutup/terkunci)
SELECT "Category", "Code", TO_VARCHAR("F_RefDate", 'YYYY-MM-DD') AS "F_RefDate", TO_VARCHAR("T_RefDate", 'YYYY-MM-DD') AS "T_RefDate", "PeriodStat"
FROM OFPR WHERE "F_RefDate" < TO_DATE('2028-01-01', 'YYYY-MM-DD') ORDER BY "F_RefDate"
