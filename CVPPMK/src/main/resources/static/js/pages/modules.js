// Bab 2-5: Keuangan, Master Data, Kontrol Dokumen, Add-on & Kustomisasi.
// Diambil dari pola blueprint modul (01.02-08.01): hanya bagian yang bisa dibaca dari database, narasi proses tetap di Word.
import { esc, val, badgeYN, coded, rowsOf, isEmpty, section, kv, settings, table, searchable, VALUATION } from "../ui.js";

const one = r => rowsOf(r)[0] || {};
const num = v => isEmpty(v) ? val(v) : esc((+v).toLocaleString("id-ID"));
const codedCell = map => v => coded(map, v);
const kpis = list => `<div class="kpis">${list.map(([n, l]) => `<div class="kpi"><b>${typeof n === "number" ? n.toLocaleString("id-ID") : esc(n)}</b><span>${esc(l)}</span></div>`).join("")}</div>`;

// Kode akun -> "kode · nama", nama diambil dari daftar akun yang ikut dimuat di halaman.
const acctNames = d => Object.fromEntries(rowsOf(d.names || d.accounts).map(a => [a.AcctCode, a.AcctName]));
const acctLabel = (names, code) => isEmpty(code) ? null : names[code] ? `${code} · ${names[code]}` : code;

const DRAWER = { 1: "Assets", 2: "Liabilities", 3: "Capital & Reserves", 4: "Turnover", 5: "Cost of Sales", 6: "Operating Costs",
  7: "Non-Operating Income & Expenditure", 8: "Taxation & Extraordinary Items" };
const ACT_TYPE = { N: "Other", I: "Sales", E: "Expenditure" };
const ASSET_TYPE = { G: "General", L: "Low-Value Asset" };
const DPR_METH = { SL: "Straight Line", SP: "Straight Line Period Control", DB: "Declining Balance", MD: "Multilevel",
  NO: "No Depreciation", IW: "Immediate Write-Off", SD: "Special Depreciation" };
const PLANNING = { N: "None", M: "MRP" };
const PROCURE = { B: "Buy", M: "Make" };
const BP_TYPE = { C: "Customer", S: "Vendor" };
const ALERT_TYPE = { S: "System", U: "User-Defined" };
const FREQ = { H: "Jam", D: "Hari", W: "Minggu", M: "Bulan", N: "Menit" };
const LAYOUT_CAT = { P: "PLD", C: "Crystal Reports" };
const UDO_TYPE = { 1: "Master Data", 3: "Document" };
const UDT_TYPE = { 0: "No Object", 1: "Master Data", 2: "Master Data Rows", 3: "Document", 4: "Document Rows", 5: "No Object (Auto Increment)" };
const UDF_TYPE = { A: "Alphanumeric", N: "Numeric", D: "Date/Time", B: "Units & Totals", M: "Text" };

// Nama tabel SAP yang paling sering punya UDF, supaya kode tabel lebih mudah dibaca.
const TABLE_NAMES = {
  OITM: "Item", OCRD: "Business Partner", CRD1: "BP Address", OCPR: "BP Contact", OWHS: "Warehouse", OITB: "Item Group",
  OACT: "G/L Account", OJDT: "Journal Entry", JDT1: "Journal Entry Rows", OADM: "Company Details", OBPL: "Branch",
  OQUT: "Sales Quotation", QUT1: "Sales Quotation Rows", ORDR: "Sales Order", RDR1: "Sales Order Rows", ODLN: "Delivery", DLN1: "Delivery Rows",
  ORDN: "Return", RDN1: "Return Rows", OINV: "A/R Invoice", INV1: "A/R Invoice Rows", ORIN: "A/R Credit Memo", RIN1: "A/R Credit Memo Rows",
  ODPI: "A/R Down Payment", DPI1: "A/R Down Payment Rows", OPRQ: "Purchase Request", PRQ1: "Purchase Request Rows",
  OPOR: "Purchase Order", POR1: "Purchase Order Rows", OPDN: "Goods Receipt PO", PDN1: "Goods Receipt PO Rows", ORPD: "Goods Return", RPD1: "Goods Return Rows",
  OPCH: "A/P Invoice", PCH1: "A/P Invoice Rows", ORPC: "A/P Credit Memo", RPC1: "A/P Credit Memo Rows", ODPO: "A/P Down Payment", DPO1: "A/P Down Payment Rows",
  OIGN: "Goods Receipt", IGN1: "Goods Receipt Rows", OIGE: "Goods Issue", IGE1: "Goods Issue Rows", OWTR: "Inventory Transfer", WTR1: "Inventory Transfer Rows",
  OWTQ: "Inventory Transfer Request", WTQ1: "Inventory Transfer Request Rows", OWOR: "Production Order", WOR1: "Production Order Rows",
  OITT: "Bill of Materials", ITT1: "BOM Rows", ORCT: "Incoming Payment", OVPM: "Outgoing Payment", ODRF: "Draft", DRF1: "Draft Rows",
  OBTN: "Batch", OSRN: "Serial Number", OUSR: "User", OHEM: "Employee", OPRC: "Cost Center", OOCR: "Distribution Rule"
};
const tableLabel = id => TABLE_NAMES[id] ? `${esc(id)}<span class="raw">${esc(TABLE_NAMES[id])}</span>` : esc(id);

