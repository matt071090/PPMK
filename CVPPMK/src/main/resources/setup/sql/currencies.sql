-- Setup B · Currencies (bandingkan saja; upload menyusul setelah field SL Currencies dicocokkan)
SELECT C."CurrCode" AS "_key", C."CurrCode" AS "Code", C."CurrName" AS "Name", C."ISOCurrCod" AS "ISOCode", C."Decimals"
FROM OCRN C
ORDER BY C."CurrCode"
