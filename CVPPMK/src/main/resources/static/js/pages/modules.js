// Bab 2-5: Keuangan, Master Data, Kontrol Dokumen, Add-on & Kustomisasi.
// Diambil dari pola blueprint modul (01.02-08.01): hanya bagian yang bisa dibaca dari database, narasi proses tetap di Word.
import { mainTable, tableName, tableModule } from "../sap-tables.js";
import { $, $$, onMount, esc, val, badgeYN, coded, rowsOf, isEmpty, section, kv, settings, table, tabs, searchable, tags, udfCols, expandList, exportButton, exportSheets, sqlSheets, autoCols, VALUATION, GL_METHOD } from "../ui.js";
import { SP_PAGE } from "./sp-validation.js";

const one = r => rowsOf(r)[0] || {};
const num = v => isEmpty(v) ? val(v) : esc((+v).toLocaleString("id-ID"));
const codedCell = map => v => coded(map, v);
const kpis = list => `<div class="kpis">${list.map(([n, l]) => `<div class="kpi"><b>${typeof n === "number" ? n.toLocaleString("id-ID") : esc(n)}</b><span>${esc(l)}</span></div>`).join("")}</div>`;

// Kode akun -> "kode · nama", nama diambil dari daftar akun yang ikut dimuat di halaman.
const acctNames = d => Object.fromEntries(rowsOf(d.names || d.accounts).map(a => [a.AcctCode, a.AcctName]));
const acctLabel = (names, code) => isEmpty(code) ? null : names[code] ? `${code} · ${names[code]}` : code;
// Sel tabel akun: kode + nama di bawahnya (tabel lebar memang di-scroll ke samping)
const acctCell = names => v => isEmpty(v) ? val(v) : `<span class="acct">${esc(v)}<small>${esc(names[v] || "akun tidak ditemukan")}</small></span>`;

const DRAWER = { 1: "Assets", 2: "Liabilities", 3: "Capital & Reserves", 4: "Turnover", 5: "Cost of Sales", 6: "Operating Costs",
  7: "Non-Operating Income & Expenditure", 8: "Taxation & Extraordinary Items" };
const ACT_TYPE = { N: "Other", I: "Sales", E: "Expenditure" };
const ASSET_TYPE = { G: "General", L: "Low-Value Asset" };
// Kolom akun OADT. Label mengikuti nama field Service Layer FAAccountDeterminations (dicocokkan per nilai, 2026-10-16).
const FA_REQUIRED = [["BalanceAct", "Asset Balance Sheet"], ["OrdDprAct", "Ordinary Depreciation"], ["OrdDprAcc", "Accumulated Ordinary Depr."]];
const FA_ACCTS = [...FA_REQUIRED, ["ClrAcqAct", "Clearing Acquisition"],
  ["UnpDprAct", "Unplanned Depreciation"], ["UnpDprAcc", "Accumulated Unplanned Depr."],
  ["SpDprAct", "Special Depreciation"], ["SpDprAcc", "Accumulated Special Depr."],
  ["RevResvAct", "Revaluation Reserve"], ["RevResvClr", "Revaluation Reserve Clearing"], ["RevAct", "Revaluation Account"],
  ["SaRevNAct", "Revenue from Asset Sales (Net)"], ["ReExpNAct", "Retirement with Expense (Net)"], ["ReRevNAct", "Retirement with Revenue (Net)"],
  ["ReNBVeAct", "Leave with Expense NBV (Gross)"], ["ReNBVrAct", "Leave with Revenue NBV (Gross)"],
  ["RevReAct", "Revenue Account for Retirement"], ["ClearAccRe", "Revenue Clearing Account"]];
const DPR_METH = { SL: "Straight Line", SP: "Straight Line Period Control", DB: "Declining Balance", MD: "Multilevel",
  NO: "No Depreciation", IW: "Immediate Write-Off", SD: "Special Depreciation" };
const PLANNING = { N: "None", M: "MRP" };
const PROCURE = { B: "Buy", M: "Make" };
const BP_TYPE = { C: "Customer", S: "Vendor" };
const BP_CARD = { ...BP_TYPE, L: "Lead" };
const ITEM_TYPE = { I: "Item", L: "Labor", T: "Travel", F: "Fixed Asset" };
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
// keterangan tabel: nama resmi dari SAP B1 REFDB (sap-tables.js), daftar lokal TABLE_NAMES sebagai cadangan
const tableLabel = id => { const n = tableName(id) || TABLE_NAMES[id]; return n ? `${esc(id)}<span class="raw">${esc(n)}</span>` : esc(id); };

// 2.2 Akun default per kategori periode (Service Layer PeriodCategory), dikelompokkan sesuai tab layar G/L Account Determination.
// Field yang namanya tidak jelas sengaja tidak diambil.
const GL_TABS = {
  Sales: [
    ["Domestic Accounts Receivable", "DebitorsFollowUpAccount"], ["Foreign Accounts Receivable", "ForeignAccountsReceivables"],
    ["Revenue Account", "DefaultSaleAccount"], ["Sales Credit Account", "SalesCreditAcc"],
    ["Down Payment Clearing Account", "DownPaymentSClearingAcct"], ["Overpayment A/R Account", "OverpaymentsARAccount"],
    ["Underpayment A/R Account", "UnderpaymentsARAccount"], ["Realized Exchange Diff. Gain", "ARGainRealizedExchngeDif"],
    ["Realized Exchange Diff. Loss", "ARLossRealizedExchangeDi"]],
  Purchasing: [
    ["Domestic Accounts Payable", "CreditorsFollowUpAccount"], ["Allocation Account (GRPO clearing)", "AllocationAcc"],
    ["Goods Clearing Account", "GoodsClearingAcc"], ["Expense Clearing Account", "ExpenseClearingAccount"],
    ["Price Difference Account", "PriceDifferenceAccount"], ["Expense Variance Account", "ExpenseVarianceAccount"],
    ["Down Payment Clearing Account", "DownPaymentPClearingAcct"], ["Overpayment A/P Account", "OverpaymentsAPAccount"],
    ["Underpayment A/P Account", "UnderpaymentsAPAccount"], ["Realized Exchange Diff. Gain", "APGainRealizedExchngeDif"],
    ["Realized Exchange Diff. Loss", "APLossRealizedExchangeDif"]],
  General: [
    ["Rounding Account", "RoundingAccount"], ["Exchange Rate Differences", "ExchangeRateDifferencesAcct"],
    ["Period-End Closing Account", "EOYControlAccount"]],
  Inventory: [
    ["Inventory Account", "StockAccount"], ["Cost of Goods Sold", "CostOfGoodsSold"], ["Sales Returns Account", "SalesReturns"],
    ["Inventory Offset - Increase", "InventoryOffsetIncrease"], ["Inventory Offset - Decrease", "InventoryOffsetDecrease"],
    ["Increase G/L Account", "IncreaseGLAccount"], ["Decrease G/L Account", "DecreaseGLAcc"],
    ["WIP Inventory Account", "WIPMaterialAccount"], ["WIP Inventory Variance Account", "WIPMaterialVarianceAccount"]]
};
// Akun persediaan per warehouse (OWHS) / item group (OITB), urutan sesuai tab Accounting di master-nya.
const WHS_ACCTS = [["BalInvntAc", "Inventory"], ["SaleCostAc", "COGS"], ["TransferAc", "Allocation"], ["VarianceAc", "Variance"],
  ["PriceDifAc", "Price Diff."], ["DecreasAc", "Decrease"], ["IncreasAc", "Increase"], ["ReturnAc", "Returns"],
  ["RevenuesAc", "Revenue"], ["StkInTnAct", "Stock in Transit"], ["WipAcct", "WIP"]];
