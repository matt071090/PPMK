-- 1.7 Tax Group (Administration > Setup > Financials > Tax > Tax Groups)
SELECT V."Code", V."Name", V."Category", V."Rate", TO_VARCHAR(V."EffecDate", 'YYYY-MM-DD') AS "EffecDate",
       V."Account", V."Locked", V."Inactive"
FROM OVTG V
ORDER BY V."Category", V."Code"
