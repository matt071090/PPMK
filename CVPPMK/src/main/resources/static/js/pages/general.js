// Bab 1: General Parameter. Urutan dan nomor mengikuti blueprint "01.01 General Parameters".
import {
  $, $$, esc, val, YN, badgeYN, coded, rowsOf, isEmpty, onMount, section, kv, settings, table, searchable, tags, udfCols, hasUdf, exportSheets, sqlSheets,
  VALUATION, GL_METHOD, DATE_FMT, TIME_FMT, PERIOD_STAT, OBJECTS, sapVersion
} from "../ui.js";

const one = r => rowsOf(r)[0] || {};
const isSystemCc = c => /^Centr_z\d*$/.test(c.PrcCode); // General Center bawaan SAP per dimension
const codedCell = map => v => coded(map, v);
const num = v => isEmpty(v) ? val(v) : esc(String(+v));
const acct = (code, name) => (v, r) => isEmpty(v) ? val(v) : `${esc(v)}${r[name] ? `<span class="raw">${esc(r[name])}</span>` : ""}`;
const slYN = key => d => ({ tYES: "Y", tNO: "N" }[d[key]] ?? d[key]); // enum Service Layer -> Y/N

const BASELINE = { P: "Posting Date", T: "Document Date", S: "System Date" };
const TAX_CAT = { I: "Input Tax", O: "Output Tax" };
const WHT_CAT = { I: "Invoice", P: "Payment" };
const WHT_BASE = { N: "Net", G: "Gross", V: "VAT" };
const FREIGHT_DIST = { N: "None", Q: "Quantity", V: "Volume", W: "Weight", E: "Equally", T: "Row Total" };
const LC_ALLOC = { F: "Cash Value Before Customs", A: "Cash Value After Customs", Q: "Quantity", W: "Weight", V: "Volume", E: "Equal" };
const PAY_TYPE = { I: "Incoming", O: "Outgoing" };

// 1.3 Document Settings: dibaca dari Service Layer (AdminInfo), nama field-nya jelas sehingga tidak perlu tebak kolom DB.
const DOC_SETTINGS = [
  { label: "Calculate Gross Profit", col: "SL.CalculateGrossProfitperTra", type: "yn", fmt: slYN("CalculateGrossProfitperTra") },
  { label: "Base Price Origin", col: "SL.PriceListforCostPrice", verify: 1, fmt: d => isEmpty(d.PriceListforCostPrice) ? null : `kode ${d.PriceListforCostPrice}` },
  { label: "Default Gross Profit % for Service Document", col: "SL.GrossProfitPercentForServiceDocuments" },
  { label: "Block Negative Inventory", col: "SL.BlockStockNegativeQuantity", type: "yn", fmt: slYN("BlockStockNegativeQuantity") },
  { label: "Display Rounding Remark", col: "SL.DisplayRoundingRemark", type: "yn", fmt: slYN("DisplayRoundingRemark") },
  { label: "Use Warehouse Address", col: "SL.AdressFromWH", type: "yn", fmt: slYN("AdressFromWH") },
  { label: "Allow Future Posting Date", col: "SL.AllowFuturePostingDate", type: "yn", fmt: slYN("AllowFuturePostingDate") },
  { label: "Use Document Exchange Rate When Copying to Target Document", col: "SL.CopyExchangeRateInCopyTo", type: "yn", fmt: slYN("CopyExchangeRateInCopyTo") },
  { group: "Attachments" },
  { label: "Copy Attachments from Base Document to Target Document", col: "SL.CopyAttachmentsFromBaseToTarget", type: "yn", sub: 1, fmt: slYN("CopyAttachmentsFromBaseToTarget") },
  { label: "Copy Attachments from BOM to Production Order", col: "SL.CopyAttachmentsFromBOM", type: "yn", sub: 1, fmt: slYN("CopyAttachmentsFromBOM") },
  { label: "Do Not Overwrite Attachments with the Same File Name", col: "SL.DontOverwriteAtcWithSameName", type: "yn", sub: 1, fmt: slYN("DontOverwriteAtcWithSameName") },
  { group: "Pembatalan dokumen" },
  { label: "Display Canceled and Cancelation Marketing Documents in Reports", col: "SL.DisplayCancelDocInReport", type: "yn", sub: 1, fmt: slYN("DisplayCancelDocInReport") },
  { label: "Max. No. of Days for Canceling Marketing Documents", col: "SL.MaxDaysForCancel", sub: 1,
    fmt: d => +d.MaxDaysForCancel === 0 ? "0 (tanpa batas)" : d.MaxDaysForCancel }
];

// 1.10 Remarks: catatan project (bukan dari database). Diedit lewat Mode edit dan disimpan di review.json (key "remarks").
// Isi di bawah hanya data awal, dipakai selama review.json belum punya remarks.
const REMARKS_SEED = {
  facts: [{ label: "Go Live", value: "" }, { label: "Cut Off Beginning Balance", value: "" }],
  questions: [
    "Arti kode tipe warehouse O, F, T (UDF U_STEM_TYPE).",
    "Series AR Invoice T-ARIN34 & T-ARIN36: range sama (341000001–341999999) dan remark \"Non-R\" di branch Trading. Salah setup?",
    "Perlu tidaknya UoM Group (saat ini hanya UoM \"Manual\").",
    "Status periode 2029–2040: dibiarkan Unlocked atau dikunci (Locked)?"
  ].map(q => ({ q, a: "" })),
  notes: ""
};
const remarksOf = review => review.remarks || JSON.parse(JSON.stringify(REMARKS_SEED));

function renderRemarks(r, editing) {
  if (editing) {
    const del = (list, i) => `<button type="button" class="cbtn" data-act="r-del" data-list="${list}" data-i="${i}" aria-label="Hapus">Hapus</button>`;
    const add = (list, lbl) => `<button type="button" class="cbtn" data-act="r-add" data-list="${list}">+ ${lbl}</button>`;
    return `<form id="remarks-form" class="remarks-form" onsubmit="return false">`
      + section("facts", "Tanggal Penting", `${r.facts.map((f, i) => `<div class="r-row" data-list="facts">
          <input type="text" name="label" value="${esc(f.label)}" placeholder="Nama, mis. Go Live" aria-label="Nama">
          <input type="text" name="value" value="${esc(f.value)}" placeholder="Tanggal / isi, mis. 1 Januari 2027" aria-label="Isi">${del("facts", i)}</div>`).join("")}
        ${add("facts", "Tambah baris")}`)
      + section("questions", "Pertanyaan Terbuka", `${r.questions.map((x, i) => `<div class="r-row q" data-list="questions">
          <textarea name="q" rows="2" placeholder="Pertanyaan" aria-label="Pertanyaan">${esc(x.q)}</textarea>
          <textarea name="a" rows="2" placeholder="Jawaban / keputusan (kosong = masih terbuka)" aria-label="Jawaban">${esc(x.a)}</textarea>${del("questions", i)}</div>`).join("")}
        ${add("questions", "Tambah pertanyaan")}`, { lead: "Pertanyaan yang sudah diisi jawabannya otomatis pindah ke bagian \"Sudah Terjawab\"." })
      + section("notes", "Catatan Lain", `<textarea name="notes" rows="5" class="r-notes" placeholder="Catatan bebas" aria-label="Catatan lain">${esc(r.notes)}</textarea>`)
      + `</form>`;
  }
  const open = r.questions.filter(x => x.q && !x.a), done = r.questions.filter(x => x.q && x.a);
  return section("facts", "Tanggal Penting", kv(r.facts.filter(f => f.label).map(f => [f.label, val(f.value)])))
    + section("questions", "Pertanyaan Terbuka", open.length ? `<ul>${open.map(x => `<li>${esc(x.q)}</li>`).join("")}</ul>` : `<p class="sec-lead">Tidak ada pertanyaan terbuka.</p>`,
      { lead: "Hal yang masih perlu dikonfirmasi ke user / tim." })
    + (done.length ? section("answered", "Sudah Terjawab", `<ul class="answered">${done.map(x => `<li>${esc(x.q)}<span>${esc(x.a)}</span></li>`).join("")}</ul>`) : "")
    + (r.notes ? section("notes", "Catatan Lain", `<p class="r-text">${esc(r.notes)}</p>`) : "");
}

// Baca isi form Remarks (Mode edit) jadi objek remarks
function collectRemarks(form) {
  const rows = list => [...form.querySelectorAll(`.r-row[data-list="${list}"]`)];
  const f = (el, n) => el.querySelector(`[name="${n}"]`).value.trim();
  return {
    facts: rows("facts").map(el => ({ label: f(el, "label"), value: f(el, "value") })),
    questions: rows("questions").map(el => ({ q: f(el, "q"), a: f(el, "a") })),
    notes: form.querySelector('[name="notes"]').value.trim()
  };
}
const withName = (code, name) => d => isEmpty(d[code]) ? null : d[name] ? `${d[code]} · ${d[name]}` : d[code];
const BLOCK = { Y: "Block Posting", N: "Without Warning" };
const PERMISSION = { F: "Full Authorization", R: "Read Only", N: "No Authorization" };

