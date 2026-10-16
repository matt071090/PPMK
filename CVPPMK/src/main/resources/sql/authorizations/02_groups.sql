-- Authorization group (OUGR) dan jumlah anggota
SELECT G."GroupId", G."GroupName", G."GroupDec", G."GroupType", TO_VARCHAR(G."StartDate", 'YYYY-MM-DD') AS "StartDate",
       TO_VARCHAR(G."DueDate", 'YYYY-MM-DD') AS "DueDate", (SELECT COUNT(*) FROM USR7 X WHERE X."GroupId" = G."GroupId") AS "Members"
FROM OUGR G
ORDER BY G."GroupName"