// 2.2 Akun default per kategori periode (Service Layer PeriodCategory). Field yang namanya tidak jelas sengaja tidak diambil.
const GL_DEFAULTS = [
  { group: "Sales" },
  ["Domestic Accounts Receivable", "DebitorsFollowUpAccount"], ["Foreign Accounts Receivable", "ForeignAccountsReceivables"],
  ["Revenue Account", "DefaultSaleAccount"], ["Sales Credit Account", "SalesCreditAcc"],
  ["Down Payment Clearing Account", "DownPaymentSClearingAcct"], ["Overpayment A/R Account", "OverpaymentsARAccount"],
  ["Underpayment A/R Account", "UnderpaymentsARAccount"], ["Realized Exchange Diff. Gain", "ARGainRealizedExchngeDif"],
  ["Realized Exchange Diff. Loss", "ARLossRealizedExchangeDi"],
  { group: "Purchasing" },
  ["Domestic Accounts Payable", "CreditorsFollowUpAccount"], ["Allocation Account (GRPO clearing)", "AllocationAcc"],
  ["Goods Clearing Account", "GoodsClearingAcc"], ["Expense Clearing Account", "ExpenseClearingAccount"],
  ["Price Difference Account", "PriceDifferenceAccount"], ["Expense Variance Account", "ExpenseVarianceAccount"],
  ["Down Payment Clearing Account", "DownPaymentPClearingAcct"], ["Overpayment A/P Account", "OverpaymentsAPAccount"],
  ["Underpayment A/P Account", "UnderpaymentsAPAccount"], ["Realized Exchange Diff. Gain", "APGainRealizedExchngeDif"],
  ["Realized Exchange Diff. Loss", "APLossRealizedExchangeDif"],
  { group: "Inventory (default, dipakai kalau warehouse tidak mengisi)" },
  ["Inventory Account", "StockAccount"], ["Cost of Goods Sold", "CostOfGoodsSold"], ["Sales Returns Account", "SalesReturns"], ["Inventory Offset - Increase", "InventoryOffsetIncrease"],
  ["Inventory Offset - Decrease", "InventoryOffsetDecrease"], ["Increase G/L Account", "IncreaseGLAccount"], ["Decrease G/L Account", "DecreaseGLAcc"],
  ["WIP Inventory Account", "WIPMaterialAccount"], ["WIP Inventory Variance Account", "WIPMaterialVarianceAccount"],
  { group: "General" },
  ["Rounding Account", "RoundingAccount"], ["Exchange Rate Differences", "ExchangeRateDifferencesAcct"],
  ["Period-End Closing Account", "EOYControlAccount"]
];
// Akun persediaan per warehouse (OWHS), urutan sesuai tab Accounting di master warehouse.
const WHS_ACCTS = [["BalInvntAc", "Inventory"], ["SaleCostAc", "COGS"], ["TransferAc", "Allocation"], ["VarianceAc", "Variance"],
  ["PriceDifAc", "Price Diff."], ["DecreasAc", "Decrease"], ["IncreasAc", "Increase"], ["ReturnAc", "Returns"],
  ["RevenuesAc", "Revenue"], ["StkInTnAct", "Stock in Transit"], ["WipAcct", "WIP"]];