// ---------- 1.1 Company Details ----------
const COMPANY_GENERAL = [
  { group: "Bahasa lokal" },
  { label: "Company Name", col: "OADM.CompnyName", sub: 1 },
  { label: "Alias Name", col: "OADM.AliasName", sub: 1 },
  { label: "Print Header", col: "OADM.PrintHeadr", sub: 1 },
  { label: "Address", col: "OADM.CompnyAddr", sub: 1 },
  { label: "Street", col: "ADM1.Street", sub: 1 },
  { label: "Street No.", col: "ADM1.StreetNo", sub: 1 },
  { label: "Building / Floor / Room", col: "ADM1.Building", sub: 1 },
  { label: "Block", col: "ADM1.Block", sub: 1 },
  { label: "City", col: "ADM1.City", sub: 1 },
  { label: "County", col: "ADM1.County", sub: 1 },
  { label: "State", col: "ADM1.State", sub: 1 },
  { label: "Zip Code", col: "ADM1.ZipCode", sub: 1 },
  { label: "Country", col: "ADM1.Country", sub: 1, fmt: withName("Country", "CountryName") },
  { group: "Kontak" },
  { label: "Internet Address", col: "ADM1.IntrntAdrs", sub: 1 },
  { label: "Tel 1", col: "OADM.Phone1", sub: 1 },
  { label: "Tel 2", col: "OADM.Phone2", sub: 1 },
  { label: "Fax", col: "OADM.Fax", sub: 1 },
  { label: "Email", col: "OADM.E_Mail", sub: 1 },
  { label: "Manager", col: "OADM.Manager", sub: 1 },
  { group: "Bahasa asing (Foreign Language)" },
  { label: "Print Header (foreign)", col: "OADM.PrintHdrF", sub: 1 },
  { label: "Address (foreign)", col: "OADM.CmpnyAddrF", sub: 1 },
  { label: "Street (foreign)", col: "ADM1.StreetF", sub: 1 },
  { label: "City (foreign)", col: "ADM1.CityF", sub: 1 },
  { label: "Zip Code (foreign)", col: "ADM1.ZipCodeF", sub: 1 }
];
const COMPANY_ACCOUNTING = [
  { label: "NPWP", col: "OADM.TaxIdNum" },
  { label: "ID TKU (CoreTax)", col: "OADM.U_STEM_IDTKU" },
  { label: "Tax Office", col: "OADM.RevOffice" }
];
const BASIC_INIT = [
  { label: "Local Currency", col: "OADM.MainCurncy" },
  { label: "System Currency", col: "OADM.SysCurrncy" },
  { label: "Display Credit Balance with Negative Sign", col: "OADM.DispPosDeb", type: "yn" },
  { label: "Allow Negative Amounts for Reversal Transaction Posting", col: "OADM.NegAmount", type: "yn" },
  { label: "Permit More than One Document Type per Series", type: "na" },
  { label: "Use Perpetual Inventory", col: "OADM.ContInvnt", type: "yn" },
  { label: "Item Groups Valuation Method", col: "OADM.InvntSystm", type: "opt", opts: VALUATION },
  { label: "Manage Item Cost per Warehouse", col: "OADM.PriceSys", type: "yn", verify: 1 },
  { label: "Use Purchase Accounts Posting System", col: "OADM.UsePaSys", type: "yn" },
  { label: "Allow Stock Release Without Item Cost", col: "CINF.RelStkNoPr", type: "yn" },
  { label: "Manage Serial and Batch Cost By", type: "na" },
  { label: "Enable Separate Net and Gross Price Mode", col: "OADM.EnPriceMod", type: "yn" },
  { label: "Enable Fixed Assets", col: "OADM.InstFixAst", type: "yn", verify: 1 },
  { label: "Calculate Depreciation By", col: "OADM.DeprecCalc", type: "opt", opts: { M: "Month", D: "Day" }, verify: 1 },
  { label: "Enable Multiple Branches", col: "OADM.MltpBrnchs", type: "yn" },
  { label: "Mask Credit Card Number", col: "OADM.CCMask", type: "yn" },
  { label: "Enable Advanced G/L Account Determination", col: "OADM.NewAcctDe", type: "yn" },
  { label: "Allow Selection of Any Account Type for Revenue Accounts", type: "na" },
  { label: "Enable Project Management", col: "OADM.PrjMngmnt", type: "yn" }
];

