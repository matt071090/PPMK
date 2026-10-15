-- 4.1 Approval Template (Administration > Approval Procedures > Approval Templates)
SELECT T."WtmCode", T."Name", T."Active", T."Remarks",
       (SELECT STRING_AGG(D."TransType", ', ') FROM WTM3 D WHERE D."WtmCode" = T."WtmCode") AS "Docs",
       (SELECT STRING_AGG(U."USER_CODE", ', ') FROM WTM1 O JOIN OUSR U ON U."USERID" = O."UserID" WHERE O."WtmCode" = T."WtmCode") AS "Originators",
       (SELECT STRING_AGG(S."Name", ' → ' ORDER BY X."SortId") FROM WTM2 X JOIN OWST S ON S."WstCode" = X."WstCode" WHERE X."WtmCode" = T."WtmCode") AS "Stages"
FROM OWTM T ORDER BY T."WtmCode"