const glMethod = d => one(d.method).GLMethod;

// ---------- UDF Management: kategori & object seperti di layar SAP ----------
const UDF_CATS = ["Master Data", "Marketing Documents", "Payments", "Production", "Accounting", "Costing", "Budget", "Opportunities", "Service",
  "Inventory", "Value Added Tax", "Fixed Assets", "Workflow", "Project Management", "Landed Costs", "Human Resources"];
// Object di UDF Management, dikenali dari tabel wakil grupnya. Tabel lain jatuh ke kategori menurut modul REFDB.
const UDF_OBJECTS = {
  OINV: ["Marketing Documents", "Title"], INV1: ["Marketing Documents", "Rows"], INV12: ["Marketing Documents", "Tax Extension"],
  ORCT: ["Payments", "Title"], RCT2: ["Payments", "Invoices"],
  OCRD: ["Master Data", "Business Partners"], CRD1: ["Master Data", "Business Partners - Addresses"], OCPR: ["Master Data", "Contact Persons"],
  OITM: ["Master Data", "Items"], OACT: ["Master Data", "G/L Accounts"], OWHS: ["Master Data", "Warehouses"], OUOM: ["Master Data", "Units of Measure"],
  OCRY: ["Master Data", "Countries"], OADM: ["Master Data", "Company Details"], OBCD: ["Master Data", "Bar Codes"], ECM2: ["Marketing Documents", "Electronic Transactions"],
  OWOR: ["Production", "Production Order"], WOR1: ["Production", "Production Order - Rows"], OITT: ["Production", "Bill of Materials"],
  ITT1: ["Production", "Bill of Materials - Rows"], OFCT: ["Production", "Sales Forecast"],
  OJDT: ["Accounting", "Journal Entry"], JDT1: ["Accounting", "Journal Entry - Rows"], OPRC: ["Costing", "Profit Centers"],
  OBTN: ["Inventory", "Serial and Batch Numbers"], OPKL: ["Inventory", "Pick List"], OVTG: ["Value Added Tax", "Tax Groups"],
  OACS: ["Fixed Assets", "Asset Classes"], OPMG: ["Project Management", "Projects"], OIPF: ["Landed Costs", "Title"], OHEM: ["Human Resources", "Employees"],
  OSCL: ["Service", "Service Calls"], OOPR: ["Opportunities", "Sales Opportunities"],
};
const MODULE_CAT = { "Business Partners": "Master Data", "Marketing Documents": "Marketing Documents", Banking: "Payments", Finance: "Accounting",
  "Inventory and Production": "Inventory", MRP: "Production", "Sales Opportunities": "Opportunities", Service: "Service",
  "Human Resources": "Human Resources", Administration: "Master Data", General: "Master Data" };
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
// Tabel dengan definisi UDF identik = satu object (SAP menyimpan salinan definisi di tiap tabel, mis. semua dokumen)
function udfObjects(fields) {
  const byTable = {};
  fields.forEach(f => (byTable[f.TableID] ||= []).push(f));
  const groups = {};
  Object.entries(byTable).forEach(([t, list]) => {
    const sig = list.map(f => `${f.Field}|${f.Descr}|${f.TypeID}|${f.SizeID}`).sort().join("~");
    (groups[sig] ||= []).push(t);
  });
  return Object.values(groups).map(tables => {
    tables.sort();
    const rep = tables.find(t => UDF_OBJECTS[t]) || tables.find(t => /^O/.test(t)) || tables[0];
    const known = UDF_OBJECTS[rep], main = mainTable(rep) || rep;
    return { tables, fields: byTable[rep], name: known ? known[1] : tableName(rep) || rep,
      cat: known ? known[0] : MODULE_CAT[tableModule(main)] || "Lainnya" };
  }).sort((a, b) => UDF_CATS.indexOf(a.cat) - UDF_CATS.indexOf(b.cat) || a.name.localeCompare(b.name));
}

