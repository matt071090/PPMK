-- Setup 3.4 Shipping Type -> Service Layer ShippingTypes.
SELECT S."TrnspCode" AS "_key", S."TrnspName" AS "Name", S."WebSite" AS "Website"
FROM OSHP S
ORDER BY S."TrnspCode"
