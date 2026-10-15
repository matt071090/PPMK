-- 1.12 Units of Measure + UDF UoM CoreTax (Administration > Setup > Inventory > Units of Measure)
SELECT "UomEntry", "UomCode", "UomName", "U_STEM_CT_UOM", "Locked"
FROM OUOM
ORDER BY "UomCode"