export const PAGES = {
  // ================= 2. Keuangan =================
  "coa": {
    lead: "Struktur akun perusahaan: drawer, akun judul (title), dan akun posting. Akun control dan akun kas ditandai.",
    menu: "Financials › Chart of Accounts",
    tables: ["OACT"],
    checks(d) {
      const a = rowsOf(d.accounts).filter(x => x.Postable === "Y"), out = [];
      const frozen = a.filter(x => x.FrozenFor === "Y").length;
      if (frozen) out.push(["info", `${frozen} akun posting berstatus Inactive/Frozen.`]);
      return out;
    },
    render(d) {
      const accts = rowsOf(d.accounts), post = accts.filter(a => a.Postable === "Y");
      const byDrawer = Object.entries(DRAWER).map(([k, name]) => [name, post.filter(a => a.GroupMask === k).length]);
      const rows = accts.map(a => ({ ...a, Drawer: DRAWER[a.GroupMask] || a.GroupMask }));
      return kpis([[accts.length, "Total akun"], [post.length, "Akun posting"], [accts.length - post.length, "Akun judul"],
          [post.filter(a => a.LocManTran === "Y").length, "Control account"], [post.filter(a => a.Finanse === "Y").length, "Akun kas"]])
        + section("drawers", "Akun Posting per Drawer", table([{ key: 0, label: "Drawer" }, { key: 1, label: "Akun posting", num: 1 }],
            byDrawer.map(([n, c]) => ({ 0: n, 1: c }))), { no: "2.1.1" })
        + section("accounts", "Daftar Akun", searchable("coa-t", [
            { key: "AcctCode", label: "Kode", fmt: (v, r) => `<span style="padding-left:${(Math.max(+r.Levels, 1) - 1) * 14}px">${r.Postable === "Y" ? esc(v) : `<b>${esc(v)}</b>`}</span>` },
            { key: "AcctName", label: "Nama", fmt: (v, r) => r.Postable === "Y" ? esc(v) : `<b>${esc(v)}</b>` },
            { key: "Levels", label: "Level", num: 1 }, { key: "Postable", label: "Posting", fmt: badgeYN },
            { key: "ActType", label: "Tipe", fmt: codedCell(ACT_TYPE) }, { key: "ActCurr", label: "Mata uang", fmt: v => v === "##" ? "Semua" : val(v) },
            { key: "LocManTran", label: "Control", fmt: v => v === "Y" ? `<span class="badge info">Control</span>` : "" },
            { key: "Finanse", label: "Kas", fmt: v => v === "Y" ? `<span class="badge yes">Kas</span>` : "" }],
            rows, { filterKey: "Drawer", filterLabel: "drawer" }),
          { no: "2.1.2", lead: "Huruf tebal = akun judul (tidak bisa diposting). Indentasi mengikuti level akun." });
    }
  },

  "gl-determination": {
    sl: "period-category", withSql: true,
    lead: "Akun G/L yang otomatis dipakai SAP saat transaksi diposting. Ini yang menentukan jurnal dari setiap dokumen.",
    menu: "Administration › Setup › Financials › G/L Account Determination · Inventory › Warehouses (tab Accounting)",
    tables: ["Service Layer: PeriodCategory", "OWHS", "OACT"],
    checks(d) {
      const whs = rowsOf(d.warehouses).filter(w => w.Inactive !== "Y");
      const noInv = whs.filter(w => isEmpty(w.BalInvntAc)).map(w => w.WhsCode);
      return noInv.length ? [["warn", `Warehouse aktif tanpa Inventory Account: ${noInv.join(", ")}.`]] : [];
    },
    render(d) {
      const names = acctNames(d), p = one(d.sl);
      const rows = GL_DEFAULTS.map(r => Array.isArray(r)
        ? { label: r[0], col: `PeriodCategory.${r[1]}`, sub: 1, fmt: x => acctLabel(names, x[r[1]]) } : r);
      // Pola akun yang sama dipakai banyak warehouse: tampilkan per pola supaya ringkas.
      const whs = rowsOf(d.warehouses), patterns = new Map();
      whs.forEach(w => { const k = WHS_ACCTS.map(([c]) => w[c] || "").join("|"); (patterns.get(k) || patterns.set(k, []).get(k)).push(w); });
      const pats = [...patterns.values()].sort((a, b) => b.length - a.length);
      return section("defaults", `Akun Default · Periode ${esc(p.PeriodCategory || "")}`, settings(rows, p, "gl", { emptyText: "None" }),
          { no: "2.2.1", lead: "Dibaca lewat Service Layer dari posting period tahun berjalan. Setiap tahun periode menyimpan salinan akun ini sendiri." })
        + section("warehouses", "Akun Persediaan per Warehouse", `
          <p class="sec-lead">Setting <b>Set Inventory Method By = Warehouse</b> (1.2 General Settings), jadi akun persediaan diambil dari master warehouse.
            ${whs.length} warehouse memakai ${pats.length} pola akun berbeda.</p>
          ${pats.map((list, i) => section(`pola-${i + 1}`, `Pola ${i + 1} · ${list.length} warehouse`,
            `<p class="sec-lead">${list.map(w => esc(w.WhsCode)).join(", ")}</p>`
            + kv(WHS_ACCTS.map(([c, label]) => [label, val(acctLabel(names, list[0][c]))])), { level: 3 })).join("")}`,
          { no: "2.2.2" });
    }
  },

  "fixed-asset": {
    lead: "Kelas aset tetap dan tipe penyusutan yang dipakai saat membuat master aset.",
    menu: "Administration › Setup › Fixed Assets › Asset Classes · Depreciation Types",
    tables: ["OACS", "ACS1", "ODTP"],
    render(d) {
      return section("classes", "Asset Class", table([{ key: "Code", label: "Kode" }, { key: "Name", label: "Nama" },
          { key: "AssetType", label: "Asset Type", fmt: codedCell(ASSET_TYPE) }, { key: "DprAreaID", label: "Depreciation Area" },
          { key: "AcctDtn", label: "Account Determination" }, { key: "DprTypID", label: "Depreciation Type" },
          { key: "UseLife", label: "Masa manfaat (bulan)", num: 1 }, { key: "Active", label: "Aktif", fmt: badgeYN }], rowsOf(d.classes)),
          { no: "2.3.1", lead: "Satu kelas bisa punya beberapa depreciation area (mis. komersial dan fiskal)." })
        + section("dep-types", "Depreciation Type", table([{ key: "Code", label: "Kode" }, { key: "Descr", label: "Deskripsi" },
          { key: "DprMeth", label: "Metode", fmt: codedCell(DPR_METH) }, { key: "PerAcq", label: "Periode akuisisi" },
          { key: "PerRet", label: "Periode retirement" }], rowsOf(d.dep_types)), { no: "2.3.2" });
    }
  },

  // ================= 3. Master Data =================
  "item-groups": {
    lead: "Pengelompokan item. Menentukan metode valuasi, perencanaan (MRP), dan cara pengadaan default item baru.",
    menu: "Administration › Setup › Inventory › Item Groups",
    tables: ["OITB", "OITM"],
    render: d => section("groups", "Daftar Item Group", table([{ key: "ItmsGrpCod", label: "Kode", num: 1 }, { key: "ItmsGrpNam", label: "Nama" },
      { key: "InvntSys", label: "Valuation Method", fmt: codedCell(VALUATION) }, { key: "PlaningSys", label: "Planning", fmt: codedCell(PLANNING) },
      { key: "PrcrmntMtd", label: "Procurement", fmt: codedCell(PROCURE) }, { key: "ItemCount", label: "Jumlah item", num: 1 }], rowsOf(d.groups)),
      { lead: "Akun persediaan tidak diambil dari item group, karena inventory method di-set per warehouse (lihat 2.2)." })
  },

  "bp-groups": {
    lead: "Pengelompokan customer dan vendor, beserta price list default-nya.",
    menu: "Administration › Setup › Business Partners › Customer Groups / Vendor Groups",
    tables: ["OCRG", "OPLN", "OCRD"],
    render(d) {
      const g = rowsOf(d.groups), cols = [{ key: "GroupCode", label: "Kode", num: 1 }, { key: "GroupName", label: "Nama" },
        { key: "PriceListName", label: "Price List" }, { key: "BpCount", label: "Jumlah BP", num: 1 }, { key: "Locked", label: "Dikunci", fmt: badgeYN }];
      return Object.entries(BP_TYPE).map(([t, name]) => section(`grp-${t}`, `${name} Group`, table(cols, g.filter(x => x.GroupType === t)))).join("");
    }
  },

  "price-lists": {
    lead: "Daftar harga. Price list bisa diturunkan dari price list lain dengan faktor pengali.",
    menu: "Inventory › Price Lists › Price Lists",
    tables: ["OPLN"],
    checks(d) {
      const cur = [...new Set(rowsOf(d.lists).map(l => l.PrimCurr).filter(c => c && c !== "IDR"))];
      return cur.length ? [["warn", `Price list memakai mata uang ${cur.join(", ")}, padahal mata uang lokal IDR. Kemungkinan sisa template lokalisasi.`]] : [];
    },
    render: d => section("lists", "Daftar Price List", table([{ key: "ListNum", label: "No", num: 1 }, { key: "ListName", label: "Nama" },
      { key: "BaseName", label: "Base Price List" }, { key: "Factor", label: "Faktor", num: 1, fmt: v => isEmpty(v) ? val(v) : esc(String(+v)) },
      { key: "PrimCurr", label: "Mata uang" }, { key: "IsGrossPrc", label: "Gross price", fmt: badgeYN }, { key: "ValidFor", label: "Aktif", fmt: badgeYN }],
      rowsOf(d.lists)))
  },

  "master-summary": {
    lead: "Jumlah master data utama yang sudah ada di database. Berguna untuk memantau progres data migration.",
    menu: "—",
    tables: ["OITM", "OCRD", "OITT", "ORSC", "ORST", "OHEM"],
    checks(d) {
      const empty = rowsOf(d.counts).filter(c => +c.Jumlah === 0 && ["Item", "Customer", "Vendor"].includes(c.Objek)).map(c => c.Objek);
      return empty.length ? [["info", `Master data belum di-load: ${empty.join(", ")}.`]] : [];
    },
    render: d => section("counts", "Status Master Data", table([{ key: "Objek", label: "Objek" }, { key: "Tabel", label: "Tabel", fmt: v => `<code>${esc(v)}</code>` },
      { key: "Jumlah", label: "Jumlah", num: 1, fmt: num }], rowsOf(d.counts)))
  },

  // ================= 4. Kontrol Dokumen =================
  "approval": {
    lead: "Dokumen yang harus disetujui sebelum diposting: siapa yang membuat (originator), tahap persetujuan, dan dokumen yang dicakup.",
    menu: "Administration › Approval Procedures › Approval Stages · Approval Templates",
    tables: ["OWTM", "WTM1", "WTM2", "WTM3", "OWST"],
    checks: d => rowsOf(d.templates).length ? [] : [["warn", "Belum ada approval template. Di blueprint referensi, PO, PR, SO, dan dokumen inventory memakai approval. Pastikan memang tidak diperlukan di CVPPMK."]],
    render: d => section("templates", "Approval Template", table([{ key: "Name", label: "Nama" }, { key: "Docs", label: "Dokumen (kode objek)" },
        { key: "Originators", label: "Originator" }, { key: "Stages", label: "Tahap" }, { key: "Active", label: "Aktif", fmt: badgeYN }], rowsOf(d.templates)))
      + section("stages", "Approval Stage", table([{ key: "Name", label: "Nama" }, { key: "MaxReqr", label: "Jumlah approval dibutuhkan", num: 1 },
        { key: "MaxRejReqr", label: "Jumlah reject", num: 1 }, { key: "Remarks", label: "Keterangan" }], rowsOf(d.stages)))
  },

  "alerts": {
    lead: "Notifikasi otomatis ke user, dari sistem SAP atau dari saved query.",
    menu: "Administration › Alerts Management",
    tables: ["OALT", "ALT1", "OUQR"],
    render: d => section("alerts", "Daftar Alert", table([{ key: "Name", label: "Nama" }, { key: "Type", label: "Tipe", fmt: codedCell(ALERT_TYPE) },
      { key: "QName", label: "Query" }, { key: "Active", label: "Aktif", fmt: badgeYN },
      { key: "FrqncyIntr", label: "Frekuensi", fmt: (v, r) => isEmpty(v) ? val(v) : `tiap ${esc(v)} ${esc(FREQ[r.FrqncyType] || r.FrqncyType)}` },
      { key: "Recipients", label: "Penerima", num: 1 }], rowsOf(d.alerts)))
  },

  "layouts": {
    lead: "Layout cetak dokumen (PLD dan Crystal Reports) yang terdaftar di SAP.",
    menu: "Administration › Setup › General › Print Layout Designer · Report and Layout Manager",
    tables: ["RDOC"],
    checks: d => rowsOf(d.custom).length ? [] : [["info", "Semua layout di database adalah bawaan SAP. Layout custom (mis. \"STEM - Purchase Order\") belum di-import."]],
    render: d => section("summary", "Ringkasan", table([{ key: "Category", label: "Jenis", fmt: codedCell(LAYOUT_CAT) }, { key: "Author", label: "Pembuat" },
        { key: "Jumlah", label: "Jumlah", num: 1, fmt: num }], rowsOf(d.summary)))
      + section("custom", "Layout Custom", table([{ key: "DocName", label: "Nama" }, { key: "TypeCode", label: "Dokumen" },
        { key: "Category", label: "Jenis", fmt: codedCell(LAYOUT_CAT) }, { key: "Author", label: "Pembuat" }], rowsOf(d.custom)))
  },

  "sp-validation": {
    lead: "Stored procedure SAP yang dijalankan setiap kali dokumen disimpan. Dipakai untuk validasi bisnis (mis. qty GRPO melebihi toleransi PO).",
    menu: "Database HANA › Procedures",
    tables: ["SYS.PROCEDURES"],
    checks(d) {
      const tn = rowsOf(d.procs).find(p => p.Name === "SBO_SP_TRANSACTIONNOTIFICATION");
      if (!tn) return [["warn", "SBO_SP_TransactionNotification tidak ditemukan."]];
      return +tn.Len < 1500 ? [["warn", "SBO_SP_TransactionNotification masih template bawaan SAP, belum ada validasi. Di blueprint referensi ada validasi PO/GRPO/cost center di sini."]] : [];
    },
    render(d) {
      const procs = rowsOf(d.procs);
      return procs.map(p => section(p.Name.toLowerCase(), p.Name, `<p class="sec-lead">${num(p.Len)} karakter.</p>
        <details class="grp"><summary><span>Lihat isi procedure</span></summary>
        <pre class="proc-src" style="margin:0;padding:14px;overflow:auto;max-height:420px;font-size:12.5px;border-top:1px solid var(--border)">${esc(p.Definition)}</pre></details>`)).join("");
    }
  },

  // ================= 5. Add-on & Kustomisasi STEM =================
  "udo": {
    lead: "Objek buatan sendiri (add-on STEM) yang punya layar dan tabel sendiri di SAP, mis. Shopfloor, Rework, QC, iFlocs.",
    menu: "Tools › Customization Tools › Object Registration Wizard",
    tables: ["OUDO", "UDO1"],
    render(d) {
      const u = rowsOf(d.udo);
      return kpis([[u.length, "UDO"], [u.filter(x => x.TYPE === "3").length, "Tipe Document"], [u.filter(x => x.TYPE === "1").length, "Tipe Master Data"]])
        + section("list", "Daftar UDO", searchable("udo-t", [{ key: "Code", label: "Kode" }, { key: "Name", label: "Nama" },
          { key: "TYPE", label: "Tipe", fmt: codedCell(UDO_TYPE) }, { key: "TableName", label: "Tabel header", fmt: v => `<code>@${esc(v)}</code>` },
          { key: "ChildTables", label: "Tabel baris", fmt: v => isEmpty(v) ? "" : v.split(", ").map(t => `<code>@${esc(t)}</code>`).join(" ") },
          { key: "MngSeries", label: "Series", fmt: badgeYN }, { key: "CanCancel", label: "Cancel", fmt: badgeYN }, { key: "CanLog", label: "Log", fmt: badgeYN }], u));
    }
  },

  "udt": {
    lead: "Tabel buatan sendiri. Sebagian dipakai UDO (header/baris), sebagian berdiri sendiri sebagai master atau parameter add-on.",
    menu: "Tools › Customization Tools › User-Defined Tables - Setup",
    tables: ["OUTB", "CUFD", "OUDO", "UDO1"],
    render(d) {
      const t = rowsOf(d.udt).map(x => ({ ...x, Pemakai: x.UdoCode ? `UDO ${x.UdoCode}` : x.UdoChildOf ? `UDO ${x.UdoChildOf} (baris)` : "" }));
      return section("list", "Daftar UDT", searchable("udt-t", [{ key: "TableName", label: "Tabel", fmt: v => `<code>@${esc(v)}</code>` },
        { key: "Descr", label: "Deskripsi" }, { key: "ObjectType", label: "Tipe", fmt: codedCell(UDT_TYPE) },
        { key: "FieldCount", label: "Jumlah field", num: 1 }, { key: "Pemakai", label: "Dipakai oleh" }], t));
    }
  },

  "udf": {
    lead: "Field tambahan (prefix U_) di tabel standar SAP, mis. U_STEM_IDTKU di Company Details.",
    menu: "Tools › Customization Tools › User-Defined Fields - Management",
    tables: ["CUFD"],
    render(d) {
      const byTable = rowsOf(d.by_table), fields = rowsOf(d.fields);
      return kpis([[fields.length, "UDF"], [byTable.length, "Tabel standar"]])
        + section("by-table", "Jumlah UDF per Tabel", searchable("udf-tbl", [{ key: "TableID", label: "Tabel", fmt: tableLabel },
            { key: "Fields", label: "Jumlah UDF", num: 1 }], byTable), { lead: "Tabel arsip (A…) yang hanya salinan UDF tabel lain tidak dihitung." })
        + section("fields", "Daftar UDF", searchable("udf-t", [{ key: "TableID", label: "Tabel", fmt: tableLabel }, { key: "Field", label: "Field" },
            { key: "Descr", label: "Deskripsi" }, { key: "TypeID", label: "Tipe", fmt: codedCell(UDF_TYPE) }, { key: "SizeID", label: "Panjang", num: 1 },
            { key: "Dflt", label: "Default" }, { key: "NotNull", label: "Wajib", fmt: badgeYN },
            { key: "RTable", label: "Link ke", fmt: (v, r) => v ? `<code>@${esc(v)}</code>` : r.RelUDO ? `UDO ${esc(r.RelUDO)}` : "" }],
            fields, { filterKey: "TableID", filterLabel: "tabel", limit: 300 }));
    }
  },

  "saved-queries": {
    lead: "Query yang tersimpan di Query Manager: laporan, sumber formatted search, alert, dan KPI.",
    menu: "Tools › Queries › Query Manager",
    tables: ["OUQR", "OQCN"],
    render(d) {
      const cats = rowsOf(d.categories), q = rowsOf(d.queries);
      return section("categories", "Kategori", table([{ key: "CatName", label: "Kategori" }, { key: "QueryCount", label: "Jumlah query", num: 1 }],
          cats.filter(c => +c.QueryCount > 0)), { lead: "Kategori tanpa query tidak ditampilkan." })
        + section("queries", "Daftar Query", searchable("q-t", [{ key: "CatName", label: "Kategori" }, { key: "QName", label: "Nama query" },
          { key: "Len", label: "Panjang (karakter)", num: 1, fmt: num }, { key: "LastRun", label: "Terakhir dijalankan" }], q,
          { filterKey: "CatName", filterLabel: "kategori" }));
    }
  }
};