// ---------- tampilan master data: daftar kiri + detail kanan (dipakai BP & Item) ----------
// o.item(r): isi baris daftar · o.text(r): teks yang dicari · o.detail(r): isi panel kanan · o.dim(r): baris redup (inactive)
// o.chips: [{ label, test, title }] (chip pertama = semua) · o.select: { label, options: [[nilai, teks]], key(r) }
// o.checks: [{ label, test }] (dicentang = hanya baris yang lolos test) · o.noun: kata benda untuk hitungan
function listDetail(id, rows, o) {
  const items = rows.map((r, i) => `<button type="button" class="md-item${o.dim && o.dim(r) ? " off" : ""}" data-i="${i}">${o.item(r)}</button>`).join("");
  const chips = o.chips || [], checks = o.checks || [];
  onMount(() => {
    const box = $(`#${id}`); if (!box) return;
    const pane = $(".md-pane", box), all = $$(".md-item", box), q = $("input[type=search]", box), cnt = $(".md-count", box);
    const sel = $("select", box), boxes = $$("[data-chk]", box), text = rows.map(r => o.text(r).toLowerCase());
    let chip = chips[0];
    const show = el => { all.forEach(x => x.classList.toggle("on", x === el)); pane.innerHTML = o.detail(rows[+el.dataset.i]); };
    const apply = () => {
      const t = q.value.toLowerCase().trim(), sv = sel ? sel.value : "";
      let n = 0, first = null;
      all.forEach((x, i) => {
        const r = rows[i];
        const ok = text[i].includes(t) && (!chip || !chip.test || chip.test(r)) && (!sv || String(o.select.key(r)) === sv)
          && boxes.every((b, j) => !b.checked || checks[j].test(r));
        x.hidden = !ok; if (ok) { n++; first = first || x; }
      });
      cnt.textContent = `${n.toLocaleString("id-ID")} dari ${all.length.toLocaleString("id-ID")} ${o.noun}`;
      const cur = all.find(x => x.classList.contains("on"));
      if (!first) pane.innerHTML = `<p class="md-blank">Tidak ada ${o.noun} yang cocok dengan filter.</p>`;
      else if (!cur || cur.hidden) show(first);
    };
    $$(".chip", box).forEach((c, i) => c.onclick = () => { chip = chips[i]; $$(".chip", box).forEach(x => x.setAttribute("aria-pressed", x === c)); apply(); });
    $(".md-list", box).onclick = e => { const el = e.target.closest(".md-item"); if (el) show(el); };
    q.oninput = apply; if (sel) sel.onchange = apply; boxes.forEach(b => b.onchange = apply);
    apply();
  });
  return `<div class="md-view" id="${id}">
    ${chips.length ? `<div class="chips">${chips.map((c, i) => `<button type="button" class="chip" aria-pressed="${!i}"${c.title ? ` title="${esc(c.title)}"` : ""}>${esc(c.label)}<b>${rows.filter(r => !c.test || c.test(r)).length.toLocaleString("id-ID")}</b></button>`).join("")}</div>` : ""}
    <div class="toolbar"><input type="search" placeholder="${esc(o.placeholder || "Cari…")}" aria-label="Cari ${esc(o.noun)}">
      ${o.select ? `<select aria-label="${esc(o.select.label)}"><option value="">Semua ${esc(o.select.label.toLowerCase())}</option>${o.select.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}</select>` : ""}
      ${checks.map((c, j) => `<label><input type="checkbox" data-chk="${j}"> ${esc(c.label)}</label>`).join("")}
      <span class="md-count muted"></span></div>
    <div class="md-split"><div class="md-list" aria-label="Daftar ${esc(o.noun)}">${items}</div><div class="md-pane" aria-live="polite"></div></div>
  </div>`;
}
// Field terisi tampil sebagai daftar ke bawah; yang kosong dikumpulkan jadi satu baris supaya tidak penuh "belum diisi".
// pairs: [label, nilai mentah, fmt opsional]
function fieldList(pairs) {
  const filled = pairs.filter(([, v]) => !isEmpty(v)), blank = pairs.filter(([, v]) => isEmpty(v)).map(([l]) => l);
  return (filled.length ? kv(filled.map(([l, v, f]) => [l, f ? f(v) : esc(v)])) : "")
    + (blank.length ? `<p class="md-blank">Belum diisi: ${blank.map(esc).join(", ")}</p>` : "");
}
// kepala panel detail: judul + badge, baris info, lalu isi tambahan
const mdHead = (title, badges, meta) => `<div class="md-head"><h3>${esc(title)}</h3>${badges.join("")}</div>
  <div class="md-meta">${meta.filter(Boolean).join(" · ")}</div>`;

// ---------- Business Partner ----------
const BP_BIZ = { C: "Company", I: "Private", G: "Government", E: "Employee" };
const ADDR_TYPE = { B: "Bill To", S: "Ship To" };
const money = v => esc((+v).toLocaleString("id-ID"));
const dash = v => isEmpty(v) ? `<span class="muted">–</span>` : esc(v);
const acctPair = (code, name) => `<span class="acct">${esc(code)}<small>${esc(name || "akun tidak ditemukan")}</small></span>`;
const bpNoBranch = b => b.frozenFor !== "Y" && isEmpty(b.Branches);
// ctx: { contacts, addresses (Map CardCode -> baris), udf (metadata UDF OCRD), branches (semua nama branch) }
function bpDetail(b, ctx) {
  const cp = ctx.contacts.get(b.CardCode) || [], ad = ctx.addresses.get(b.CardCode) || [];
  const assigned = new Set(String(b.Branches || "").split("|").filter(Boolean));
  const head = mdHead(b.CardName, [`<span class="badge info">${esc(BP_CARD[b.CardType] || b.CardType)}</span>`,
      b.frozenFor === "Y" ? `<span class="badge">Inactive</span>` : `<span class="badge yes">Active</span>`],
    [esc(b.CardCode), esc(b.GroupName || "–"), b.Currency === "##" ? "All Currencies" : esc(b.Currency || ""),
      b.LicTradNum ? `NPWP ${esc(b.LicTradNum)}` : "", b.CardFName && b.CardFName !== b.CardName ? `Foreign name: ${esc(b.CardFName)}` : ""])
    + `<div class="md-label">Branch Assignment</div>
    <div class="bp-branches">${ctx.branches.map(br => assigned.has(br)
      ? `<span class="bp-br y"><b>✓</b>${esc(br)}</span>` : `<span class="bp-br n"><b>–</b>${esc(br)}</span>`).join("")}
      ${assigned.size ? "" : `<span class="badge warn">Belum di-assign ke branch, BP tidak bisa dipakai di dokumen</span>`}</div>`;
  const list = [
    ["General", fieldList([["Tel 1", b.Phone1], ["Tel 2", b.Phone2], ["Mobile Phone", b.Cellular], ["Fax", b.Fax], ["E-Mail", b.E_Mail],
      ["Web Site", b.IntrntSite], ["Shipping Type", b.ShipType], ["Type of Business", BP_BIZ[b.CmpPrivate] || b.CmpPrivate],
      ["Contact Person", b.CntctPrsn], ["Sales Employee", /^-No .*-$/.test(b.SlpName || "") ? null : b.SlpName], ["Alias Name", b.AliasName], ["Remarks", b.Free_Text]])],
    [`Contact Persons · ${cp.length}`, cp.length ? table([{ key: "Name", label: "Contact ID" }, { key: "Position", label: "Position", fmt: dash },
      { key: "Tel1", label: "Tel 1", fmt: dash }, { key: "Cellolar", label: "Mobile", fmt: dash }, { key: "E_MailL", label: "E-Mail", fmt: dash },
      { key: "Active", label: "Active", fmt: badgeYN }], cp, { noExport: 1 }) : `<p class="md-blank">Belum ada contact person.</p>`],
    [`Addresses · ${ad.length}`, ad.length ? `<div class="bp-addr">${ad.map(a => `<div><div class="bp-addr-h"><b>${esc(a.Address)}</b>
        <span class="badge ${a.AdresType === "B" ? "info" : ""}">${esc(ADDR_TYPE[a.AdresType] || a.AdresType)}</span></div>
        <div>${[a.Street, a.Block].filter(Boolean).map(esc).join(", ") || `<span class="muted">jalan belum diisi</span>`}</div>
        <div class="muted">${[a.City, a.County, a.State, a.ZipCode, a.Country].filter(Boolean).map(esc).join(" · ")}</div></div>`).join("")}</div>`
      : `<p class="md-blank">Belum ada alamat.</p>`],
    ["Payment Terms", fieldList([["Payment Terms", b.PymntGroup], ["Price List", b.PriceList],
      ["Total Discount %", +b.Discount ? b.Discount : null, money], ["Credit Limit", +b.CreditLine ? b.CreditLine : null, money],
      ["Commitment Limit", +b.DebtLine ? b.DebtLine : null, money]])],
    ["Payment Run", fieldList([["House Bank", b.HouseBank], ["House Bank Account", b.HousBnkAct], ["Default Payment Method", b.PymCode],
      ["Payment Methods", b.PymMethods, v => tags(v)]])],
    ["Accounting", fieldList([[b.CardType === "S" ? "Accounts Payable" : "Accounts Receivable", b.DebPayAcct, v => acctPair(v, b.DebPayName)],
      ["Down Payment Clearing Account", b.DpmClear, v => acctPair(v, b.DpmClearName)]])],
    ...(ctx.udf.length ? [["UDF", fieldList(ctx.udf.map(u => [u.label, b[u.col] === "-" ? null : b[u.col]]))]] : [])
  ];
  return head + tabs("bp-detail", list);
}
// satu tab Customer / Vendor
function bpView(t, name, list, groups, ctx) {
  const grps = groups.filter(g => g.GroupType === t), noBr = list.filter(bpNoBranch).length;
  return kpis([[list.length, name + (t === "C" ? " & lead" : "")], [grps.length, "Group"], [list.filter(b => b.frozenFor === "Y").length, "Inactive"],
      [noBr, "Aktif tanpa branch"]])
    + listDetail(`bpv-${t}`, list, {
      noun: name.toLowerCase(), placeholder: "Cari kode / nama / NPWP / telepon…",
      chips: [{ label: "Semua group" }, ...grps.map(g => ({ label: g.GroupName, test: b => b.GroupCode === g.GroupCode,
        title: `Kode ${g.GroupCode} · Price list: ${g.PriceListName || "–"}${g.Locked === "Y" ? " · dikunci" : ""}` }))],
      checks: [{ label: `Hanya tanpa branch${noBr ? ` (${noBr})` : ""}`, test: bpNoBranch }, { label: "Sembunyikan inactive", test: b => b.frozenFor !== "Y" }],
      dim: b => b.frozenFor === "Y",
      text: b => [b.CardCode, b.CardName, b.CardFName, b.GroupName, b.LicTradNum, b.Phone1].filter(Boolean).join(" "),
      item: b => `<span class="md-name">${esc(b.CardName)}</span>
        <span class="md-sub">${esc(b.CardCode)}${b.CardType === "L" ? " · Lead" : ""} · ${esc(b.GroupName || "–")}</span>
        <span class="md-flags">${bpNoBranch(b) ? `<span class="badge warn">Tanpa branch</span>` : ""}${b.frozenFor === "Y" ? `<span class="badge">Inactive</span>` : ""}</span>`,
      detail: b => bpDetail(b, ctx)
    });
}

