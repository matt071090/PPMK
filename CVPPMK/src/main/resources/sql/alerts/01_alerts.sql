-- 4.2 Alert Management (Administration > Alerts Management)
SELECT A."Code", A."Name", A."Type", A."Priority", A."Active", A."FrqncyType", A."FrqncyIntr", A."ExecTime",
       Q."QName", (SELECT COUNT(*) FROM ALT1 R WHERE R."Code" = A."Code") AS "Recipients"
FROM OALT A LEFT JOIN OUQR Q ON Q."IntrnalKey" = A."QueryId"
ORDER BY A."Code"
