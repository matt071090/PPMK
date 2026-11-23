// Bab 7: daftar yang DIHARAPKAN addon Farm Breeding, diambil dari kodenya (FARM_BREEDING_ADDON 1.03 + DBCreator 1.01).
// Halaman membandingkan daftar ini dengan isi DB. Ubah di sini kalau addon berubah, bukan di halaman.
// level: w = dibaca langsung di jalur utama (Statistic/Setter/Hatcher/Transfer), o = opsional / fitur tertentu.

export const PARAMS = [
  ["STATSETTERWHS", "Gudang", "w", "Kode gudang mesin Setter"],
  ["STATHATCHFINALWHS", "Gudang", "w", "Kode gudang final Hatcher"],
  ["STATHATCHDESTWHS", "Gudang", "w", "Kode gudang tujuan hasil hatch"],
  ["WHTRS", "Gudang", "w", "Kode gudang transit TO/TI"],
  ["STATEGG", "Type of Statistic", "w", "Kode TypeOfStat telur (boleh beberapa, pisah koma)"],
  ["STATDOC", "Type of Statistic", "w", "Kode TypeOfStat DOC hasil tetas"],
  ["STATRECEIVECHICK", "Type of Statistic", "w", "Kode TypeOfStat penerimaan DOC/chick"],
  ["STATFEEDPROD", "Type of Statistic", "w", "Kode TypeOfStat pakan masa Production"],
  ["STATFEEDGROW", "Type of Statistic", "w", "Kode TypeOfStat pakan masa Growth"],
  ["STATCULLCHICKGROW", "Type of Statistic", "w", "Kode TypeOfStat culling chick masa Growth"],
  ["STATCREATEAUTOGI", "Type of Statistic", "w", "Kode TypeOfStat yang memicu Goods Issue otomatis"],
  ["STATMALE", "Type of Statistic", "w", "Kode TypeOfStat afkir/culling jantan"],
  ["STATFEMALE", "Type of Statistic", "w", "Kode TypeOfStat afkir/culling betina"],
  ["STATAFKHDP", "Type of Statistic", "o", "Kode TypeOfStat afkir hidup"],
  ["STATSRSGI", "Series", "w", "Series Goods Issue otomatis dari statistik"],
  ["STATSRSGR", "Series", "w", "Series Goods Receipt otomatis dari statistik"],
  ["JESRS", "Series", "w", "Series Journal Entry otomatis"],
  ["SRSIT", "Series", "o", "Series Inventory Transfer (pemanggilan dikomentari di kode)"],
  ["ACTWIPCOMMERCIALEGG", "Akun WIP", "w", "Akun WIP telur komersial"],
  ["ACTWIPPROD", "Akun WIP", "w", "Akun WIP produksi (Transfer Growth ke Production)"],
  ["ACTWIPDAILYPROD", "Akun WIP", "o", "Akun WIP produksi harian (pemanggilan dikomentari)"],
  ["ITMHE", "Item", "w", "Kode item telur tetas (HE)"],
  ["ITMGRPCHICK", "Item", "o", "Item group DOC/anak ayam"],
  ["ITMGRPHE", "Item", "o", "Item group telur tetas"],
  ["ITMGRPNONHE", "Item", "o", "Item group telur non-tetas"],
  ["ITMGRPDOC", "Item", "o", "Item group DOC"],
  ["ITMGRPFEED", "Item", "o", "Item group pakan (dashboard)"],
  ["ITMAFKHDP", "Item", "o", "Item afkir hidup"],
  ["MAXDAYBACKDATEDSTATISTIC", "Lain-lain", "w", "Batas hari backdate Statistic, Setter, Hatcher"],
  ["REMAINLIFE", "Lain-lain", "o", "Sisa umur default (hari) untuk Plan/amortisasi WIP"],
  ["OUTSDUEDATE", "Lain-lain", "o", "Jatuh tempo outstanding Setter Out (hari)"],
  ["OUTHDUEDATE", "Lain-lain", "o", "Jatuh tempo outstanding Hatcher Out (hari)"],
  ["ALLOWZEROOUTSETTER", "Lain-lain", "o", "Izinkan qty 0 saat Setter Out"],
  ["STDALSBY", "Lain-lain", "o", "Basis analisis standar di dashboard"],
  ["PREFATSTD", "Lain-lain", "o", "Prefix penomoran dokumen Standard"],
  ["USERAUTHDUPLICATE", "Lain-lain", "o", "Otorisasi duplicate dokumen"]
];

