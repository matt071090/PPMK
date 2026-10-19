-- Setup D · Posting Period (bandingkan saja; dibuat lewat CompanyService_CreatePeriodWithFinanceParams, upload menyusul)
SELECT P."Code" AS "_key", P."Code", P."Name", P."Category", TO_VARCHAR(P."F_RefDate", 'YYYY-MM-DD') AS "FromDate",
       TO_VARCHAR(P."T_RefDate", 'YYYY-MM-DD') AS "ToDate", P."Indicator"
FROM OFPR P
ORDER BY P."F_RefDate"
