-- 3.3 Price List (Inventory > Price Lists)
SELECT L."ListNum", L."ListName", B."ListName" AS "BaseName", L."Factor", L."RoundSys", L."PrimCurr", L."IsGrossPrc", L."ValidFor"
FROM OPLN L LEFT JOIN OPLN B ON B."ListNum" = L."BASE_NUM"
ORDER BY L."ListNum"