// ---------- Item Master Data ----------
// Baris item memakai alias kolom query items/01_items.sql. Angka 0 (dimensi, berat) dianggap kosong.
const nz = v => isEmpty(v) || !+v ? null : v;
const qty = v => esc((+v).toLocaleString("id-ID", { maximumFractionDigits: 6 }));
const yn = v => v === "Y" ? "Ya" : v === "N" ? "Tidak" : v;
function itemDetail(r, udf) {
  const flag = (c, l) => r[c] === "Y" ? `<span class="badge info">${l}</span>` : "";
  const statusBadge = r.Status === "Active" ? `<span class="badge yes">Active</span>` : `<span class="badge">${esc(r.Status)}</span>`;
  const head = mdHead(r.Description, [statusBadge, flag("Inventory Item", "Inventory"), flag("Sales Item", "Sales"), flag("Purchasing Item", "Purchasing")],
    [esc(r["Item No."]), esc(r["Item Group"] || "–"), r["Item Type"] !== "Items" ? esc(r["Item Type"]) : "",
      `UoM Group ${esc(r["UoM Group"] || "–")}`, r["Foreign Name"] ? `Foreign name: ${esc(r["Foreign Name"])}` : ""]);
  // dimensi kemasan: tampil satu baris "P × L × T" kalau ada yang terisi
  const dims = p => { const v = ["Length", "Width", "Height"].map(k => +r[`${p} ${k}`] || 0); return v.some(Boolean) ? v.map(x => x.toLocaleString("id-ID")).join(" × ") : null; };
  const unitData = (p, pre) => [
    [`${pre} UoM`, r[`${p === "Purch." ? "Purchasing" : "Sales"} UoM Name`]],
    [`Items per ${pre} Unit`, nz(r[`Items per ${p === "Purch." ? "Purchasing" : "Sales"} Unit`]), qty],
    [`Packaging UoM`, r[`${p === "Purch." ? "Purch." : "Sales"} Packaging UoM Name`]],
    [`Qty per Package`, nz(r[`${p} Qty per Package`]), qty],
    ["Length × Width × Height", dims(p)],
    ["Volume", nz(r[`${p} Volume`]), v => `${qty(v)} ${esc(r[`${p} Volume Unit`] || "")}`],
    ["Weight", nz(r[`${p} Weight`]), qty]];
  const list = [
    ["General", fieldList([["Withholding Tax Liable", yn(r["Withholding Tax Liable"])], ["Manage Item by", r["Manage Item by"]],
      ["Management Method", r["Manage Item by"] === "None" ? null : r["Management Method"]], ["Status", r.Status],
      ["Status From", r["Status From"]], ["Status To", r["Status To"]], ["Status Remarks", r["Status Remarks"]]])],
    ["Purchasing Data", fieldList([...unitData("Purch.", "Purchasing"), ["Customs Group", r["Customs Group"]], ["Tax Group", r["Purchase Tax Group"]]])],
    ["Sales Data", fieldList([...unitData("Sales", "Sales"), ["Tax Group", r["Sales Tax Group"]]])],
    ["Inventory Data", fieldList([["Set G/L Accounts By", r["Set G/L Accounts By"]], ["Inventory UoM", r["Inventory UoM Name"]],
      ["Weight", nz(r["Inventory Weight"]), qty], ["Valuation Method", r["Valuation Method"]], ["Manage Inventory by Warehouse", yn(r["Manage Inventory by Whse"])]])],
    ["Planning Data", fieldList([["Planning Method", r["Planning Method"]], ["Procurement Method", r["Procurement Method"]]])],
    ["Production Data", fieldList([["Phantom Item", yn(r["Phantom Item"])], ["Issue Method", r["Issue Method"]]])],
    ...(udf.length ? [["UDF", fieldList(udf.map(u => [u.label, r[u.col] === "-" ? null : r[u.col]]))]] : [])
  ];
  return head + tabs("item-detail", list);
}

