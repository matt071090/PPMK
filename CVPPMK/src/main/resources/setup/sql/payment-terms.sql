-- Setup B · Payment Terms -> PaymentTermsTypes (template T03). GroupNum -1 (Cash Basic) bawaan SAP ikut dibaca
-- supaya BP yang memakainya bisa dicocokkan; di tujuan juga ada, jadi statusnya "Sama" dan tidak ikut di-upload.
SELECT T."GroupNum" AS "_key", T."PymntGroup" AS "PaymentTermsGroupName", T."ExtraMonth" AS "NumberOfAdditionalMonths",
       T."ExtraDays" AS "NumberOfAdditionalDays", T."TolDays" AS "NumberOfToleranceDays", T."CredLimit" AS "CreditLimit"
FROM OCTG T
ORDER BY T."GroupNum"
