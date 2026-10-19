SELECT "TableID", "AliasID", "Descr"
FROM "CUFD"
WHERE "TableID" IN ('OWHS', 'OWTR', 'OWTQ', 'WTR1', 'WTQ1') OR "AliasID" = 'BRANCH'
ORDER BY "TableID", "AliasID"
