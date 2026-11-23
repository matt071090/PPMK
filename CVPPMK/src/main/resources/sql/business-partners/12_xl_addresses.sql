-- 3.4 Excel BP Master Data, sheet "Addresses" (CRD1). Is Default = alamat Bill To / Ship To default di header BP.
-- UDF CRD1 (mis. Kode Jenis Trx, ID TKU, NPWP) ditambahkan otomatis di akhir.
SELECT C."CardCode" AS "BP Code", C."CardName" AS "BP Name",
       CASE A."AdresType" WHEN 'B' THEN 'Pay To' WHEN 'S' THEN 'Ship To' ELSE A."AdresType" END AS "Address Type",
       A."Address" AS "Address ID", A."Address2" AS "Address Name 2", A."Address3" AS "Address Name 3", A."Street" AS "Street / PO Box",
       A."Block" AS "Block", A."City" AS "City", A."ZipCode" AS "Zip Code", A."County" AS "County", IFNULL(S."Name", A."State") AS "State",
       IFNULL(Y."Name", A."Country") AS "Country/Region", A."StreetNo" AS "Street No.", A."Building" AS "Building/Floor/Room",
       CASE WHEN (A."AdresType" = 'B' AND A."Address" = C."BillToDef") OR (A."AdresType" = 'S' AND A."Address" = C."ShipToDef") THEN 'Y' ELSE 'N' END AS "Is Default"
       /*@udf-cols CRD1 A*/
FROM CRD1 A
JOIN OCRD C ON C."CardCode" = A."CardCode"
LEFT JOIN OCST S ON S."Code" = A."State" AND S."Country" = A."Country"
LEFT JOIN OCRY Y ON Y."Code" = A."Country"
/*@udf-joins CRD1 A*/
ORDER BY C."CardCode", A."AdresType", A."LineNum"
