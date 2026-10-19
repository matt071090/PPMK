-- Setup D · Tax Group -> VatGroups (template T13)
SELECT V."Code" AS "_key", V."Code", V."Name", CASE V."Category" WHEN 'I' THEN 'bovcInputTax' ELSE 'bovcOutputTax' END AS "Category",
       V."Rate", TO_VARCHAR(V."EffecDate", 'YYYY-MM-DD') AS "Effectivefrom", V."Account" AS "TaxAccount"
FROM OVTG V
ORDER BY V."Category", V."Code"
