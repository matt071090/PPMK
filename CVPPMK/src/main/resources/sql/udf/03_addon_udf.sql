SELECT "TableID", "AliasID", "Descr"
FROM "CUFD"
WHERE "TableID" IN ('OWHS', 'OWTR', 'OWTQ', 'WTR1', 'WTQ1', 'OIGE', 'OIGN') OR "AliasID" = 'BRANCH'
ORDER BY "TableID", "AliasID"