// ---------- 1.2 General Settings (satu entri per tab) ----------
const GS_TABS = [
  ["bp", "Business Partner", "Pembatasan kredit customer, komisi, approval, dan payment term default.", [
    { group: "Customer Activity Restrictions" },
    { label: "Credit Limit", col: "OADM.CreditLimt", type: "yn", sub: 1 },
    { label: "Commitment Limit", col: "OADM.ObligLimit", type: "yn", sub: 1 },
    { label: "Consider Deliveries Balance", col: "OADM.AddDlnBlnc", type: "yn", sub: 1 },
    { group: "Restriction on Document" },
    { label: "A/R Invoice", col: "OADM.SalesLimit", type: "yn", sub: 1 },
    { label: "Delivery", col: "OADM.DlnLimit", type: "yn", sub: 1 },
    { label: "Sales Order", col: "OADM.OrderLimit", type: "yn", sub: 1 },
    { label: "Pick List", col: "OADM.PickLimit", type: "yn", sub: 1 },
    { group: "Set Commission by" },
    { label: "Sales Employee", col: "OADM.SlpCommUse", type: "yn", sub: 1 },
    { label: "Items", col: "OADM.ItmCommUse", type: "yn", sub: 1 },
    { label: "Customers", col: "OADM.CrdCommUse", type: "yn", sub: 1 },
    { group: "Approval Process" },
    { label: "Enable Approval Process", col: "OADM.useDocWrf", type: "yn", sub: 1, verify: 1 },
    { label: "Enable Approval Process in DI", col: "OADM.EnbApprDI", type: "yn", sub: 1 },
    { label: "Enable Updating the Document Generated/Updated by Approval Process", col: "OADM.EnbApUpDoc", type: "yn", sub: 1, verify: 1 },
    { label: "Enable Originator to Update the Document Draft in Pending/Approved Status", col: "OADM.EnbApUpDft", type: "yn", sub: 1, verify: 1 },
    { label: "Enable Authorizer to Update Document Draft in Pending Status", col: "OADM.EnAuthUpt", type: "yn", sub: 1, verify: 1 },
    { group: "Payment Terms Preferences" },
    { label: "Default Payment Term for Customer", col: "OADM.DfCustTerm", sub: 1, fmt: withName("DfCustTerm", "DfCustTermName") },
    { label: "Default Payment Term for Vendor", col: "OADM.DfVendTerm", sub: 1, fmt: withName("DfVendTerm", "DfVendTermName") },
    { group: "Lainnya" },
    { label: "Apply Changes in BP Fields to New Business Partners Only", type: "na", sub: 1 },
    { label: "Use Shipped Goods Account for Customer", col: "OADM.UseShpdGd", type: "yn", sub: 1 },
    { label: "Display Inactive Business Partners in Reports", col: "OADM.DspFrznBP", type: "yn", sub: 1, verify: 1 },
    { label: "Display Inactive Business Partners in Marketing Documents", type: "na", sub: 1 },
    { label: "Allow Updating Address ID", col: "OADM.AllowUpdat", type: "yn", sub: 1, verify: 1 },
    { label: "Enable Filtering Mechanism by Branch", col: "CINF.EnbMBFilt", type: "yn", sub: 1 },
    { label: "Set Default Price List in General Settings Instead of in Payment Terms", col: "OADM.UseDfltPL", type: "yn", sub: 1 },
    { label: "Auto. Assign New Branches to Existing Business Partner", col: "ADM1.AsnBrnchBP", type: "yn", sub: 1 }
  ]],
  ["budget", "Budget", "Kontrol dokumen yang melebihi budget.", [
    { label: "Enable Budget Initialization", col: "OADM.DoBudget", type: "yn" },
    { label: "For a Document that Deviates from the Budget", col: "OADM.BgtBlock", type: "opt",
      opts: { B: "Block Deviation from Budget", W: "Warning", N: "Without Warning" } },
    { label: "Deviates Period", col: "OADM.BgtWarning", type: "opt", opts: { A: "For Annual Budget", M: "For Monthly Budget" } },
    { group: "Document Deviates from Budget" },
    { label: "Purchase Request", col: "OADM.BdgtPRQDOC", type: "yn", sub: 1 },
    { label: "Purchase Order", col: "OADM.BdgtPORDoc", type: "yn", sub: 1 },
    { label: "Goods Receipt PO", col: "OADM.BdgtPDNDoc", type: "yn", sub: 1 },
    { label: "Accounting", col: "OADM.BdgtAcctng", type: "yn", sub: 1 }
  ]],
  ["services", "Services", "Perilaku SAP B1 saat login, notifikasi, dan penguncian layar. Nilai di sini adalah default perusahaan; tiap user bisa punya setting sendiri.", [
    { group: "At the Beginning of Each Session" },
    { label: "Perform Data Check", col: "OADM.CheckFiles", type: "yn", sub: 1, verify: 1 },
    { label: "Open Exchange Rates Table", col: "OADM.DsplyRates", type: "yn", sub: 1, verify: 1 },
    { label: "Display Recurring Postings on Execution", col: "OADM.RcrFlag", type: "yn", sub: 1, verify: 1 },
    { label: "Display Recurring Transactions on Execution", col: "OADM.RclFlag", type: "yn", sub: 1, verify: 1 },
    { label: "Send Alert for Activities Scheduled for Today", type: "na", sub: 1 },
    { label: "Display Inbox When New Message Arrives", col: "OADM.ShowNewMsg", type: "yn", sub: 1, verify: 1 },
    { label: "Display Worklist When New Task Arrives", col: "OADM.ShowNewTsk", type: "yn", sub: 1 },
    { group: "Lainnya" },
    { label: "Enable Transaction Notification", type: "na", sub: 1 },
    { label: "Enable Alert Service", type: "na", sub: 1 },
    { label: "Update Messages (Min.)", col: "OADM.AlertPolFr", sub: 1 },
    { label: "Screen Locking Time (Min.)", col: "OADM.ScreenLock", sub: 1 },
    { label: "Use Numeric Keypad ENTER Key as TAB Key", col: "OADM.EnterAsTab", type: "yn", sub: 1, verify: 1 }
  ]],
  ["display", "Display", "Format tanggal, jam, angka, dan jumlah digit desimal di semua layar dan laporan.", [
    { group: "Date & Time" },
    { label: "Date Format", col: "OADM.DateFormat", type: "opt", opts: DATE_FMT, sub: 1 },
    { label: "Time Format", col: "OADM.TimeFormat", type: "opt", opts: TIME_FMT, sub: 1 },
    { label: "Date Separator", col: "OADM.DateSep", sub: 1, type: "html", fmt: d => `<code>${esc(d.DateSep)}</code>` },
    { group: "Decimal Places" },
    { label: "Amounts", col: "OADM.SumDec", sub: 1 },
    { label: "Price", col: "OADM.PriceDec", sub: 1 },
    { label: "Rates", col: "OADM.RateDec", sub: 1 },
    { label: "Quantities", col: "OADM.QtyDec", sub: 1 },
    { label: "Percent", col: "OADM.PercentDec", sub: 1 },
    { label: "Units", col: "OADM.MeasureDec", sub: 1 },
    { label: "Decimals in Query", col: "OADM.QueryDec", sub: 1 },
    { group: "Lainnya" },
    { label: "Decimal Separator", col: "OADM.DecSep", sub: 1, type: "html", fmt: d => `<code>${esc(d.DecSep)}</code>` },
    { label: "Thousands Separator", col: "OADM.ThousSep", sub: 1, type: "html", fmt: d => `<code>${esc(d.ThousSep)}</code>` },
    { label: "Display Currency on the Right", col: "OADM.CurOnRight", type: "yn", sub: 1 },
    { label: "Exchange Rate Posting", col: "OADM.DirectRate", type: "opt", opts: { Y: "Direct", N: "Indirect" }, sub: 1 }
  ]],
  ["path", "Path", "Folder di server untuk gambar item dan lampiran dokumen. Kalau kosong, user tidak bisa melampirkan file.", [
    { label: "Picture", col: "OADP.BitmapPath", verify: 1 },
    { label: "Attachment", col: "OADP.AttachPath", verify: 1 },
    { label: "Microsoft Word Templates", col: "OADP.WordPath", verify: 1 },
    { label: "Microsoft Excel Folder", col: "OADM.ExcelPath", verify: 1 }
  ]],
  ["inventory", "Inventory", "Cara SAP B1 mengelola serial/batch, item nonaktif, warehouse default, dan penentuan akun persediaan.", [
    { group: "Management Method" },
    { label: "Serial Numbers", col: "CINF.SriMngSys", type: "opt", opts: { A: "On Every Transaction", R: "On Release Only" }, sub: 1 },
    { label: "Batches", col: "CINF.BtchMngSys", type: "opt", opts: { A: "On Every Transaction", R: "On Release Only" }, sub: 1 },
    { group: "Lainnya" },
    { label: "Issue Primarily By", col: "OADM.IssuePriBy", type: "opt", opts: { 0: "Serial and Batch Numbers", 1: "Bin Locations" }, sub: 1, verify: 1 },
    { label: "Unique Serial Numbers by", col: "OADM.SriUniqFld", type: "opt", opts: { N: "None" }, sub: 1, verify: 1,
      fmt: d => d.SetSriUniq === "N" ? "N" : d.SriUniqFld },
    { label: "Display Batch Quantities By", type: "na", sub: 1 },
    { label: "Basic Setting for Batch Status", col: "OADM.BtchStatus", type: "opt", opts: { 0: "Released", 1: "Not Accessible", 2: "Locked" }, sub: 1 },
    { label: "Block Multiple Receipts for Same Batch with Serial/Batch Valuation Method", col: "OADM.OneBOneRec", type: "yn", sub: 1, verify: 1 },
    { group: "Display Inactive Items In" },
    { label: "Reports", col: "OADM.InActRpt", type: "yn", sub: 1 },
    { label: "Marketing Documents", col: "OADM.InActMkt", type: "yn", sub: 1 },
    { group: "Item Master Data" },
    { label: "Default Warehouse", col: "OADM.DfltWhs", sub: 1, fmt: withName("DfltWhs", "DfltWhsName") },
    { label: "Set Inventory Method By", col: "OADM.GLMethod", type: "opt", opts: GL_METHOD, sub: 1 },
    { label: "Auto. Add All Warehouses to New and Existing Items", type: "na", sub: 1 },
    { label: "Auto. Add All UoM Group Definitions to New and Existing Items", col: "OADM.AutoAddUoM", type: "yn", sub: 1 },
    { label: "Auto. Add All Package Definitions to New and Existing Items", col: "OADM.AutoAddPkg", type: "yn", sub: 1 },
    { label: "Open Item Master Data Instead of BOM When Selecting Link Arrow", col: "OADM.DriDownBOM", type: "yn", sub: 1, verify: 1 },
    { label: "Duplicate Bar Codes While Duplicating Items", col: "OADM.ItmDupBCD", type: "yn", sub: 1 },
    { label: "Duplicate Prices While Duplicating Items", type: "na", sub: 1 }
  ]],
  ["resources", "Resources", "Default untuk resource produksi (mesin, tenaga kerja).", [
    { label: "Default Warehouse", col: "OADM.DftResWhs", fmt: withName("DftResWhs", "DftResWhsName") },
    { label: "Auto. Add All Warehouses to New Resources", col: "OADM.AutoResWhs", type: "yn" },
    { group: "Default Capacity Period" },
    { label: "Start From Today Until", col: "OADM.StartFrom", sub: 1, verify: 1, fmt: d => isEmpty(d.StartFrom) ? null : `kode ${d.StartFrom}` },
    { label: "+ Months", col: "OADM.Months", sub: 1 },
    { label: "+ Days", col: "OADM.Days", sub: 1 }
  ]],
  ["cash-flow", "Cash Flow", "Apakah transaksi kas wajib diberi cash flow line item, dan default-nya.", [
    { label: "Assignment of Cash Flow Line Item", col: "OADM.CfwAsnMust", type: "opt", opts: { N: "Optional", Y: "Mandatory" } },
    { group: "Default Primary Form Cash Flow Line Item" },
    { label: "Incoming Payment", col: "OADM.CfwInDflt", sub: 1, fmt: withName("CfwInDflt", "CfwInName") },
    { label: "Outgoing Payment", col: "OADM.CfwOutDflt", sub: 1, fmt: withName("CfwOutDflt", "CfwOutName") },
    { label: "Assignment in Transaction with All Relevant Cash Flow", type: "na" }
  ]],
  ["cost-accounting", "Cost Accounting", "Dimension (cost center) dan apa yang terjadi kalau jurnal tidak diberi distribution rule atau project.", [
    { label: "Use Multidimensions", col: "OADM.UseMltDims", type: "yn" },
    { label: "Display Distribution Rules", col: "OADM.MDStyle", type: "opt", opts: { U: "In a Unified Column", S: "In Separate Columns" } },
    { group: "Journal entry tanpa distribution rule / project" },
    { label: "Distribution Rule", col: "OADM.DRBlock1", type: "opt", opts: BLOCK, sub: 1, verify: 1 },
    { label: "Project Code", col: "OADM.PrjBlock", type: "opt", opts: BLOCK, sub: 1, verify: 1 },
    { label: "Apply to Period-End Closing", type: "na", sub: 1 },
    { label: "Apply to Automatically Created Transactions", type: "na", sub: 1 }
  ]],
  ["pricing", "Pricing", "Sumber harga yang dipakai dan perlakuan price list nonaktif.", [
    { label: "Effective Price Considers All Price Sources", col: "OADM.EffPriDisc", type: "yn", verify: 1 },
    { label: "Display Zero Price if Price Source Is Based on Inactive Price Lists", type: "na" },
    { label: "Display Inactive Price List In", type: "na" },
    { label: "Remove Unpriced Items from Price List in Database", type: "na" },
    { label: "When UoM Conversion Rules Change", type: "na" }
  ]],
  ["hide-functions", "Hide Functions", "Modul yang disembunyikan dari menu.", [
    { label: "Budget, Payment Wizard, Dunning Wizard, Cost Accounting, Serial & Batch, Production, MRP, UoM", type: "na",
      note: "Disimpan di luar tabel yang terbaca. Cek manual di General Settings › Hide Functions" }
  ]]
];

