-- 3.4 Business Partner, tab Contact Persons (OCPR)
SELECT P."CardCode", P."Name", P."FirstName", P."LastName", P."Position", P."Tel1", P."Cellolar", P."E_MailL", P."Active"
FROM OCPR P
ORDER BY P."CardCode", P."CntctCode"
