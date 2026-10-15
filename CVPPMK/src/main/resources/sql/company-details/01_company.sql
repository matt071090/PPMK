-- 1.1 Company Details: tab General, Accounting Data, Basic Initialization (OADM, ADM1, CINF)
SELECT A."CompnyName", A."AliasName", A."PrintHeadr", A."PrintHdrF", A."CompnyAddr", A."CmpnyAddrF",
       A."Phone1", A."Phone2", A."Fax", A."E_Mail", A."Manager",
       B."Street", B."StreetF", B."StreetNo", B."Building", B."Block", B."City", B."CityF",
       B."ZipCode", B."ZipCodeF", B."County", B."State", B."Country", Y."Name" AS "CountryName", B."IntrntAdrs",
       A."TaxIdNum", A."TaxIdNum2", A."TaxIdNum3", A."U_STEM_IDTKU", A."RevOffice",
       A."MainCurncy", A."SysCurrncy", A."DispPosDeb", A."NegAmount", A."ContInvnt", A."InvntSystm",
       A."PriceSys", A."UsePaSys", C."RelStkNoPr", A."EnPriceMod", A."InstFixAst", A."DeprecCalc",
       A."MltpBrnchs", A."CCMask", A."NewAcctDe", A."PrjMngmnt",
       C."Version", CURRENT_SCHEMA AS "Schema"
FROM OADM A CROSS JOIN ADM1 B CROSS JOIN CINF C
LEFT JOIN OCRY Y ON Y."Code" = B."Country"