export const PAGES = {
  // ================= 2. Keuangan =================
  "coa": {
    lead: "Struktur akun perusahaan: drawer, akun judul (title), dan akun posting. Akun control dan akun kas ditandai.",
    menu: "Financials › Chart of Accounts",
    tables: ["OACT", "OBPL"],
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
            { key: "Finanse", label: "Kas", fmt: v => v === "Y" ? `<span class="badge yes">Kas</span>` : "" },
            { key: "Branches", label: "Branch", fmt: v => tags(v, { none: "Semua branch" }) }, ...udfCols(d.accounts)],
            rows, { filterKey: "Drawer", filterLabel: "drawer" }),
          { no: "2.1.2", lead: "Huruf tebal = akun judul (tidak bisa diposting). Indentasi mengikuti level akun. Branch kosong = akun tidak dibatasi ke branch tertentu." });
    }
  },

  "gl-determination": {
    sl: "period-category", withSql: true,
    lead: "Akun G/L yang otomatis dipakai SAP saat transaksi diposting, termasuk account determination aset tetap. Ini yang menentukan jurnal dari setiap dokumen.",
    menu: "Administration › Setup › Financials › G/L Account Determination · Fixed Assets › Account Determination",
    tables: ["Service Layer: PeriodCategory", "OADM", "OADT", "OACS", "OACT"],
    checks(d) {
      const out = [];
      // akun persediaan per item group / warehouse dicek di halaman Item Group / Warehouse
      const used = new Set(rowsOf(d.fa_classes).map(c => c.AcctDtn).filter(Boolean));
      const unused = rowsOf(d.fa_determination).filter(x => !used.has(x.Code) && !isEmpty(x.BalanceAct)).map(x => x.Code);
      if (unused.length) out.push(["info", `Account determination aset tetap yang sudah berisi akun tapi belum dipakai asset class mana pun: ${unused.join(", ")}.`]);
      return out;
    },
    render(d) {
      const names = acctNames(d), p = one(d.sl), acct = acctCell(names);
      const glSettings = tab => settings(GL_TABS[tab].map(([label, f]) => ({ label, col: `PeriodCategory.${f}`, fmt: x => acctLabel(names, x[f]) })),
        p, `gl-${tab.toLowerCase()}`, { emptyText: "None" });
      const method = glMethod(d), methodTxt = `Setting <b>Set Inventory Method By = ${esc(GL_METHOD[method] || method || "?")}</b> (1.2 General Settings)`;
      let inv;
      if (method === "C") {
        inv = section("item-groups", "Akun Persediaan per Item Group", `<p class="sec-lead">${methodTxt}, jadi akun persediaan diambil dari master item group (tab Accounting).
          Daftar akunnya ada di halaman <a href="#/item-groups">Item Group</a> (klik baris item group).</p>`, { level: 3 });
      } else if (method === "W") {
        inv = section("warehouses", "Akun Persediaan per Warehouse", `<p class="sec-lead">${methodTxt}, jadi akun persediaan diambil dari master warehouse (tab Accounting).
          Daftar akunnya ada di halaman <a href="#/warehouses">Warehouse</a> (klik baris warehouse).</p>`, { level: 3 });
      } else {
        inv = section("item-level", "Akun Persediaan per Item", `<p class="sec-lead">${methodTxt}, jadi akun persediaan diatur di master data setiap item.</p>`, { level: 3 });
      }

      // tab Fixed Assets: account determination aset tetap + asset class yang memakainya
      const classes = rowsOf(d.fa_classes);
      const lacking = x => classes.some(c => c.AcctDtn === x.Code
        && (c.DprMeth === "NO" ? FA_REQUIRED.slice(0, 1) : FA_REQUIRED).some(([k]) => isEmpty(x[k])));
      const dtn = rowsOf(d.fa_determination).map(x => ({ ...x,
        UsedBy: [...new Set(classes.filter(c => c.AcctDtn === x.Code).map(c => c.Name))].join("|") || null }));
      const fa = section("fa-determination", "Account Determination Aset Tetap", table([{ key: "Code", label: "Kode" }, { key: "Descr", label: "Deskripsi" },
          { key: "UsedBy", label: "Dipakai asset class", fmt: v => tags(v, { none: "Belum dipakai" }) },
          ...FA_ACCTS.map(([k, label]) => ({ key: k, label, fmt: acct })), ...udfCols(d.fa_determination)], dtn, { flag: lacking }),
        { level: 3, lead: `Administration › Setup › Fixed Assets › Account Determination. Asset class memakainya lewat kolom Account Determination di <a href="#/fixed-asset">Fixed Asset</a>. `
          + "Baris kuning = dipakai asset class tapi akun utamanya belum diisi." });

      return section("defaults", `G/L Account Determination · Periode ${esc(p.PeriodCategory || "")}`, tabs("gl-det", [
          ["Sales", glSettings("Sales")],
          ["Purchasing", glSettings("Purchasing")],
          ["General", glSettings("General")],
          ["Inventory", glSettings("Inventory") + inv],
          ["Fixed Assets", fa]
        ]), { no: "2.2.1", lead: "Dibaca lewat Service Layer dari posting period tahun berjalan. Setiap tahun periode menyimpan salinan akun ini sendiri. "
          + "Akun persediaan per item group / warehouse ada di halaman master-nya masing-masing, lihat tab Inventory." });
    }
  },

  "fixed-asset": {
    lead: "Kelas aset tetap dan master data aset. Akun G/L aset tetap (account determination) ada di <a href=\"#/gl-determination\">G/L Account Determination</a>, tab Fixed Assets.",
    menu: "Administration › Setup › Fixed Assets › Asset Classes",
    tables: ["OACS", "ACS1", "ODTP", "OADT"],
    checks(d) {
      const classes = rowsOf(d.classes), dtn = Object.fromEntries(rowsOf(d.determination).map(x => [x.Code, x])), out = [];
      // depreciation type tanpa penyusutan (mis. Tanah) tidak butuh akun penyusutan
      const noDepr = new Set(rowsOf(d.dep_types).filter(t => t.DprMeth === "NO").map(t => t.Code));
      [...new Set(classes.map(c => c.Code))].forEach(code => {
        const areas = classes.filter(c => c.Code === code), name = `${code} (${areas[0].Name})`;
        if (!areas.some(a => a.AcctDtn)) out.push(["warn", `Asset class ${name} belum punya account determination di depreciation area mana pun.`]);
        areas.filter(a => a.AcctDtn).forEach(a => {
          const x = dtn[a.AcctDtn], req = noDepr.has(a.DprTypID) ? FA_REQUIRED.slice(0, 1) : FA_REQUIRED;
          const missing = x ? req.filter(([k]) => isEmpty(x[k])).map(([, l]) => l) : [];
          if (!x) out.push(["danger", `Asset class ${name}, ${a.DprAreaID}: account determination ${a.AcctDtn} tidak ada.`]);
          else if (missing.length)
            out.push(["warn", `Asset class ${name}, ${a.DprAreaID}: account determination ${a.AcctDtn} belum lengkap akun G/L-nya (${missing.join(", ")}).`]);
        });
      });
      return out;
    },
    render(d) {
      const types = Object.fromEntries(rowsOf(d.dep_types).map(t => [t.Code, t]));
      const deprType = v => { const t = types[v]; return t ? `${esc(v)}<span class="raw">${esc(DPR_METH[t.DprMeth] || t.DprMeth)}</span>` : val(v); };
      return section("classes", "Asset Class", table([{ key: "Code", label: "Kode" }, { key: "Name", label: "Nama" },
          { key: "BPLName", label: "Branch" },
          { key: "AssetType", label: "Asset Type", fmt: codedCell(ASSET_TYPE) }, { key: "DprAreaID", label: "Depreciation Area" },
          { key: "AcctDtn", label: "Account Determination", fmt: v => isEmpty(v) ? val(v) : `<a href="#/gl-determination">${esc(v)}</a>` },
          { key: "DprTypID", label: "Depreciation Type", fmt: deprType },
          { key: "UseLife", label: "Masa manfaat (bulan)", num: 1 }, { key: "Active", label: "Aktif", fmt: badgeYN }, ...udfCols(d.classes)], rowsOf(d.classes)),
          { no: "2.13.1", lead: "Satu kelas bisa punya beberapa depreciation area (mis. komersial dan fiskal). Setiap kelas terikat ke satu branch: prefix T- = CV-TRADING, K- = CV-KOMERSIAL. "
            + "Kolom Depreciation Type ikut menampilkan metode penyusutannya." })
        + section("assets", "Fixed Asset Master Data", `<div class="placeholder"><p style="margin:0;font-weight:600;color:var(--text)">Belum dikerjakan</p>
            <p style="margin:4px 0 0">Daftar master aset tetap (item tipe Fixed Asset) per asset class akan ditampilkan di sini.</p></div>`, { no: "2.13.2" });
    }
  },

  // ================= 3. Master Data =================
  "item-groups": {
    lead: "Pengelompokan item. Menentukan metode valuasi, perencanaan (MRP), dan cara pengadaan default item baru.",
    menu: "Administration › Setup › Inventory › Item Groups",
    tables: ["OITB", "OITM", "OACT"],
    checks(d) {
      const grps = rowsOf(d.groups);
      if (grps[0]?.GLMethod !== "C") return [];
      const noInv = grps.filter(g => isEmpty(g.BalInvntAc)).map(g => g.ItmsGrpNam);
      return noInv.length ? [["warn", `Item group tanpa Inventory Account: ${noInv.join(", ")}.`]] : [];
    },
    render(d) {
      const grps = rowsOf(d.groups), method = grps[0]?.GLMethod, names = acctNames(d), acct = acctCell(names);
      // satu list: klik baris item group untuk melihat akun tab Accounting-nya (seperti layar SAP)
      const detail = g => table([{ key: "label", label: "Jenis Akun" }, { key: "code", label: "Kode Akun", fmt: val },
          { key: "name", label: "Nama Akun", fmt: v => esc(v ?? "") }],
        WHS_ACCTS.map(([c, label]) => ({ label, code: g[c], name: isEmpty(g[c]) ? null : names[g[c]] || "akun tidak ditemukan" })), { noExport: 1 });
      const filled = g => WHS_ACCTS.filter(([c]) => !isEmpty(g[c])).length;
      const noInv = g => method === "C" && isEmpty(g.BalInvntAc);
      const base = [{ key: "ItmsGrpCod", label: "Kode", num: 1 }, { key: "ItmsGrpNam", label: "Nama" },
        { key: "InvntSys", label: "Valuation Method", fmt: codedCell(VALUATION) }, { key: "PlaningSys", label: "Planning", fmt: codedCell(PLANNING) },
        { key: "PrcrmntMtd", label: "Procurement", fmt: codedCell(PROCURE) }];
      const cols = [...base,
        { key: "BalInvntAc", label: "Inventory Account", fmt: (v, g) => noInv(g) ? `<span class="badge warn">kosong</span>` : val(v) },
        { key: "Accts", label: "Akun terisi", fmt: (v, g) => `${filled(g)}/${WHS_ACCTS.length}` },
        { key: "ItemCount", label: "Jumlah item", num: 1 }, ...udfCols(d.groups)];
      // Excel: semua akun ikut sebagai kolom
      const exportCols = [...base, ...WHS_ACCTS.map(([c, label]) => ({ key: c, label, fmt: acct })), { key: "ItemCount", label: "Jumlah item", num: 1 }, ...udfCols(d.groups)];
      return section("groups", "Daftar Item Group", expandList("ig-box", cols, grps,
          { expand: detail, exportCols, flag: noInv, placeholder: "Cari item group / kode akun / nama akun…" }),
        { lead: (method === "C"
            ? "Set Inventory Method By = Item Group, jadi akun di tab Accounting item group yang dipakai saat transaksi persediaan diposting."
            : `Akun di tab Accounting item group tidak dipakai untuk posting, karena Set Inventory Method By = ${esc(GL_METHOD[method] || method || "?")} (lihat <a href="#/gl-determination">2.2 G/L Account Determination</a>, tab Inventory).`)
          + " Klik baris untuk melihat akunnya. Export Excel ikut memuat semua akun." });
    }
  },

  "items": {
    lead: "Semua item dengan field Item Master Data per tab, termasuk semua UDF (kolom UDF otomatis mengikuti CUFD; valid values tampil \"kode - deskripsi\").",
    menu: "Inventory › Item Master Data",
    tables: ["OITM", "OITB", "OUGP", "OARG", "OVTG", "OLGT", "CUFD", "UFD1"],
    render(d) {
      const items = rowsOf(d.items), udf = d.items?.udf || [], yes = c => items.filter(i => i[c] === "Y").length;
      const groups = [...new Set(items.map(i => i["Item Group"]).filter(Boolean))].sort();
      return exportButton(autoCols(d.items), items, "Item")
        + kpis([[items.length, "Total item"], [yes("Inventory Item"), "Inventory item"], [yes("Sales Item"), "Sales item"],
          [yes("Purchasing Item"), "Purchase item"], [udf.length, "UDF item"]])
        + section("list", "Daftar Item", listDetail("item-v", items, {
            noun: "item", placeholder: "Cari kode / nama / foreign name…",
            chips: [{ label: "Semua item" }, { label: "Inventory item", test: i => i["Inventory Item"] === "Y" },
              { label: "Sales item", test: i => i["Sales Item"] === "Y" }, { label: "Purchase item", test: i => i["Purchasing Item"] === "Y" },
              { label: "Non-inventory", test: i => i["Inventory Item"] !== "Y" }],
            select: { label: "Item Group", options: groups.map(g => [g, `${g} (${items.filter(i => i["Item Group"] === g).length})`]), key: i => i["Item Group"] },
            checks: [{ label: "Sembunyikan inactive", test: i => i.Status === "Active" }],
            dim: i => i.Status !== "Active",
            text: i => [i["Item No."], i.Description, i["Foreign Name"], i["Item Group"]].filter(Boolean).join(" "),
            item: i => `<span class="md-name">${esc(i.Description)}</span>
              <span class="md-sub">${esc(i["Item No."])} · ${esc(i["Item Group"] || "–")}</span>
              <span class="md-flags">${i.Status !== "Active" ? `<span class="badge">${esc(i.Status)}</span>` : ""}</span>`,
            detail: i => itemDetail(i, udf)
          }), { lead: "Pilih filter di atas, lalu klik item di daftar kiri untuk melihat detailnya seperti layar Item Master Data. Export Excel memuat semua kolom." });
    }
  },

  "warehouses": {
    lead: "Gudang per branch, beserta akun G/L di tab Accounting-nya. Setiap warehouse terikat ke satu branch.",
    menu: "Administration › Setup › Inventory › Warehouses",
    tables: ["OWHS", "OBPL", "OACT"],
    checks(d) {
      const whs = rowsOf(d.warehouses);
      if (whs[0]?.GLMethod !== "W") return [];
      const noInv = whs.filter(w => w.Inactive !== "Y" && isEmpty(w.BalInvntAc)).map(w => w.WhsCode);
      return noInv.length ? [["warn", `Warehouse aktif tanpa Inventory Account: ${noInv.join(", ")}.`]] : [];
    },
    render(d) {
      const whs = rowsOf(d.warehouses), method = whs[0]?.GLMethod, names = acctNames(d), acct = acctCell(names);
      const detail = w => table([{ key: "label", label: "Jenis Akun" }, { key: "code", label: "Kode Akun", fmt: val },
          { key: "name", label: "Nama Akun", fmt: v => esc(v ?? "") }],
        WHS_ACCTS.map(([c, label]) => ({ label, code: w[c], name: isEmpty(w[c]) ? null : names[w[c]] || "akun tidak ditemukan" })), { noExport: 1 });
      const noInv = w => method === "W" && w.Inactive !== "Y" && isEmpty(w.BalInvntAc);
      const base = [{ key: "WhsCode", label: "Kode" }, { key: "WhsName", label: "Nama" }, { key: "BPLName", label: "Branch" }];
      const flags = [{ key: "Inactive", label: "Nonaktif", fmt: badgeYN }, { key: "Locked", label: "Dikunci", fmt: badgeYN },
        { key: "BinActivat", label: "Bin", fmt: badgeYN }, ...udfCols(d.warehouses)];
      const cols = [...base, { key: "BalInvntAc", label: "Inventory Account", fmt: (v, w) => noInv(w) ? `<span class="badge warn">kosong</span>` : val(v) },
        { key: "Accts", label: "Akun terisi", fmt: (v, w) => `${WHS_ACCTS.filter(([c]) => !isEmpty(w[c])).length}/${WHS_ACCTS.length}` }, ...flags];
      const exportCols = [...base, ...flags, ...WHS_ACCTS.map(([c, label]) => ({ key: c, label, fmt: acct }))];
      const branches = [...new Set(whs.map(w => w.BPLName).filter(Boolean))];
      return kpis([[whs.length, "Warehouse"], [whs.filter(w => w.Inactive !== "Y").length, "Aktif"], [branches.length, "Branch"]])
        + section("list", "Daftar Warehouse", expandList("whs-box", cols, whs,
          { expand: detail, exportCols, flag: noInv, placeholder: "Cari warehouse / branch / kode akun / nama akun…" }),
        { lead: (method === "W"
            ? "Set Inventory Method By = Warehouse, jadi akun di tab Accounting warehouse yang dipakai saat transaksi persediaan diposting."
            : `Akun di tab Accounting warehouse tidak dipakai untuk posting, karena Set Inventory Method By = ${esc(GL_METHOD[method] || method || "?")} (lihat <a href="#/gl-determination">2.2 G/L Account Determination</a>, tab Inventory).`)
          + " Klik baris untuk melihat akunnya. Export Excel ikut memuat semua akun." });
    }
  },

  "business-partners": {
    lead: "Customer dan vendor per group, beserta price list default group dan branch yang di-assign ke tiap BP. BP hanya bisa dipakai di dokumen branch yang tercentang di tab Branches.",
    menu: "Business Partners › Business Partner Master Data · Administration › Setup › Business Partners › Customer Groups / Vendor Groups",
    tables: ["OCRD", "OCRG", "CRD8", "OBPL", "OPLN", "OCPR", "CRD1", "CRD2", "OSHP"],
    checks(d) {
      const noBranch = rowsOf(d.bp).filter(b => b.frozenFor !== "Y" && isEmpty(b.Branches)).length;
      const out = noBranch ? [["warn", `${noBranch} BP aktif belum di-assign ke branch mana pun, sehingga tidak bisa dipakai di dokumen.`]] : [];
      if (!rowsOf(d.shipping).length) out.push(["info", "Belum ada shipping type."]);
      return out;
    },
    render(d) {
      const bp = rowsOf(d.bp).map(b => ({ ...b, Type: BP_CARD[b.CardType] || b.CardType })), groups = rowsOf(d.groups);
      const byCode = rows => rows.reduce((m, r) => (m.get(r.CardCode) || m.set(r.CardCode, []).get(r.CardCode)).push(r) && m, new Map());
      const ctx = { contacts: byCode(rowsOf(d.contacts)), addresses: byCode(rowsOf(d.addresses)), udf: d.bp?.udf || [],
        branches: [...new Set(bp.flatMap(b => String(b.Branches || "").split("|")).filter(Boolean))] };
      const tab = (t, name) => {
        const list = bp.filter(b => (b.CardType === "L" ? "C" : b.CardType) === t); // lead memakai customer group
        return bpView(t, name, list, groups, ctx);
      };
      // Excel BP Master Data: satu file, satu sheet per query xl_* (sql/business-partners/1x_xl_*.sql), mengikuti tab layar BP Master Data
      const xlsx = exportSheets(sqlSheets(d, { xl_general: "General", xl_contacts: "Contact Persons", xl_addresses: "Addresses",
        xl_payment_terms: "Payment Terms", xl_bank_accounts: "Bank Accounts", xl_payment_run: "Payment Run",
        xl_accounting_general: "Accounting - General", xl_accounting_tax: "Accounting - Tax", xl_wtax_codes: "WTax Codes",
        xl_branch_assignment: "Branch Assignment" }), "BP Master Data");
      // Shipping Type hanya dipakai di BP (tab General), jadi ditampilkan di halaman ini
      const ships = rowsOf(d.shipping).map(x => ({ ...x, Used: bp.filter(b => b.ShipType === x.TrnspName).length }));
      const shipping = section("shipping", "Shipping Type", table([{ key: "TrnspCode", label: "Kode", num: 1 }, { key: "TrnspName", label: "Shipping Type" },
          { key: "WebSite", label: "Website" }, { key: "Active", label: "Aktif", fmt: badgeYN },
          { key: "Used", label: "Dipakai BP", num: 1, fmt: v => v ? num(v) : `<span class="muted">0</span>` }, ...udfCols(d.shipping)], ships, { noExport: true }),
        { lead: "Administration › Setup › General › Shipping Types. Cara pengiriman default BP (tab General), ikut terbawa ke dokumen." });
      return shipping + section("list", "Business Partner", xlsx + tabs("bp", Object.entries(BP_TYPE).map(([t, name]) => [name, tab(t, name)])),
        { lead: "Pilih group di chip atas untuk menyaring, lalu klik BP di daftar kiri untuk melihat detailnya seperti layar BP Master Data. "
          + "Arahkan kursor ke chip group untuk melihat price list default-nya. Tombol Excel mengunduh BP Master Data per tab layar SAP: "
          + "General, Contact Persons, Addresses, Payment Terms, Bank Accounts, Payment Run, Accounting - General, Accounting - Tax, WTax Codes, Branch Assignment." });
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
      { key: "PrimCurr", label: "Mata uang" }, { key: "IsGrossPrc", label: "Gross price", fmt: badgeYN }, { key: "ValidFor", label: "Aktif", fmt: badgeYN },
      ...udfCols(d.lists)], rowsOf(d.lists)))
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

  // 4.4 daftar SP + breakdown SBO_SP per object: lihat sp-validation.js
  "sp-validation": SP_PAGE,

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
    lead: "Field tambahan (prefix U_) di tabel standar SAP, dikelompokkan seperti layar User-Defined Fields - Management: per kategori lalu per object. "
      + "Satu object bisa berlaku ke banyak tabel, mis. Marketing Documents › Title berlaku ke semua dokumen (A/R Invoice, Purchase Order, dst.).",
    menu: "Tools › Customization Tools › User-Defined Fields - Management",
    tables: ["CUFD"],
    render(d) {
      const objs = udfObjects(rowsOf(d.fields));
      const cats = UDF_CATS.filter(c => objs.some(o => o.cat === c)).concat(objs.some(o => !UDF_CATS.includes(o.cat)) ? ["Lainnya"] : []);
      const cols = [{ key: "Field", label: "Title" }, { key: "Descr", label: "Description" }, { key: "TypeID", label: "Type", fmt: codedCell(UDF_TYPE) },
        { key: "SizeID", label: "Panjang", num: 1 }, { key: "Dflt", label: "Dflt" }, { key: "NotNull", label: "Mand.", fmt: badgeYN },
        { key: "RTable", label: "Linked Table", fmt: (v, r) => v ? `<code>@${esc(v)}</code>` : r.RelUDO ? `UDO ${esc(r.RelUDO)}` : "" }];
      onMount(() => {
        const q = $("#udf-q");
        if (q) q.oninput = () => $$("#udf-tree details").forEach(el => el.hidden = !el.dataset.text.includes(q.value.toLowerCase()));
      });
      const tree = cats.map(c => section(`cat-${slug(c)}`, c, objs.filter(o => (UDF_CATS.includes(o.cat) ? o.cat : "Lainnya") === c).map(o =>
        `<details class="grp" data-text="${esc([c, o.name, ...o.tables, ...o.fields.map(f => `${f.Field} ${f.Descr}`)].join(" ").toLowerCase())}">
          <summary><span>${esc(o.name)}</span><span class="muted hide-sm" title="${esc(o.tables.join(", "))}">${o.tables.length > 1 ? `${o.tables.length} tabel` : esc(o.tables[0])}</span>
            <span></span><span>${o.fields.length} UDF</span></summary>
          ${table(cols, o.fields, { noExport: 1 })}
          <p class="sec-lead" style="margin:6px 14px 12px">Berlaku di tabel: ${o.tables.map(t => `<code>${esc(t)}</code>`).join(" ")}</p>
        </details>`).join(""), { level: 3 })).join("");
      const flat = objs.flatMap(o => o.fields.map(f => ({ ...f, Cat: UDF_CATS.includes(o.cat) ? o.cat : "Lainnya", Obj: o.name, Tables: o.tables.length })));
      return kpis([[flat.length, "UDF"], [objs.length, "Object"], [cats.length, "Kategori"]])
        + section("tree", "UDF per Kategori", `<div class="toolbar"><input type="search" id="udf-q" placeholder="Cari object / field / deskripsi…"></div><div id="udf-tree">${tree}</div>`,
          { lead: "Klik object untuk melihat UDF-nya. Tabel salinan (arsip, snapshot) ikut dihitung sebagai tabel tempat object berlaku." })
        + section("fields", "Daftar Lengkap", searchable("udf-t", [{ key: "Cat", label: "Kategori" }, { key: "Obj", label: "Object" }, ...cols,
            { key: "Tables", label: "Jumlah tabel", num: 1 }], flat, { filterKey: "Cat", filterLabel: "kategori", limit: 300 }),
          { lead: "Satu baris per UDF per object (bukan per tabel), untuk dicari atau diekspor ke Excel." });
    }
  },

  "saved-queries": {
    lead: "Query buatan user di Query Manager: laporan, sumber formatted search, alert, dan KPI. Query bawaan SAP (kategori System, SAP_DASHBOARD_*, KPI_MOBILE*) tidak ditampilkan.",
    menu: "Tools › Queries › Query Manager",
    tables: ["OUQR", "OQCN"],
    render(d) {
      const allQ = rowsOf(d.queries), q = allQ.filter(x => x.IsSystem !== "Y");
      const cats = rowsOf(d.categories).filter(c => c.IsSystem !== "Y" && +c.QueryCount > 0), hidden = allQ.length - q.length;
      const note = hidden ? `<p class="sec-lead">${hidden.toLocaleString("id-ID")} query bawaan SAP disembunyikan.</p>` : "";
      return section("categories", "Kategori", table([{ key: "CatName", label: "Kategori" }, { key: "QueryCount", label: "Jumlah query", num: 1 }], cats),
          { lead: "Kategori query buatan user yang berisi query." })
        + section("queries", "Daftar Query", note + searchable("q-t", [{ key: "CatName", label: "Kategori" }, { key: "QName", label: "Nama query" },
          { key: "Len", label: "Panjang (karakter)", num: 1, fmt: num }, { key: "Created", label: "Dibuat" }, { key: "LastRun", label: "Terakhir dijalankan" }], q,
          { filterKey: "CatName", filterLabel: "kategori" }));
    }
  }
};
