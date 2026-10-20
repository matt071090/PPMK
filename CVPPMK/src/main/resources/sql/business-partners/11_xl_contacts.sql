-- 3.4 Excel BP Master Data, sheet "Contact Persons" (OCPR). Is Default = contact person default di header BP.
SELECT C."CardCode" AS "BP Code", C."CardName" AS "BP Name", P."Name" AS "Contact ID", P."FirstName" AS "First Name",
       P."MiddleName" AS "Middle Name", P."LastName" AS "Last Name", P."Title" AS "Title", P."Position" AS "Position",
       P."Address" AS "Address", P."Tel1" AS "Telephone 1", P."Tel2" AS "Telephone 2", P."Cellolar" AS "Mobile Phone",
       P."E_MailL" AS "E-Mail", P."Active" AS "Active", CASE WHEN P."Name" = C."CntctPrsn" THEN 'Y' ELSE 'N' END AS "Is Default"
FROM OCPR P
JOIN OCRD C ON C."CardCode" = P."CardCode"
ORDER BY C."CardCode", P."CntctCode"
