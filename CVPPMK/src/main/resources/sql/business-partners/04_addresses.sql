-- 3.4 Business Partner, tab Addresses (CRD1). AdresType: B = Bill To, S = Ship To
SELECT A."CardCode", A."AdresType", A."Address", A."Street", A."Block", A."City", A."County", A."State", A."ZipCode", A."Country"
FROM CRD1 A
ORDER BY A."CardCode", A."AdresType", A."LineNum"
