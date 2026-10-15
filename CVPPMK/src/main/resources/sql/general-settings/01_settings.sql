-- 1.2 General Settings: semua tab (OADM, CINF, ADM1, OADP) + nama untuk kode lookup
SELECT
  -- Business Partner
  A."CreditLimt", A."ObligLimit", A."AddDlnBlnc", A."SalesLimit", A."DlnLimit", A."OrderLimit", A."PickLimit",
  A."SlpCommUse", A."ItmCommUse", A."CrdCommUse",
  A."useDocWrf", A."EnbApprDI", A."EnbApUpDoc", A."EnbApUpDft", A."EnAuthUpt",
  A."DfCustTerm", (SELECT "PymntGroup" FROM OCTG WHERE "GroupNum" = A."DfCustTerm") AS "DfCustTermName",
  A."DfVendTerm", (SELECT "PymntGroup" FROM OCTG WHERE "GroupNum" = A."DfVendTerm") AS "DfVendTermName",
  A."UseShpdGd", A."DspFrznBP", A."AllowUpdat", C."EnbMBFilt", A."UseDfltPL", B."AsnBrnchBP",
  -- Budget
  A."DoBudget", A."BgtBlock", A."BgtWarning", A."BdgtPRQDOC", A."BdgtPORDoc", A."BdgtPDNDoc", A."BdgtAcctng",
  -- Services
  A."CheckFiles", A."DsplyRates", A."RcrFlag", A."RclFlag", A."ShowNewMsg", A."ShowNewTsk",
  A."AlertPolFr", A."ScreenLock", A."EnterAsTab",
  -- Display
  A."DateFormat", A."TimeFormat", A."DateSep", A."SumDec", A."PriceDec", A."RateDec", A."QtyDec", A."PercentDec",
  A."MeasureDec", A."QueryDec", A."DecSep", A."ThousSep", A."CurOnRight", A."DirectRate",
  -- Path
  (SELECT TOP 1 "BitmapPath" FROM OADP) AS "BitmapPath", (SELECT TOP 1 "AttachPath" FROM OADP) AS "AttachPath",
  (SELECT TOP 1 "WordPath" FROM OADP) AS "WordPath", A."ExcelPath",
  -- Inventory
  C."SriMngSys", C."BtchMngSys", A."IssuePriBy", A."SetSriUniq", A."SriUniqFld", A."BtchStatus", A."OneBOneRec",
  A."InActRpt", A."InActMkt", A."DfltWhs", (SELECT "WhsName" FROM OWHS WHERE "WhsCode" = A."DfltWhs") AS "DfltWhsName",
  A."GLMethod", A."AutoAddUoM", A."AutoAddPkg", A."DriDownBOM", A."ItmDupBCD",
  -- Resources
  A."DftResWhs", (SELECT "WhsName" FROM OWHS WHERE "WhsCode" = A."DftResWhs") AS "DftResWhsName",
  A."AutoResWhs", A."StartFrom", A."Months", A."Days",
  -- Cash Flow
  A."CfwAsnMust", A."CfwInDflt", (SELECT "CFWName" FROM OCFW WHERE "CFWId" = A."CfwInDflt") AS "CfwInName",
  A."CfwOutDflt", (SELECT "CFWName" FROM OCFW WHERE "CFWId" = A."CfwOutDflt") AS "CfwOutName",
  -- Cost Accounting
  A."UseMltDims", A."MDStyle", A."DRBlock1", A."PrjBlock",
  -- Pricing
  A."EffPriDisc",
  (SELECT COUNT(*) FROM OCTG) AS "PayTermCount"
FROM OADM A CROSS JOIN CINF C CROSS JOIN ADM1 B
