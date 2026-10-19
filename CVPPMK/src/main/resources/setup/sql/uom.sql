-- Setup B · Units of Measure -> UnitOfMeasurements (template T07). UomEntry -1 = "Manual" bawaan SAP, tidak dibawa.
SELECT U."UomEntry" AS "_key", U."UomCode" AS "Code", U."UomName" AS "Name"
FROM OUOM U
WHERE U."UomEntry" <> -1
ORDER BY U."UomCode"