// [nama tabel tanpa @, dibuat oleh, perlu isi data?, dibaca oleh, catatan]
export const TABLES = [
  ["ST_PARAM", "DBCreator STEM", true, "Semua modul (GetParameter)", ""],
  ["STEM_MPLAN", "DBCreator Breeding", false, "Plan", ""],
  ["STEM_MSTATISTIC", "DBCreator Breeding", false, "Statistic", ""],
  ["STEM_MSETTER", "DBCreator Breeding", false, "Setter Out", ""],
  ["STEM_MHATCHER", "DBCreator Breeding", false, "Hatcher Out", ""],
  ["STEM_MTRANSFER", "DBCreator Breeding", false, "Transfer", ""],
  ["STEM_TYPEOFSTAT", "DBCreator Breeding", true, "Statistic, Setter, Hatcher, Transfer", "Kode di sini dirujuk key STAT* di @ST_PARAM"],
  ["STEM_STATSMAP", "DBCreator Breeding", true, "Setter dan Hatcher", ""],
  ["STEM_EXPMAP", "DBCreator Breeding", true, "MarketingDocument (mapping biaya ke akun)", ""],
  ["STEM_MSTD", "DBCreator Breeding", true, "Standard performa, dashboard", ""],
  ["ST_MACHINE", "DBCreator Breeding", true, "Master mesin Setter/Hatcher", ""],
  ["STEM_WHSASGNIFLOCSH", "DBCreator STEM", true, "Warehouse Assignment", ""],
  ["STEM_MODULEIFLOCS", "DBCreator STEM", true, "Daftar modul iFlocs (AuthiFlocs)", ""],
  ["STEM_AUTHIFLOCSH", "DBCreator STEM", false, "Otorisasi iFlocs", ""],
  ["STEM_FPCONFIG", "DBCreator STEM", false, "Penomoran faktur pajak", "Hanya bila Faktur Pajak dipakai"],
  ["ST_RTYPE", "DBCreator STEM", false, "Rework", "Hanya bila Rework dipakai"],
  ["STEM_EMPWHSMAP", "(di-comment di DBCreator Breeding)", true, "Plan.vb baris 1511", "Dibaca Plan tapi tidak dibuat DBCreator. Buat manual atau un-comment"],
  ["STEM_DISRULEMAP", "(di-comment di DBCreator Breeding)", true, "DistRule.vb baris 211", "Dibaca Distribution Rule tapi tidak dibuat DBCreator. Buat manual atau un-comment"]
];

// [nama, jenis SP|FN, dibaca oleh, file definisi, level]
export const PROCS = [
  ["SBO_SP_TransactionNotification", "SP", "Semua dokumen SAP", "SP_Reference\\PPMK_Gabungan", "w"],
  ["SBO_SP_PostTransactionNotice", "SP", "IT/TO/TI (OpenQty, status TO)", "SP_Reference\\PPMK_Gabungan", "w"],
  ["STEM_Report_DailyCostPerEgg", "SP", "Statistic dan Setter/Hatcher (24 titik panggil)", "DB_BDH_FMT", "w"],
  ["STEM_HatcherOut_GetAmount", "SP", "Hatcher Out", "DB_BDH_FMT", "w"],
  ["STEM_REPORT_TRANSFER_HISTORY", "SP", "Transfer", "DB_BDH_FMT", "o"],
  ["STEM_Report_Performance", "SP", "Report Dashboard Farm", "DB_BDH_FMT\\STEM Report Performance", "o"],
  ["STEM_Report_Uniformity", "SP", "Report Dashboard Farm", "cek definisinya", "o"],
  ["STEM_REPORT_GROWTH_PHASE", "SP", "Report Dashboard Farm per Phase", "DB_BDH_FMT\\STEM Report Dashboard Farm per Phase", "o"],
  ["STEM_REPORT_PRODUCTION_PHASE", "SP", "Report Dashboard Farm per Phase", "DB_BDH_FMT\\STEM Report Dashboard Farm per Phase", "o"],
  ["STEM_REPORT_HATCHERY_PHASE", "SP", "Report Dashboard Farm per Phase", "DB_BDH_FMT\\STEM Report Dashboard Farm per Phase", "o"],
  ["STEM_REPORT_QC_PHASE", "SP", "Report Dashboard Farm per Phase", "DB_BDH_FMT\\STEM Report Dashboard Farm per Phase", "o"],
  ["STEM_Report_Sales_Per_DOC", "SP", "Report Dashboard Farm", "cek definisinya", "o"],
  ["STEM_SURVEY_UPDATESTATUS", "SP", "Survey", "DB_BDH_FMT", "o"],
  ["ST_POST_TO_PROD", "SP", "Post to Production", "DB_BDH_FMT", "o"],
  ["STEM_UnitPerformance", "FN", "Report Dashboard Farm", "cek definisinya", "o"],
  ["STEM_GET_AMOUNT_ACTUAL", "FN", "Dashboard", "Query\\FARM\\Function", "o"],
  ["STEM_GET_AMOUNT_BUDGET", "FN", "Dashboard", "Query\\FARM\\Function", "o"],
  ["STEM_TOTAL_GUARANTEE", "FN", "Dashboard", "Query\\FARM\\Function", "o"]
];

// [tabel (TableID CUFD), alias tanpa U_, fungsi]
export const UDFS = [
  ["OWHS", "STEM_Type", "Tipe gudang (WAREHOUSE/TRANSIT/TRANSIT BRANCH + kode Breeding H/T/F/O/C/S)"],
  ["OWTR", "STEM_ITTYPE", "Tipe IT: DIRECT / INTERNAL TRANSIT / INTERBRANCH (hanya DB berbranch)"],
  ["OWTR", "STEM_TOStatus", "Status TO Open/Closed untuk TI internal"],
  ["WTR1", "OpenQty", "TO Open Quantity (sisa yang belum di-TI)"],
  ["@STEM_MPLAN", "BRANCH", "Branch dokumen Plan"],
  ["@STEM_MSTATISTIC", "BRANCH", "Branch dokumen Statistic"],
  ["@STEM_MSETTER", "BRANCH", "Branch Setter Out"],
  ["@STEM_MSETTERI", "BRANCH", "Branch Setter In"],
  ["@STEM_MHATCHER", "BRANCH", "Branch Hatcher Out"],
  ["@STEM_MHATCHERI", "BRANCH", "Branch Hatcher In"],
  ["@STEM_MTRANSFER", "BRANCH", "Branch Transfer"]
];