// Pengaturan yang kolomnya tidak ditemukan memang tidak dipakai di project ini: buang barisnya,
// lalu buang judul grup / tab yang jadi kosong.
const GS = GS_TABS.map(([id, title, lead, rows]) => {
  const kept = rows.filter(r => r.type !== "na")
    .filter((r, i, a) => !r.group || (a[i + 1] && !a[i + 1].group));
  return [id, title, lead, kept];
}).filter(([, , , rows]) => rows.some(r => !r.group));

// ---------- pemeriksaan otomatis ----------
function checkCompany(c) {
  const out = [];
  const missing = [["Alamat (Street)", c.Street], ["Kota", c.City], ["Telepon", c.Phone1], ["Email", c.E_Mail],
    ["Nama alias", c.AliasName]].filter(([, v]) => isEmpty(v)).map(([k]) => k);
  const tax = [["NPWP", c.TaxIdNum], ["ID TKU", c.U_STEM_IDTKU], ["Tax Office", c.RevOffice]].filter(([, v]) => isEmpty(v)).map(([k]) => k);
  if (tax.length) out.push(["warn", `Accounting Data belum lengkap: ${tax.join(", ")}. Data ini dipakai untuk faktur pajak / CoreTax.`]);
  if (missing.length) out.push(["warn", `Company Details belum lengkap: ${missing.join(", ")}.`]);
  return out;
}
function checkSettings(s) {
  const out = [];
  if (+s.PayTermCount <= 1) out.push(["warn", `Baru ada ${s.PayTermCount} payment term (${s.DfCustTermName || "-"}), dan dipakai sebagai default customer & vendor.`]);
  if (/TRNS|TRANSIT/i.test(`${s.DfltWhs} ${s.DfltWhsName}`)) out.push(["info", `Warehouse default item adalah ${s.DfltWhs} (${s.DfltWhsName}). Pastikan memang disengaja.`]);
  return out;
}
function checkPeriods(periods) {
  if (!periods.length) return [];
  const last = periods[periods.length - 1].ToDate;
  return (new Date(last) - new Date()) / 864e5 < 90
    ? [["warn", `Posting period terakhir berakhir ${last}. Period tahun berikutnya belum dibuat.`]] : [];
}
// Sub-tipe NNM1.DocSubType per objek (Business Partner, Blanket Agreement)
// Objek yang ada di NNM1 tapi tidak bisa di-set di layar Document Numbering lokalisasi Indonesia (dicek ke SAP B1 REFDB):
// fitur lokalisasi negara lain + objek bawaan sistem tanpa nama di REFDB. Disembunyikan, bisa ditampilkan lewat checkbox.
const NNM_HIDDEN = new Set(["68", "132", "163", "164", "165", "166", "270", "280", "281", "140000008", "140000009", "140000010",
  "140000014", "253000001", "540000024", "1660000003", "1660000004"]);
const SUBTYPE = { 2: { C: "Customer", S: "Vendor", L: "Lead" }, 1250000025: { C: "Customer", S: "Vendor" } };
function checkSeries(series) {
  const issues = new Map(); // Series -> [pesan]
  const add = (s, msg) => issues.set(s.Series, [...(issues.get(s.Series) || []), msg]);
  // range hanya dibandingkan antar series dengan objek + sub-tipe yang sama (BP Customer vs Vendor punya penomoran sendiri),
  // series manual tidak punya range jadi tidak ikut dicek
  const byObj = {};
  series.filter(s => s.IsManual !== "Y" && !isEmpty(s.InitialNum))
    .forEach(s => (byObj[`${s.ObjectCode}|${s.DocSubType}`] ||= []).push(s));
  for (const list of Object.values(byObj)) {
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      if (+a.InitialNum <= +b.LastNum && +b.InitialNum <= +a.LastNum) {
        add(a, `Range nomor bentrok dengan ${b.SeriesName}`); add(b, `Range nomor bentrok dengan ${a.SeriesName}`);
      }
    }
  }
  series.forEach(s => {
    const yy = (s.SeriesName || "").match(/(\d{2})$/), ind = (s.Indicator || "").match(/^(?:19|20)(\d{2})$/);
    if (yy && ind && yy[1] !== ind[1]) add(s, `Nama series berakhiran "${yy[1]}" tapi period indicator ${s.Indicator}`);
  });
  return issues;
}
function checkUsers(users) {
  const out = [];
  const su = users.filter(u => u.SUPERUSER === "Y");
  if (users.length && su.length === users.length) out.push(["warn", `Semua user (${su.length}) berstatus Superuser. Perlu dicek lagi untuk otorisasi saat go-live.`]);
  const noBranch = users.filter(u => !u.Branches).map(u => u.USER_CODE);
  if (noBranch.length) out.push(["info", `User tanpa assignment branch: ${noBranch.join(", ")}.`]);
  return out;
}
function checkOrg(branches) {
  const out = [];
  const noTax = branches.filter(b => !b.TaxIdNum).map(b => b.BPLName);
  if (noTax.length) out.push(["info", `NPWP branch belum diisi: ${noTax.join(", ")}.`]);
  return out;
}

