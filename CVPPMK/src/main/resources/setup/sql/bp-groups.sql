-- Setup 3.4 Business Partner Group -> Service Layer BusinessPartnerGroups.
SELECT G."GroupCode" AS "_key", G."GroupName" AS "Name",
       CASE G."GroupType" WHEN 'C' THEN 'bbpgt_CustomerGroup' WHEN 'S' THEN 'bbpgt_VendorGroup' END AS "Type"
FROM OCRG G
ORDER BY G."GroupType", G."GroupCode"
