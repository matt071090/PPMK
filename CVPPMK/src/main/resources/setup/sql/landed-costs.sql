-- Setup D · Landed Cost -> LandedCostsCodes (template T21). AllocationBy belum dibawa (kode OALC.OhType belum dicocokkan).
SELECT C."AlcCode" AS "_key", C."AlcCode" AS "Code", C."AlcName" AS "Name", C."LaCAllcAcc" AS "LandedCostsAllocationAccount",
       C."OhType" AS "_AllocationType"
FROM OALC C
ORDER BY C."AlcCode"
