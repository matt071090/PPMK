-- 1.12 Units of Measure (Administration > Setup > Inventory > Units of Measure). UDF OUOM (mis. UoM CoreTax) ikut otomatis.
SELECT U."UomEntry", U."UomCode", U."UomName", U."Locked"
/*@udf-cols OUOM U*/
FROM OUOM U
/*@udf-joins OUOM U*/
ORDER BY U."UomCode"
