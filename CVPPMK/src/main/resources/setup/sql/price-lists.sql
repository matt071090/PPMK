-- Setup B · Price List -> PriceLists (template T04). Base price list dicocokkan lewat nama (_BasePriceList).
SELECT L."ListNum" AS "_key", L."ListName" AS "PriceListName", B."ListName" AS "_BasePriceList", L."Factor",
       L."PrimCurr" AS "DefaultPrimeCurrency", CASE L."IsGrossPrc" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "IsGrossPrice",
       CASE L."ValidFor" WHEN 'Y' THEN 'tYES' ELSE 'tNO' END AS "Active"
FROM OPLN L LEFT JOIN OPLN B ON B."ListNum" = L."BASE_NUM"
ORDER BY L."ListNum"
