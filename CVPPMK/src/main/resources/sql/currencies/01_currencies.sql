-- Currency
SELECT C."CurrCode", C."CurrName", C."ISOCurrCod", C."Decimals", C."Locked"
/*@udf-cols OCRN C*/
FROM OCRN C
/*@udf-joins OCRN C*/
ORDER BY C."CurrCode"
