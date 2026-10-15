-- 1.15 Freight (Administration > Setup > General > Freight)
SELECT E."ExpnsCode", E."ExpnsName", E."RevAcct", R."AcctName" AS "RevName", E."ExpnsAcct", X."AcctName" AS "ExpName",
       E."VatGroupO", E."VatGroupI", E."DistrbMthd"
FROM OEXD E
LEFT JOIN OACT R ON R."AcctCode" = E."RevAcct"
LEFT JOIN OACT X ON X."AcctCode" = E."ExpnsAcct"
ORDER BY E."ExpnsCode"