// ---------- definisi halaman ----------
// render(d) -> HTML; checks(d) -> [[level, pesan]]; index -> entri pencarian [{label, anchor}]
export const PAGES = {
  "company-details": {
    lead: "Identitas perusahaan yang tercetak di dokumen dan laporan, data pajak, serta pengaturan dasar yang menentukan cara kerja SAP B1 di seluruh perusahaan.",
    menu: "Administration › System Initialization › Company Details",
    tables: ["OADM", "ADM1", "CINF"],
    checks: d => checkCompany(one(d.company)),
    index: [["general", "General", COMPANY_GENERAL], ["accounting-data", "Accounting Data", COMPANY_ACCOUNTING], ["basic-initialization", "Basic Initialization", BASIC_INIT]],
    render(d) {
      const c = one(d.company);
      return section("general", "General", settings(COMPANY_GENERAL, c, "general"),
          { no: "1.1.1", lead: "Nama dan alamat perusahaan. Field <b>Print Header</b> yang tercetak di header dokumen." })
        + section("accounting-data", "Accounting Data", settings(COMPANY_ACCOUNTING, c, "accounting-data"),
          { no: "1.1.2", lead: "Identitas pajak perusahaan, dipakai untuk e-Faktur / CoreTax." })
        + section("basic-initialization", "Basic Initialization", settings(BASIC_INIT, c, "basic-initialization"),
          { no: "1.1.3", lead: "Sebagian besar pengaturan di sini <b>tidak bisa diubah lagi</b> setelah ada transaksi." })
        + section("system", "Informasi Sistem", kv([
            ["Versi SAP B1", `${esc(sapVersion(c.Version))}<span class="raw">(${esc(c.Version)})</span>`],
            ["Database (schema)", val(c.Schema)]]), { lead: "Bukan bagian dari blueprint, untuk referensi teknis." });
    }
  },

  "general-settings": {
    lead: "Pengaturan global SAP B1 per tab di layar General Settings. Urutan dan nomor mengikuti blueprint.",
    menu: "Administration › System Initialization › General Settings",
    tables: ["OADM", "CINF", "ADM1", "OADP"],
    checks: d => checkSettings(one(d.settings)),
    index: GS.map(([id, title, , rows]) => [id, title, rows]),
    render(d) {
      const s = one(d.settings);
      return GS.map(([id, title, lead, rows], i) =>
        section(id, title, settings(rows, s, id, { emptyText: "None" }), { no: `1.2.${i + 1}`, lead })).join("");
    }
  },

  "posting-period": {
    lead: "Periode akuntansi yang boleh dipakai untuk posting transaksi.",
    menu: "Administration › System Initialization › Posting Periods",
    tables: ["OFPR", "OACP"],
    checks: d => checkPeriods(rowsOf(d.periods)),
    render(d) {
      const periods = rowsOf(d.periods);
      const open = periods.filter(p => p.PeriodStat === "N" || p.PeriodStat === "S").length;
      return `<div class="kpis"><div class="kpi"><b>${periods.length}</b><span>Periode</span></div>
          <div class="kpi"><b>${open}</b><span>Masih terbuka</span></div></div>`
        + section("periods", "Daftar Periode", table([{ key: "Code", label: "Kode" }, { key: "Category", label: "Kategori" },
          { key: "FromDate", label: "Dari" }, { key: "ToDate", label: "Sampai" }, { key: "Indicator", label: "Indicator" }, { key: "PeriodStat", label: "Status",
            fmt: v => PERIOD_STAT[v] ? `<span class="badge ${PERIOD_STAT[v][1]}">${PERIOD_STAT[v][0]}</span>` : val(v) }], periods));
    }
  },

  "cost-center": {
    lead: "Dimension (cost accounting) yang dipakai untuk analisa biaya, dan cost center / profit center di tiap dimension.",
    menu: "Financials › Setup › Cost Accounting › Dimensions · Financials › Cost Accounting › Profit Centers",
    tables: ["ODIM", "OPRC"],
    checks(d) {
      const dims = rowsOf(d.dimensions).filter(x => x.DimActive === "Y"), ccs = rowsOf(d.cost_centers).filter(c => !isSystemCc(c));
      const empty = dims.filter(x => !ccs.some(c => c.DimCode === x.DimCode)).map(x => `${x.DimName} (${x.DimDesc || "-"})`);
      return empty.length ? [["warn", `Dimension aktif yang belum punya cost center sendiri (baru General Center bawaan sistem): ${empty.join(", ")}.`]] : [];
    },
    render(d) {
      const dims = rowsOf(d.dimensions), ccs = rowsOf(d.cost_centers);
      const ccCols = [{ key: "PrcCode", label: "Kode" }, { key: "PrcName", label: "Nama" },
        { key: "Active", label: "Aktif", fmt: badgeYN }, { key: "ValidFrom", label: "Berlaku dari" }, { key: "ValidTo", label: "Sampai" },
        { key: "CCTypeCode", label: "Tipe" }, { key: "PrcCode", label: "Catatan", fmt: (v, r) => isSystemCc(r) ? `<span class="badge">bawaan sistem</span>` : "" },
        ...udfCols(d.cost_centers)];
      return section("dimensions", "Dimension", table([{ key: "DimName", label: "Dimension" }, { key: "DimDesc", label: "Keterangan" },
          { key: "DimActive", label: "Aktif", fmt: badgeYN },
          { key: "CcCount", label: "Cost center", num: 1, fmt: (v, r) => String(ccs.filter(c => c.DimCode === r.DimCode && !isSystemCc(c)).length) },
          ...udfCols(d.dimensions)], dims),
          { no: "2.9.1", lead: "Kolom Keterangan adalah nama yang tampil di dokumen dan laporan." })
        + section("cost-centers", "Cost Center per Dimension", dims.map(x => section(`dim-${x.DimCode}`, `${x.DimName} · ${x.DimDesc || "-"}`,
            table(ccCols, ccs.filter(c => c.DimCode === x.DimCode)), { level: 3 })).join(""),
          { no: "2.9.2", lead: "<code>Centr_z…</code> (General Center) dibuat otomatis oleh SAP untuk tiap dimension, bukan cost center bisnis." });
    }
  },

  "payment-terms": {
    lead: "Syarat pembayaran yang dipilih di master BP dan dokumen. Jatuh tempo dihitung dari tanggal dasar + bulan/hari tambahan.",
    menu: "Administration › Setup › Business Partners › Payment Terms",
    tables: ["OCTG"],
    checks: d => rowsOf(d.terms).length <= 1 ? [["warn", "Baru ada payment term bawaan (- Cash Basic -)."]] : [],
    render: d => section("terms", "Daftar Payment Terms", table([{ key: "GroupNum", label: "Kode", num: 1 }, { key: "PymntGroup", label: "Nama" },
      { key: "BslineDate", label: "Due date based on", fmt: codedCell(BASELINE) }, { key: "ExtraMonth", label: "+ Bulan", num: 1, fmt: num },
      { key: "ExtraDays", label: "+ Hari", num: 1, fmt: num }, { key: "TolDays", label: "Toleransi (hari)", num: 1, fmt: num },
      { key: "InstNum", label: "Cicilan", num: 1, fmt: num }, { key: "ListName", label: "Price List" },
      { key: "CredLimit", label: "Credit Limit", num: 1, fmt: num }, ...udfCols(d.terms)], rowsOf(d.terms)),
      { lead: "Diurutkan dari jumlah hari terkecil." })
  },

  "tax": {
    lead: "Tax group PPN (masukan & keluaran) dan kode PPh potong pungut yang dipakai di dokumen.",
    menu: "Administration › Setup › Financials › Tax › Tax Groups · Withholding Tax",
    tables: ["OVTG", "OWHT"],
    checks(d) {
      const out = [], vat = rowsOf(d.vat_groups);
      // persen yang tertulis di nama ("PPh 22 0.25%") harus sama dengan rate yang tersimpan
      const mismatch = [...vat.filter(v => v.Inactive !== "Y").map(v => [v.Code, v.Name, v.Rate]),
        ...rowsOf(d.withholding).map(w => [w.WTCode, w.WTName, w.Rate])]
        .filter(([, name, rate]) => { const m = /(\d+(?:[.,]\d+)?)\s*%/.exec(name || ""); return m && +m[1].replace(",", ".") !== +rate; })
        .map(([code, name, rate]) => `${code} "${name}" tersimpan ${+rate}%`);
      if (mismatch.length) out.push(["warn", `Rate tidak sama dengan persen di namanya: ${mismatch.join("; ")}.`]);
      const inactive = vat.filter(v => v.Inactive === "Y").length;
      if (inactive) out.push(["info", `${inactive} tax group template bawaan SAP (kode C1, C2, … dsb.) berstatus nonaktif. Disembunyikan di tabel.`]);
      return out;
    },
    render(d) {
      const vat = rowsOf(d.vat_groups), active = vat.filter(v => v.Inactive !== "Y"), wht = rowsOf(d.withholding);
      const cols = [{ key: "Code", label: "Tax Code" }, { key: "Name", label: "Description" }, { key: "Rate", label: "Rate %", num: 1, fmt: num },
        { key: "EffecDate", label: "Effective From" }, { key: "Account", label: "Akun" }, { key: "Locked", label: "Dikunci", fmt: badgeYN },
        ...udfCols(d.vat_groups)];
      return section("tax-group", "Tax Group", Object.entries(TAX_CAT).map(([c, name]) =>
          section(`tax-${c}`, `Category: ${name}`, table(cols, active.filter(v => v.Category === c)), { level: 3 })).join(""),
          { no: "2.3.1", lead: "Hanya tax group aktif. Rate adalah tarif yang berlaku sekarang." })
        + section("withholding", "Withholding Tax", table([{ key: "WTCode", label: "WTax Code" }, { key: "WTName", label: "WTax Name" },
          { key: "Category", label: "Category", fmt: codedCell(WHT_CAT) }, { key: "Rate", label: "Rate %", num: 1, fmt: num },
          { key: "BaseType", label: "Base Type", fmt: codedCell(WHT_BASE) }, { key: "PrctBsAmnt", label: "% Base", num: 1, fmt: num },
          { key: "EffecDate", label: "Effective From" }, { key: "Account", label: "Akun" }, { key: "Inactive", label: "Nonaktif", fmt: badgeYN },
          ...udfCols(d.withholding)], wht),
          { no: "2.3.2" });
    }
  },

  "house-bank": {
    lead: "Rekening bank milik perusahaan, beserta akun G/L yang dipakai saat pembayaran.",
    menu: "Administration › Setup › Banking › House Bank Accounts",
    tables: ["DSC1", "ODSC", "OACT"],
    checks(d) {
      const noGl = rowsOf(d.accounts).filter(a => isEmpty(a.GLAccount)).map(a => a.Account);
      return noGl.length ? [["warn", `House bank tanpa akun G/L: ${noGl.join(", ")}.`]] : [];
    },
    render: d => section("accounts", "House Bank Accounts", table([{ key: "BankCode", label: "Bank Code" }, { key: "BankName", label: "Bank" },
      { key: "Branch", label: "Branch" }, { key: "Account", label: "Account No." }, { key: "AcctName", label: "Account Name" },
      { key: "GLAccount", label: "Akun G/L", fmt: acct("GLAccount", "GLName") }, ...udfCols(d.accounts)], rowsOf(d.accounts)))
  },

  "banks": {
    lead: "Daftar bank (master) yang bisa dipilih di house bank dan rekening BP.",
    menu: "Administration › Setup › Banking › Banks",
    tables: ["ODSC"],
    render: d => section("banks", "Daftar Bank", table([{ key: "BankCode", label: "Bank Code" }, { key: "BankName", label: "Bank Name" },
      { key: "CountryCod", label: "Country" }, { key: "SwiftNum", label: "BIC/SWIFT Code" }, { key: "Locked", label: "Dikunci", fmt: badgeYN }, ...udfCols(d.banks)], rowsOf(d.banks)))
  },

  "document-settings": {
    sl: "admin-info",
    lead: "Pengaturan dokumen yang berlaku untuk semua jenis dokumen (tab General di Document Settings).",
    menu: "Administration › System Initialization › Document Settings › General",
    tables: ["Service Layer: CompanyService_GetAdminInfo"],
    render: d => section("general", "General", settings(DOC_SETTINGS, one(d.sl), "doc", { emptyText: "None" }),
      { lead: "Dibaca lewat Service Layer, bukan query DB, sehingga nilainya pasti sesuai layar SAP." })
  },

  "uom": {
    lead: "Satuan barang, beserta pemetaan ke kode satuan CoreTax (UDF STEM) untuk add-on CoreTax.",
    menu: "Administration › Setup › Inventory › Units of Measure",
    tables: ["OUOM"],
    checks(d) {
      const uom = rowsOf(d.uom).filter(u => u.UomEntry !== "-1");
      if (!uom.length) return [["warn", "Belum ada satuan selain \"Manual\". Item belum bisa memakai satuan yang terdefinisi."]];
      if (!hasUdf(d.uom, "U_STEM_CT_UOM")) return [];
      const noCt = uom.filter(u => isEmpty(u.U_STEM_CT_UOM)).map(u => u.UomCode);
      return noCt.length ? [["warn", `Satuan tanpa kode UoM CoreTax: ${noCt.join(", ")}.`]] : [];
    },
    render: d => section("uom", "Units of Measure", table([{ key: "UomCode", label: "UoM" }, { key: "UomName", label: "Nama" },
      { key: "Locked", label: "Dikunci", fmt: badgeYN }, ...udfCols(d.uom)], rowsOf(d.uom)))
  },

  "uom-groups": {
    lead: "Kelompok satuan dan konversinya (mis. 1 BOX = 12 PCS). Blueprint: dipakai atau tidak.",
    menu: "Administration › Setup › Inventory › UoM Groups",
    tables: ["OUGP", "UGP1"],
    render(d) {
      const groups = rowsOf(d.groups), lines = rowsOf(d.lines), used = groups.some(g => g.UgpEntry !== "-1");
      return section("usage", "Penggunaan UoM Group", kv([["Penggunaan Unit of Measure Groups", used ? `<span class="yn y">Ya</span>` : `<span class="yn n">Tidak</span> <span class="raw">(hanya grup "Manual")</span>`]]))
        + section("groups", "Daftar UoM Group", table([{ key: "UgpCode", label: "Kode" }, { key: "UgpName", label: "Nama" },
          { key: "BaseUomCode", label: "Base UoM" }, { key: "UgpEntry", label: "Konversi",
            fmt: v => lines.filter(l => l.UgpEntry === v).map(l => `${num(l.AltQty)} ${esc(l.UomCode)} = ${num(l.BaseQty)}`).join("<br>") || val(null) },
          ...udfCols(d.groups)], groups));
    }
  },

  "sales-employee": {
    lead: "Karyawan perusahaan (Employee Master Data) dan Sales Employee / Buyer yang dipilih di dokumen sales & purchasing. Employee bisa dihubungkan ke sales employee dan user SAP.",
    menu: "Human Resources › Employee Master Data · Administration › Setup › General › Sales Employees/Buyers",
    tables: ["OHEM", "OSLP", "OUDP", "OHPS", "OUSR"],
    checks(d) {
      const emp = rowsOf(d.employees), slp = rowsOf(d.slp).filter(s => s.SlpCode !== "-1" && s.Active === "Y");
      if (!emp.length) return [["info", "Employee master data belum diisi."]];
      const linked = new Set(emp.map(e => String(e.salesPrson)));
      const loose = slp.filter(s => !linked.has(String(s.SlpCode))).map(s => s.SlpName);
      return loose.length ? [["info", `Sales employee aktif yang belum dihubungkan ke employee master data: ${loose.join(", ")}.`]] : [];
    },
    render(d) {
      const emp = rowsOf(d.employees).map(e => ({ ...e, Name: [e.firstName, e.middleName, e.lastName].filter(Boolean).join(" ") }));
      const empBySlp = new Map(emp.filter(e => !isEmpty(e.salesPrson)).map(e => [String(e.salesPrson), e.Name]));
      const slp = rowsOf(d.slp).filter(s => s.SlpCode !== "-1").map(s => ({ ...s, Employee: empBySlp.get(String(s.SlpCode)) || null }));
      const dash = v => isEmpty(v) ? `<span class="muted">–</span>` : esc(v);
      const kpi = (n, l) => `<div class="kpi"><b>${n}</b><span>${l}</span></div>`;
      return `<div class="kpis">${kpi(emp.length, "Employee")}${kpi(emp.filter(e => e.Active === "Y").length, "Employee aktif")}
          ${kpi(slp.length, "Sales employee / buyer")}${kpi(slp.filter(s => s.Employee).length, "Terhubung ke employee")}</div>`
        + section("employees", "Employee Master Data", emp.length ? searchable("emp-t", [{ key: "empID", label: "ID", num: 1 }, { key: "Name", label: "Nama" },
            { key: "jobTitle", label: "Job Title", fmt: dash }, { key: "DeptName", label: "Department", fmt: dash }, { key: "PosName", label: "Position", fmt: dash },
            { key: "BPLName", label: "Branch", fmt: dash }, { key: "Manager", label: "Manager", fmt: dash }, { key: "USER_CODE", label: "User SAP", fmt: dash },
            { key: "SlpName", label: "Sales Employee", fmt: dash }, { key: "mobile", label: "Mobile", fmt: dash }, { key: "email", label: "E-Mail", fmt: dash },
            { key: "Active", label: "Aktif", fmt: badgeYN }, ...udfCols(d.employees)], emp)
          : `<div class="placeholder"><p style="margin:0;font-weight:600;color:var(--text)">Belum ada employee master data</p>
              <p style="margin:4px 0 0">Data akan tampil otomatis setelah karyawan diinput di Human Resources › Employee Master Data.</p></div>`,
          { no: "1.5.1", lead: "Kolom Sales Employee dan User SAP menunjukkan ke mana employee ini dihubungkan." })
        + section("sales", "Sales Employee / Buyer", table([{ key: "SlpCode", label: "Kode", num: 1 }, { key: "SlpName", label: "Nama" },
            { key: "Employee", label: "Employee", fmt: v => v ? esc(v) : `<span class="muted">belum dihubungkan</span>` },
            { key: "Memo", label: "Remarks", fmt: dash }, { key: "Commission", label: "Komisi %", num: 1, fmt: v => +v ? esc(+v) : `<span class="muted">0</span>` },
            { key: "Telephone", label: "Telepon", fmt: dash }, { key: "Email", label: "Email", fmt: dash },
            { key: "Active", label: "Aktif", fmt: badgeYN }, ...udfCols(d.slp)], slp),
          { no: "1.5.2", lead: "Dipilih di dokumen sales & purchasing. Baris bawaan \"-No Sales Employee-\" tidak ditampilkan." });
    }
  },

  "freight": {
    lead: "Biaya tambahan di dokumen (ongkos kirim, bongkar muat, dll.), beserta akun dan tax group-nya.",
    menu: "Administration › Setup › General › Freight",
    tables: ["OEXD", "OACT"],
    render: d => section("list", "Daftar Freight", searchable("freight-t", [{ key: "ExpnsCode", label: "No", num: 1 }, { key: "ExpnsName", label: "Name" },
      { key: "RevAcct", label: "Revenue Account", fmt: acct("RevAcct", "RevName") }, { key: "ExpnsAcct", label: "Expense Account", fmt: acct("ExpnsAcct", "ExpName") },
      { key: "VatGroupO", label: "Output Tax" }, { key: "VatGroupI", label: "Input Tax" },
      { key: "DistrbMthd", label: "Distribusi", fmt: codedCell(FREIGHT_DIST) }, ...udfCols(d.freight)], rowsOf(d.freight)))
  },

  "landed-cost": {
    lead: "Komponen biaya impor/pembelian yang dibebankan ke harga pokok barang melalui dokumen Landed Costs.",
    menu: "Administration › Setup › Inventory › Landed Costs",
    tables: ["OALC", "OACT"],
    render: d => section("list", "Daftar Landed Cost", searchable("lc-t", [{ key: "AlcCode", label: "Kode" }, { key: "AlcName", label: "Landed Cost Name" },
      { key: "OhType", label: "Allocation By", fmt: codedCell(LC_ALLOC) },
      { key: "LaCAllcAcc", label: "Allocation Account", fmt: acct("LaCAllcAcc", "AllocName") }, ...udfCols(d.landed_cost)], rowsOf(d.landed_cost)))
  },

  "shipping-type": {
    lead: "Cara pengiriman barang yang dipilih di dokumen (mis. Full Container Load, ekspedisi).",
    menu: "Administration › Setup › General › Shipping Types",
    tables: ["OSHP"],
    checks: d => rowsOf(d.shipping).length ? [] : [["info", "Belum ada shipping type."]],
    render: d => section("list", "Daftar Shipping Type", table([{ key: "TrnspCode", label: "Kode", num: 1 }, { key: "TrnspName", label: "Shipping Type" },
      { key: "WebSite", label: "Website" }, { key: "Active", label: "Aktif", fmt: badgeYN }, ...udfCols(d.shipping)], rowsOf(d.shipping)))
  },

  "payment-methods": {
    lead: "Cara pembayaran untuk Payment Wizard (transfer bank massal ke vendor / dari customer).",
    menu: "Banking › Payment Methods (Payment Wizard)",
    tables: ["OPYM"],
    checks: d => rowsOf(d.methods).length ? [] : [["info", "Belum ada payment method. Hanya dibutuhkan kalau Payment Wizard dipakai."]],
    render: d => section("list", "Daftar Payment Method", table([{ key: "PayMethCod", label: "Code" }, { key: "Descript", label: "Description" },
      { key: "Type", label: "Payment Type", fmt: codedCell(PAY_TYPE) }, { key: "BankTransf", label: "Bank Transfer", fmt: badgeYN },
      { key: "BnkDflt", label: "Bank" }, { key: "BankCountr", label: "Country" }, { key: "Format", label: "File Format" },
      { key: "Active", label: "Aktif", fmt: badgeYN }, ...udfCols(d.methods)], rowsOf(d.methods)))
  },

  "remarks": {
    static: true,
    lead: "Catatan project yang tidak tersimpan di SAP: tanggal penting, pertanyaan ke user, dan catatan lain. Diubah lewat <b>Mode edit</b>.",
    render: (_, { review, editing }) => renderRemarks(remarksOf(review), editing),
    remarks: { collect: collectRemarks }
  },

  "currencies": {
    lead: "Mata uang yang terdaftar di SAP B1.",
    menu: "Administration › Setup › Financials › Currencies",
    tables: ["OCRN"],
    render: d => section("list", "Daftar Mata Uang", table([{ key: "CurrCode", label: "Kode" }, { key: "CurrName", label: "Nama" },
      { key: "ISOCurrCod", label: "ISO" }, { key: "Locked", label: "Dikunci", fmt: badgeYN }, ...udfCols(d.currencies)], rowsOf(d.currencies)))
  },

  "document-numbering": {
    lead: "Pola penomoran dokumen per branch dan per tahun. Klik nama dokumen untuk melihat series-nya. Baris kuning menandakan ada masalah.",
    menu: "Administration › System Initialization › Document Numbering",
    tables: ["NNM1", "OUDO"],
    checks(d) {
      const n = checkSeries(rowsOf(d.series)).size;
      return n ? [["warn", `${n} numbering series bermasalah (range bentrok / tahun tidak cocok). Baris berwarna kuning.`]] : [];
    },
    render(d) {
      const series = rowsOf(d.series), issues = checkSeries(series), groups = {};
      let nHidden = 0;
      series.forEach(r => (groups[r.ObjectCode] ||= []).push(r));
      const html = Object.entries(groups).map(([code, list]) => {
        const name = OBJECTS[code] || list[0].UdoName || `Object ${code}`, hide = NNM_HIDDEN.has(code);
        if (hide) nHidden++;
        const years = list.map(r => +r.Indicator).filter(Boolean);
        const brs = [...new Set(list.map(r => r.BPLName).filter(Boolean))];
        const bad = list.filter(r => issues.has(r.Series)).length;
        const yr = years.length ? Math.min(...years) + (Math.max(...years) !== Math.min(...years) ? "–" + Math.max(...years) : "") : esc(list[0].Indicator || "");
        return `<details class="grp" data-text="${esc((name + " " + code + " " + list.map(r => r.SeriesName).join(" ")).toLowerCase())}" data-bad="${bad ? 1 : ""}" data-hide="${hide ? 1 : ""}"${hide ? " hidden" : ""}>
          <summary><span>${esc(name)} <span class="muted">· ${esc(code)}${list[0].UdoName ? " · UDO" : ""}</span></span>
            <span class="muted hide-sm">${brs.length ? brs.length + " branch" : "–"}</span>
            <span class="muted hide-sm">${yr}</span>
            <span>${list.length} series ${bad ? `<span class="badge warn">${bad} masalah</span>` : ""}</span></summary>
          ${table([
            { key: "SeriesName", label: "Nama Series" },
            ...(list.some(r => r.DocSubType && r.DocSubType !== "--")
              ? [{ key: "DocSubType", label: "Sub-tipe", fmt: v => coded(SUBTYPE[code] || {}, v) }] : []),
            { key: "BPLName", label: "Branch", fmt: (v, r) => r.IsManual === "Y" && isEmpty(v) ? "–" : val(v) },
            { key: "Indicator", label: "Indicator" },
            ...["InitialNum", "NextNumber", "LastNum"].map((k, i) => ({ key: k, label: ["Awal", "Berikutnya", "Akhir"][i], num: 1,
              fmt: (v, r) => r.IsManual === "Y" ? (i ? "–" : `<span class="badge">Manual</span>`) : val(v) })),
            { key: "Locked", label: "Dikunci", fmt: badgeYN }, { key: "Remark", label: "Remark" },
            { key: "Series", label: "Catatan", fmt: v => issues.has(v) ? issues.get(v).map(esc).join("<br>") : "" }
          ], list, { flag: r => issues.has(r.Series) })}
        </details>`;
      }).join("");
      onMount(() => {
        const q = $("#series-q"), bad = $("#series-bad"), all = $("#series-all") || {};
        const f = () => $$("#series-list details").forEach(el =>
          el.hidden = !el.dataset.text.includes(q.value.toLowerCase()) || (bad.checked && !el.dataset.bad) || (!all.checked && !!el.dataset.hide));
        q.oninput = bad.onchange = all.onchange = f;
      });
      return `<div class="kpis"><div class="kpi"><b>${series.length.toLocaleString("id-ID")}</b><span>Series</span></div>
          <div class="kpi"><b>${Object.keys(groups).length - nHidden}</b><span>Objek / dokumen</span></div>
          <div class="kpi"><b>${issues.size}</b><span>Series bermasalah</span></div></div>`
        + section("series", "Series per Dokumen", `<div class="toolbar"><input type="search" id="series-q" placeholder="Cari dokumen / series…">
          <label><input type="checkbox" id="series-bad"> Hanya yang bermasalah</label>
          ${nHidden ? `<label title="Objek lokalisasi negara lain / bawaan sistem yang tidak muncul di layar Document Numbering"><input type="checkbox" id="series-all"> Tampilkan objek yang tidak bisa di-set (${nHidden})</label>` : ""}</div><div id="series-list">${html}</div>`);
    }
  },

  "license": {
    sld: "license", withSql: true,
    lead: "Jumlah license SAP B1 per tipe dari License Server: dimiliki, terpakai, dan sisa, beserta masa berlakunya. Data ini tidak ada di database company, jadi dibaca langsung dari License Server (System Landscape Directory).",
    menu: "Administration › License › License Administration",
    tables: ["License Server: LicenseModules, LicenseFiles", "OUSR"],
    checks(d) {
      if (one(d.sld).configured !== "Y" || !d.modules || d.modules.error) return [];
      const out = [], soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), today = new Date().toISOString().slice(0, 10);
      for (const m of rowsOf(d.modules)) {
        const name = m.Description || m.Type;
        if (m.IsExpired === "true" || (m.ExpirationDate && m.ExpirationDate < today)) out.push(["danger", `License ${name} sudah kedaluwarsa (${m.ExpirationDate}).`]);
        else if (m.ExpirationDate && m.ExpirationDate <= soon) out.push(["warn", `License ${name} kedaluwarsa ${m.ExpirationDate}, kurang dari 30 hari lagi.`]);
        if (+m.Total > 0 && +m.Available <= 0) out.push(["warn", `License ${name} habis terpakai (${m.Total} dari ${m.Total}).`]);
      }
      return out;
    },
    render(d) {
      const u = one(d.users), kpi = (n, l) => `<div class="kpi"><b>${n}</b><span>${l}</span></div>`;
      const users = `<p class="sec-lead">User SAP di database ini: <b>${esc(u.Aktif ?? "–")}</b> aktif dari ${esc(u.Total ?? "–")} user
        (${esc(u.Superuser ?? "–")} superuser aktif). Penugasan license per user tidak ditampilkan.</p>`;
      if (one(d.sld).configured !== "Y")
        return section("modules", "License per Tipe", `<div class="placeholder"><p style="margin:0 0 6px;font-weight:600;color:var(--text)">License Server belum dikonfigurasi</p>
          <p style="margin:0 0 8px">Isi akun License Server (SLD, biasanya B1SiteUser) di <code>application.properties</code> server, lalu restart aplikasi:</p>
          <pre class="sx-pre">sap.sld.url=https://[host]:40000/sld/sld0100.svc
sap.sld.username=B1SiteUser
sap.sld.password=[PASSWORD]</pre></div>`) + users;
      const mods = rowsOf(d.modules).map(m => ({ ...m, Used: Math.max(0, (+m.Total || 0) - (+m.Available || 0)) }));
      const sum = k => mods.reduce((t, m) => t + (+m[k] || 0), 0);
      const today = new Date().toISOString().slice(0, 10);
      const state = m => m.IsExpired === "true" || (m.ExpirationDate && m.ExpirationDate < today) ? `<span class="badge danger">Kedaluwarsa</span>`
        : +m.Total > 0 && +m.Available <= 0 ? `<span class="badge warn">Habis</span>` : `<span class="badge yes">Tersedia</span>`;
      return `<div class="kpis">${kpi(mods.length, "Tipe license")}${kpi(sum("Total"), "Dimiliki")}${kpi(sum("Used"), "Terpakai")}${kpi(sum("Available"), "Sisa")}
          ${kpi(esc(u.Aktif ?? "–"), "User SAP aktif")}</div>`
        + section("modules", "License per Tipe", (d.modules && d.modules.error ? "" : table([
            { key: "Description", label: "Tipe License", fmt: (v, m) => `${esc(v || m.Type)}${v && m.Type && v !== m.Type ? `<span class="raw">${esc(m.Type)}</span>` : ""}` },
            { key: "Total", label: "Dimiliki", num: 1 }, { key: "Used", label: "Terpakai", num: 1 }, { key: "Available", label: "Sisa", num: 1 },
            { key: "StartDate", label: "Mulai" }, { key: "ExpirationDate", label: "Berlaku sampai" },
            { key: "IsExpired", label: "Status", fmt: (v, m) => state(m) }], mods, { flag: m => +m.Total > 0 && +m.Available <= 0 })) + users,
          { lead: "Terpakai = Dimiliki − Sisa, sesuai License Administration. Baris kuning = license habis terpakai." })
        + section("files", "File License", d.files && d.files.error ? "" : table([{ key: "FileName", label: "File" },
            { key: "InstallationNumber", label: "Installation Number" }, { key: "SystemNumber", label: "System Number" },
            { key: "Version", label: "Versi" }, { key: "Localization", label: "Lokalisasi" }, { key: "ExpirationDate", label: "Berlaku sampai" }], rowsOf(d.files)));
    }
  },

  "users": {
    lead: "Akun yang bisa login ke SAP B1, beserta branch yang boleh diakses. Otorisasi per user ada di <a href=\"#/authorizations\">1.7</a>.",
    menu: "Administration › Setup › General › Users",
    tables: ["OUSR", "USR6"],
    checks: d => checkUsers(rowsOf(d.users)),
    render(d) {
      const cols = [{ key: "USER_CODE", label: "User Code" }, { key: "U_NAME", label: "Nama" },
        { key: "SUPERUSER", label: "Superuser", fmt: badgeYN }, { key: "Locked", label: "Dikunci", fmt: badgeYN },
        { key: "Branches", label: "Branch", fmt: v => tags(v) }, { key: "LastLogin", label: "Login terakhir" }, ...udfCols(d.users)];
      // Excel: branch bisa lebih dari satu per user, jadi dipisah ke sheet "Branch Assignment" (sql/users/02_branches.sql)
      const xlsx = exportSheets([{ name: "Users", cols: cols.filter(c => c.key !== "Branches"), rows: rowsOf(d.users) },
        ...sqlSheets(d, { branches: "Branch Assignment" })], "User");
      return section("users", "User SAP B1", xlsx + table(cols, rowsOf(d.users), { noExport: true }));
    }
  },

  "authorizations": {
    lead: "Hak akses tiap user ke menu dan dokumen SAP B1. Superuser otomatis punya akses penuh, jadi izin per menu hanya berlaku untuk user non-superuser.",
    menu: "Administration › System Initialization › Authorizations › General Authorizations",
    tables: ["OUSR", "USR3", "USR7", "OUGR"],
    checks(d) {
      const users = rowsOf(d.users), active = users.filter(u => u.Locked !== "Y"), out = [];
      const su = active.filter(u => u.SUPERUSER === "Y");
      const noPerm = active.filter(u => u.SUPERUSER !== "Y" && !+u.PermFull && !+u.PermRead && !u.AuthGroups).map(u => u.USER_CODE);
      if (active.length && su.length === active.length) out.push(["warn", `Semua user aktif (${su.length}) Superuser dan belum ada authorization per user. Perlu disusun sebelum go-live.`]);
      if (noPerm.length) out.push(["warn", `User non-superuser tanpa izin dan tanpa authorization group: ${noPerm.join(", ")}. User ini tidak bisa membuka menu apa pun.`]);
      return out;
    },
    render(d) {
      const users = rowsOf(d.users), perms = rowsOf(d.permissions);
      const n = v => +v ? (+v).toLocaleString("id-ID") : `<span class="muted">0</span>`;
      return section("users", "Ringkasan per User", table([{ key: "USER_CODE", label: "User Code" }, { key: "U_NAME", label: "Nama" },
          { key: "SUPERUSER", label: "Superuser", fmt: badgeYN }, { key: "Locked", label: "Dikunci", fmt: badgeYN },
          { key: "AuthGroups", label: "Authorization Group", fmt: v => tags(v, { none: "–" }) },
          { key: "PermFull", label: "Full", num: 1, fmt: n }, { key: "PermRead", label: "Read Only", num: 1, fmt: n },
          { key: "PermNone", label: "No Auth.", num: 1, fmt: n }], users),
          { lead: "Full / Read Only / No Auth. = jumlah izin yang di-set eksplisit untuk user tersebut (USR3)." })
        + section("groups", "Authorization Group", table([{ key: "GroupName", label: "Nama" }, { key: "GroupDec", label: "Deskripsi" },
          { key: "StartDate", label: "Mulai" }, { key: "DueDate", label: "Berakhir" }, { key: "Members", label: "Anggota", num: 1 }], rowsOf(d.groups)),
          { lead: "User yang menjadi anggota group mendapat izin group tersebut." })
        + section("detail", "Detail Izin per User", perms.length
          ? searchable("perm-t", [{ key: "USER_CODE", label: "User" }, { key: "PermId", label: "ID Izin" },
            { key: "Permission", label: "Izin", fmt: v => coded(PERMISSION, v) }], perms, { filterKey: "USER_CODE", filterLabel: "user", limit: 500 })
          : `<div class="placeholder">Belum ada izin per user yang di-set (tabel USR3 kosong).</div>`,
          { lead: "Nama menu tidak tersimpan di database, jadi yang tampil adalah ID izin SAP B1." });
    }
  },

  "ui-templates": {
    lead: "Template tampilan form (kolom yang tampil, urutan, field yang bisa diedit) yang bisa dipakai bersama oleh beberapa user atau group.",
    menu: "Administration › Setup › General › UI Configuration Template",
    tables: ["UICU", "UIC1", "OUSR", "OUGR"],
    checks(d) {
      const tpl = rowsOf(d.templates), shared = tpl.filter(t => t.IsTemplate === "Y");
      return shared.length ? [] : [["info", `Belum ada UI Configuration Template bersama.${tpl.length ? ` Yang ada hanya template lokal milik user: ${tpl.map(t => `${t.TPLName} (${t.Owner || "-"})`).join(", ")}.` : ""}`]];
    },
    render(d) {
      const tpl = rowsOf(d.templates);
      return section("templates", "Daftar Template", table([{ key: "TPLId", label: "ID", num: 1 }, { key: "TPLName", label: "Nama" },
          { key: "TPLDesc", label: "Deskripsi" }, { key: "IsTemplate", label: "Jenis", fmt: v => v === "Y" ? `<span class="badge yes">Bersama</span>` : `<span class="badge">Lokal user</span>` },
          { key: "Owner", label: "Pemilik" }, { key: "Forms", label: "Jumlah form", num: 1 },
          { key: "Users", label: "Dipakai user", fmt: v => tags(v, { none: "–" }) }, { key: "Groups", label: "Dipakai group", fmt: v => tags(v, { none: "–" }) }], tpl),
          { lead: "Template lokal dibuat untuk satu user. Template bersama bisa di-assign ke user lain atau authorization group." })
        + section("users", "Template per User", table([{ key: "USER_CODE", label: "User Code" }, { key: "U_NAME", label: "Nama" },
          { key: "TPLName", label: "Template", fmt: (v, r) => isEmpty(v) ? `<span class="muted">Tanpa template</span>` : `${esc(v)}${r.IsTemplate === "Y" ? "" : ` <span class="badge">Lokal</span>`}` }],
          rowsOf(d.users)));
    }
  },

  "org-structure": {
    lead: "Branch (unit bisnis). Transaksi, user, dan numbering series dipisahkan per branch. Daftar gudang ada di halaman <a href=\"#/warehouses\">Warehouse</a>.",
    menu: "Administration › Setup › Financials › Branches",
    tables: ["OBPL", "OWHS", "USR6"],
    checks: d => checkOrg(rowsOf(d.branches)),
    render(d) {
      return section("branches", "Branch", table([{ key: "BPLId", label: "ID", num: 1 }, { key: "BPLName", label: "Nama Branch" },
          { key: "MainBPL", label: "Branch utama", fmt: badgeYN }, { key: "Disabled", label: "Nonaktif", fmt: badgeYN },
          { key: "DflWhs", label: "Warehouse default" }, { key: "TaxIdNum", label: "NPWP" },
          { key: "WhsCount", label: "Warehouse", num: 1, fmt: v => `<a href="#/warehouses">${esc(v)}</a>` }, { key: "UserCount", label: "User", num: 1 }, ...udfCols(d.branches)],
        rowsOf(d.branches)));
    }
  }
};
