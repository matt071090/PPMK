-- 1.5 Payment Terms (Administration > Setup > Business Partners > Payment Terms)
SELECT T."GroupNum", T."PymntGroup", T."BslineDate", T."PayDuMonth", T."ExtraMonth", T."ExtraDays", T."TolDays",
       T."InstNum", T."CredLimit", T."ObligLimit", T."VolumDscnt", T."ListNum", L."ListName"
FROM OCTG T LEFT JOIN OPLN L ON L."ListNum" = T."ListNum"
ORDER BY T."ExtraDays", T."PymntGroup"
