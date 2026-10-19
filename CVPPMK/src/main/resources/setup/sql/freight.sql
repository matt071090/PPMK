-- Setup D · Freight -> AdditionalExpenses (template T20)
SELECT E."ExpnsCode" AS "_key", E."ExpnsName" AS "Name", E."RevAcct" AS "RevenuesAccount", E."ExpnsAcct" AS "ExpenseAccount",
       E."VatGroupO" AS "OutputVATGroup", E."VatGroupI" AS "InputVATGroup",
       CASE E."DistrbMthd" WHEN 'Q' THEN 'aed_Quantity' WHEN 'V' THEN 'aed_Volume' WHEN 'W' THEN 'aed_Weight' WHEN 'E' THEN 'aed_Equally'
                           WHEN 'T' THEN 'aed_LineTotal' ELSE 'aed_None' END AS "DistributionMethod"
FROM OEXD E
ORDER BY E."ExpnsCode"
