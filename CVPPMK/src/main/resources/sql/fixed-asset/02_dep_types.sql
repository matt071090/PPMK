-- 2.3 Depreciation Type (Administration > Setup > Fixed Assets > Depreciation Types)
SELECT "Code", "Descr", "DprMeth", "PerAcq", "PerSubAcq", "PerRet", TO_VARCHAR("ValidFrom", 'YYYY-MM-DD') AS "ValidFrom"
FROM ODTP ORDER BY "Code"
