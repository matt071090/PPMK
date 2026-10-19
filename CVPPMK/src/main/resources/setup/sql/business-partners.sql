-- Setup E · Business Partner -> BusinessPartners (template T11), header saja (alamat, contact, branch belum dibawa).
-- Referensi bernomor dicocokkan lewat nama: _BPGroup, _PaymentTerms, _PriceList, _SalesEmployee.
SELECT C."CardCode" AS "_key", C."CardCode", C."CardName", C."CardFName" AS "CardForeignName",
       CASE C."CardType" WHEN 'S' THEN 'cSupplier' WHEN 'L' THEN 'cLid' ELSE 'cCustomer' END AS "CardType",
       G."GroupName" AS "_BPGroup", C."Currency", C."LicTradNum" AS "FederalTaxID", T."PymntGroup" AS "_PaymentTerms",
       P."ListName" AS "_PriceList", CASE WHEN C."SlpCode" = -1 THEN NULL ELSE S."SlpName" END AS "_SalesEmployee",
       C."Phone1", C."E_Mail" AS "EmailAddress", C."CreditLine" AS "CreditLimit"
FROM OCRD C
LEFT JOIN OCRG G ON G."GroupCode" = C."GroupCode"
LEFT JOIN OCTG T ON T."GroupNum" = C."GroupNum"
LEFT JOIN OPLN P ON P."ListNum" = C."ListNum"
LEFT JOIN OSLP S ON S."SlpCode" = C."SlpCode"
ORDER BY C."CardType", C."CardCode"
