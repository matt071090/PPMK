import { zip } from "./xlsx.js";
// Baca file TXT hasil template DTW (tab-delimited) untuk langkah Setup aset tetap, dan ubah jadi baris yang sama bentuknya
// dengan hasil template Excel (lihat excelRows di pages/setup.js), jadi cek, perbandingan, dan upload memakai jalur yang sama.
// Format DTW: baris 1 = nama field, baris 2 = nama kolom DB (bisa sama), isi mulai baris 3, dipisah tab.
// File dikenali dari isi kolomnya, bukan dari nama file:
//   fixed-assets          : HEADER (ada ItemName) + DEPRE (ada DepreciationStartDate / DprStart); ATTRIBUTE dan PROJECT diabaikan
//   asset-capitalization  : CAP_HEADER (ada PostingDate) + CAP_DETAIL (ada AssetNumber), satu dokumen boleh berisi banyak aset
//   asset-manual-depreciation : MANDEP_HEADER (ada PostingDate) + MANDEP_DETAIL (ada AssetNumber, TotalLC), satu dokumen boleh berisi banyak aset

// nama kolom DTW / DB -> nama kanonik
const SYN = {
  parentkey: "ParentKey", linenum: "LineNum", itemcode: "ItemCode", itemname: "ItemName", itemsgroupcode: "ItemsGroupCode",
  purchaseitem: "PurchaseItem", salesitem: "SalesItem", inventoryitem: "InventoryItem", itemtype: "ItemType", assetclass: "AssetClass",
  assetserialnumber: "AssetSerialNumber", location: "Location",
  fiscalyear: "FiscalYear", periodcat: "FiscalYear", depreciationarea: "DepreciationArea", dprarea: "DepreciationArea",
  depreciationstartdate: "DepreciationStartDate", dprstart: "DepreciationStartDate", usefullife: "UsefulLife",
  depreciationtype: "DepreciationType", dprtype: "DepreciationType",
  docentry: "DocEntry", docnum: "DocNum", postingdate: "PostingDate", documentdate: "DocumentDate", assetvaluedate: "AssetValueDate",
  validfrom: "ValidFrom", validto: "ValidTo", distributionrule: "DistributionRule", distributionrule2: "DistributionRule2",
  distributionrule3: "DistributionRule3", distributionrule4: "DistributionRule4", distributionrule5: "DistributionRule5",
  ocrcode: "DistributionRule", ocrcode2: "DistributionRule2", ocrcode3: "DistributionRule3", ocrcode4: "DistributionRule4", ocrcode5: "DistributionRule5",
  series: "Series", remarks: "Remarks", assetnumber: "AssetNumber", quantity: "Quantity", totallc: "TotalLC",
  manualdepreciationtype: "ManualDepreciationType", transactiontype: "ManualDepreciationType"
};
const canon = n => SYN[String(n || "").trim().toLowerCase()] || null;

function parse(text, fileName) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim() !== "");
  if (lines.length < 2) throw new Error(`${fileName}: file kosong atau tidak punya 2 baris header DTW.`);
  const h1 = lines[0].split("\t"), h2 = lines[1].split("\t");
  const cols = h1.map((n, i) => canon(n) || canon(h2[i]));
  // data mulai baris 3; kalau baris 2 ternyata data (header cuma 1 baris) tidak ditangani: DTW selalu 2 baris header
  const rows = lines.slice(2).map((l, i) => {
    const cells = l.split("\t"), o = { _row: i + 3 };
    cols.forEach((c, x) => { if (c) o[c] = (cells[x] ?? "").trim(); });
    return o;
  });
  return { name: fileName, cols: new Set(cols.filter(Boolean)), rows };
}

const date8 = (v, label, err) => {
  if (!v) return "";
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v) || /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) { err(`${label} "${v}" bukan tanggal YYYYMMDD`); return ""; }
  return `${m[1]}-${m[2]}-${m[3]}`;
};
const yn = v => { const u = v.toUpperCase(); return u === "Y" || u === "TYES" ? "tYES" : u === "N" || u === "TNO" ? "tNO" : v; };
const isNum = v => v !== "" && isFinite(+v);

function fixedAssets(files) {
  const head = files.find(f => f.cols.has("ItemName")), dep = files.find(f => f.cols.has("DepreciationStartDate"));
  if (!head) throw new Error("File HEADER (kolom ItemCode, ItemName, ...) tidak ditemukan di file yang dipilih.");
  const notes = [`HEADER: ${head.name} (${head.rows.length} baris)`];
  if (!dep) notes.push("File DEPRE tidak dipilih: aset akan dibuat tanpa parameter penyusutan.");
  else notes.push(`DEPRE: ${dep.name} (${dep.rows.length} baris)`);
  const dr = files.find(f => f.cols.has("DistributionRule") || f.cols.has("DistributionRule2") || f.cols.has("DistributionRule4"));
  if (dr) notes.push(`DISTRULE (cost center): ${dr.name} (${dr.rows.length} baris)`);
  const depBy = new Map(), drBy = new Map();
  (dep ? dep.rows : []).forEach(r => { const k = (r.ParentKey || r.ItemCode || "").toUpperCase(); (depBy.get(k) || depBy.set(k, []).get(k)).push(r); });
  (dr ? dr.rows : []).forEach(r => { const k = (r.ParentKey || r.ItemCode || "").toUpperCase(); (drBy.get(k) || drBy.set(k, []).get(k)).push(r); });
  const seen = new Set();
  const rows = head.rows.filter(r => r.ItemCode).map(h => {
    const o = { _row: h._row, _errors: [] }, err = m => o._errors.push(`Baris ${h._row}: ${m}`);
    Object.assign(o, { ItemCode: h.ItemCode, ItemName: h.ItemName, ItemsGroupCode: h.ItemsGroupCode, ItemType: h.ItemType || "itFixedAssets",
      InventoryItem: yn(h.InventoryItem || "N"), SalesItem: yn(h.SalesItem || "N"), PurchaseItem: yn(h.PurchaseItem || "N"),
      AssetClass: h.AssetClass, AssetSerialNumber: h.AssetSerialNumber || "", Location: h.Location || "" });
    if (seen.has(h.ItemCode.toUpperCase())) err(`Kode aset ${h.ItemCode} dobel di file HEADER`);
    seen.add(h.ItemCode.toUpperCase());
    for (const f of ["ItemName", "ItemsGroupCode", "AssetClass"]) if (!o[f]) err(`${f} wajib diisi`);
    if (o.ItemsGroupCode && !isNum(o.ItemsGroupCode)) err(`ItemsGroupCode "${o.ItemsGroupCode}" bukan angka (kode item group)`);
    if (o.Location && !isNum(o.Location)) err(`Location "${o.Location}" bukan angka (kode location)`);
    if (o.ItemType !== "itFixedAssets") err(`ItemType "${o.ItemType}" harus itFixedAssets`);
    const lines = depBy.get(h.ItemCode.toUpperCase()) || [];
    if (dep && !lines.length) err("tidak ada baris di file DEPRE untuk aset ini");
    if (lines.length > 1) err("lebih dari satu area penyusutan di file DEPRE; belum didukung, upload satu area saja");
    if (lines.length) {
      const d = lines[0];
      o._DepreciationArea = d.DepreciationArea || ""; o._DepreciationType = d.DepreciationType || "";
      o._DepreciationStartDate = date8(d.DepreciationStartDate, "DepreciationStartDate", err);
      o._UsefulLife = d.UsefulLife || ""; o._FiscalYear = d.FiscalYear || "";
      for (const [f, l] of [["_DepreciationArea", "DepreciationArea"], ["_DepreciationType", "DepreciationType"], ["_DepreciationStartDate", "DepreciationStartDate"], ["_UsefulLife", "UsefulLife"]])
        if (!o[f]) err(`${l} wajib diisi di file DEPRE`);
      if (o._UsefulLife && !isNum(o._UsefulLife)) err(`UsefulLife "${o._UsefulLife}" bukan angka`);
    }
    const costs = drBy.get(h.ItemCode.toUpperCase()) || [];
    if (costs.length > 1) err("lebih dari satu baris cost center di file DISTRULE; belum didukung, isi satu baris per aset");
    if (costs.length) {
      const c = costs[0];
      o._ValidFrom = date8(c.ValidFrom, "ValidFrom", err); o._ValidTo = date8(c.ValidTo, "ValidTo", err);
      for (const f of ["DistributionRule", "DistributionRule2", "DistributionRule3", "DistributionRule4", "DistributionRule5"]) o["_" + f] = c[f] || "";
    }
    return o;
  });
  const orphan = [...depBy.keys()].filter(k => !seen.has(k));
  if (orphan.length) notes.push(`${orphan.length} kode di DEPRE tidak ada di HEADER: ${orphan.slice(0, 5).join(", ")}${orphan.length > 5 ? " ..." : ""}`);
  return { rows, notes };
}

function capitalization(files) {
  const head = files.find(f => f.cols.has("PostingDate")), det = files.find(f => f.cols.has("AssetNumber"));
  if (!head) throw new Error("File CAP_HEADER (kolom PostingDate, ...) tidak ditemukan di file yang dipilih.");
  if (!det) throw new Error("File CAP_DETAIL (kolom AssetNumber, Quantity, TotalLC) tidak ditemukan di file yang dipilih.");
  const notes = [`CAP_HEADER: ${head.name} (${head.rows.length} dokumen)`, `CAP_DETAIL: ${det.name} (${det.rows.length} baris aset)`];
  const detBy = new Map();
  det.rows.forEach(r => { const k = r.ParentKey || r.DocEntry || ""; (detBy.get(k) || detBy.set(k, []).get(k)).push(r); });
  const used = new Set();
  const rows = head.rows.filter(r => r.PostingDate).map(h => {
    const o = { _row: h._row, _errors: [] }, err = m => o._errors.push(`Baris ${h._row}: ${m}`);
    const key = h.DocEntry || h.DocNum || "";
    used.add(key);
    o.PostingDate = date8(h.PostingDate, "PostingDate", err);
    o.DocumentDate = date8(h.DocumentDate || h.PostingDate, "DocumentDate", err);
    o.AssetValueDate = date8(h.AssetValueDate || h.PostingDate, "AssetValueDate", err);
    if (h.Series) { o.Series = h.Series; if (!isNum(h.Series)) err(`Series "${h.Series}" bukan angka (kode series)`); }
    o.Remarks = h.Remarks || "";
    if (!o.Remarks) err("Remarks wajib diisi (dipakai untuk mencocokkan dokumen yang sudah ada)");
    const lines = (detBy.get(key) || []).map(l => ({ AssetNumber: l.AssetNumber, Quantity: l.Quantity, TotalLC: l.TotalLC }));
    if (!lines.length) err(`tidak ada baris aset di CAP_DETAIL untuk DocEntry ${key}`);
    lines.forEach(l => { if (!l.AssetNumber) err("AssetNumber kosong"); if (!isNum(l.Quantity)) err(`Quantity "${l.Quantity}" bukan angka`); if (!isNum(l.TotalLC)) err(`TotalLC "${l.TotalLC}" bukan angka`); });
    // ringkasan untuk tabel cek; baris aset lengkap disimpan di properti tak terlihat _Lines (dipakai payload untuk koleksi baris)
    o._AssetNumber = lines.map(l => l.AssetNumber).join(", ");
    o._Quantity = String(lines.reduce((a, l) => a + (+l.Quantity || 0), 0));
    o._TotalLC = String(lines.reduce((a, l) => a + (+l.TotalLC || 0), 0));
    Object.defineProperty(o, "_Lines", { value: lines, enumerable: false });
    return o;
  });
  const orphan = [...detBy.keys()].filter(k => !used.has(k));
  if (orphan.length) notes.push(`${orphan.length} DocEntry di CAP_DETAIL tidak ada di CAP_HEADER: ${orphan.slice(0, 5).join(", ")}`);
  return { rows, notes };
}

function manualDepreciation(files) {
  const head = files.find(f => f.cols.has("PostingDate")), det = files.find(f => f.cols.has("AssetNumber"));
  if (!head) throw new Error("File MANDEP_HEADER (kolom PostingDate, ...) tidak ditemukan di file yang dipilih.");
  if (!det) throw new Error("File MANDEP_DETAIL (kolom AssetNumber, TotalLC) tidak ditemukan di file yang dipilih.");
  const notes = [`MANDEP_HEADER: ${head.name} (${head.rows.length} dokumen)`, `MANDEP_DETAIL: ${det.name} (${det.rows.length} baris aset)`];
  const detBy = new Map();
  det.rows.forEach(r => { const k = r.ParentKey || r.DocEntry || ""; (detBy.get(k) || detBy.set(k, []).get(k)).push(r); });
  const used = new Set();
  const rows = head.rows.filter(r => r.PostingDate).map(h => {
    const o = { _row: h._row, _errors: [] }, err = m => o._errors.push(`Baris ${h._row}: ${m}`);
    const key = h.DocEntry || h.DocNum || "";
    used.add(key);
    o.PostingDate = date8(h.PostingDate, "PostingDate", err);
    o.DocumentDate = date8(h.DocumentDate || h.PostingDate, "DocumentDate", err);
    o.AssetValueDate = date8(h.AssetValueDate || h.PostingDate, "AssetValueDate", err);
    if (h.Series) { o.Series = h.Series; if (!isNum(h.Series)) err(`Series "${h.Series}" bukan angka (kode series)`); }
    if (h.ManualDepreciationType) o.ManualDepreciationType = h.ManualDepreciationType;
    o.DepreciationArea = h.DepreciationArea || "";
    if (!o.DepreciationArea) err("DepreciationArea wajib diisi (mis. Main Area)");
    o.Remarks = h.Remarks || "";
    if (!o.Remarks) err("Remarks wajib diisi (dipakai untuk mencocokkan dokumen yang sudah ada)");
    const lines = (detBy.get(key) || []).map(l => ({ AssetNumber: l.AssetNumber, TotalLC: l.TotalLC }));
    if (!lines.length) err(`tidak ada baris aset di MANDEP_DETAIL untuk DocEntry ${key}`);
    lines.forEach(l => { if (!l.AssetNumber) err("AssetNumber kosong"); if (!isNum(l.TotalLC)) err(`TotalLC "${l.TotalLC}" bukan angka`); });
    // ringkasan untuk tabel cek; baris aset lengkap disimpan di properti tak terlihat _Lines (dipakai payload untuk koleksi baris)
    o._AssetNumber = lines.map(l => l.AssetNumber).join(", ");
    o._TotalLC = String(lines.reduce((a, l) => a + (+l.TotalLC || 0), 0));
    Object.defineProperty(o, "_Lines", { value: lines, enumerable: false });
    return o;
  });
  const orphan = [...detBy.keys()].filter(k => !used.has(k));
  if (orphan.length) notes.push(`${orphan.length} DocEntry di MANDEP_DETAIL tidak ada di MANDEP_HEADER: ${orphan.slice(0, 5).join(", ")}`);
  return { rows, notes };
}

// ---------- template TXT untuk diunduh ----------
// Format sama dengan template DTW: baris 1 = nama field, baris 2 = nama kolom DB, baris 3 dst = isi. Satu baris contoh per file (hapus sebelum upload).
// Kode di baris contoh diambil dari DB tujuan (lihat txtContext), jadi cocok dengan company yang sedang dibuka; kalau tidak ada, dikosongkan.
// read: file yang dibaca web saat upload TXT; file lain (ATTRIBUTE, PROJECT) hanya dipakai kalau diimpor lewat DTW.
const T = (...c) => c.join("\t");
const rowsOf = r => r && r.rows ? r.rows.map(row => Object.fromEntries(r.columns.map((c, i) => [c, row[i]]))) : [];

/** Konteks kode contoh + daftar referensi dari hasil api/section/fixed-asset (results). Aman kalau sebagian query gagal. */
export function txtContext(results = {}) {
  const R = k => rowsOf(results[k]), pick = (list, re) => list.find(x => re.test(x.name)) || list[0];
  const classes = R("classes").filter(r => r.DprAreaID === "Main Area" && r.AcctDtn);
  const groups = R("item_groups").map(g => ({ code: g.ItmsGrpCod, name: g.ItmsGrpNam }));
  const locs = R("locations").map(l => ({ code: l.Code, name: l.Location }));
  const yy = String(new Date().getFullYear()).slice(2);
  const series = R("series").map(s => ({ code: s.Series, name: s.SeriesName }));
  const types = R("dep_types").map(t => ({ code: t.Code, name: t.Descr }));
  const dims = {};
  R("dimensions").filter(o => o.Active === "Y").forEach(o => (dims[o.DimCode] ||= []).push({ code: o.OcrCode, name: o.OcrName }));
  const first = x => (x && x.code !== undefined ? String(x.code) : "");
  return {
    cls: classes[0] ? classes[0].Code : "", group: first(pick(groups, /fixed|asset|aset/i)), loc: first(locs[0]),
    area: classes[0] ? classes[0].DprAreaID : "", dtype: first(types.find(t => /straight/i.test(t.code)) || types[0]),
    series: first(series.find(s => s.name && s.name.includes(yy)) || series[0]),
    o1: first((dims[1] || [])[0]), o2: first((dims[2] || [])[0]), o3: first((dims[3] || [])[0]), o4: first((dims[4] || [])[0]),
    ref: { "Asset Class (kolom AssetClass)": classes.map(c => ({ code: c.Code, name: c.Name })), "Item Group (ItemsGroupCode)": groups, "Location": locs,
      "Depreciation Type": types, "Series Capitalization (kolom Series)": series,
      ...Object.fromEntries(Object.entries(dims).map(([k, v]) => [`Distribution Rule dimension ${k} (DistributionRule${k === "1" ? "" : k})`, v])) }
  };
}

const txtTemplates = (c = {}) => ({
  "fixed-assets": [
    { file: "HEADER_NEW.txt", read: true, desc: "Master aset (OITM): kode, nama, item group, asset class, serial, location",
      rows: [T("ItemCode", "ItemName", "ItemsGroupCode", "PurchaseItem", "SalesItem", "InventoryItem", "ItemType", "AssetClass", "AssetSerialNumber", "Location"),
        T("ItemCode", "ItemName", "ItemsGroupCode", "PurchaseItem", "SalesItem", "InventoryItem", "ItemType", "AssetClass", "AssetSerialNumber", "Location"),
        T("F0223060917001", "CONTOH ASET", c.group || "", "N", "N", "N", "itFixedAssets", c.cls || "", "", c.loc || "")] },
    { file: "DEPRE_NEW.txt", read: true, desc: "Parameter penyusutan (ITM7): area, tanggal mulai YYYYMMDD, umur (bulan), tipe",
      rows: [T("ParentKey", "LineNum", "FiscalYear", "DepreciationArea", "DepreciationStartDate", "UsefulLife", "DepreciationType"),
        T("ItemCode", "LineNum", "PeriodCat", "DprArea", "DprStart", "UsefulLife", "DprType"),
        T("F0223060917001", "0", String(new Date().getFullYear()), c.area || "", "20230101", "96", c.dtype || "")] },
    { file: "ATTRIBUTE_NEW.txt", read: false, desc: "Remark aset. Dipakai DTW; belum dibaca web",
      rows: [T("ParentKey", "LineNum", "Attribute2"), T("ItemCode", "LineNum", "Remark2"), T("F0223060917001", "0", "BAIK")] },
    { file: "DISTRULE_NEW.txt", read: true, desc: "Cost center per aset (OcrCode 1-4) + masa berlaku. Opsional; kolom dimension yang tidak dipakai dikosongkan",
      rows: [T("ParentKey", "LineNum", "ValidFrom", "ValidTo", "DistributionRule", "DistributionRule2", "DistributionRule3", "DistributionRule4"),
        T("ItemCode", "LineNum", "ValidFrom", "ValidTo", "OcrCode", "OcrCode2", "OcrCode3", "OcrCode4"),
        T("F0223060917001", "0", "20230101", "20991231", c.o1 || "", c.o2 || "", c.o3 || "", c.o4 || "")] },
    { file: "PROJECT_NEW.txt", read: false, desc: "Project per aset (opsional). Dipakai DTW; belum dibaca web",
      rows: [T("ParentKey", "LineNum", "Project", "ValidFrom", "ValidTo"), T("ItemCode", "LineNum", "Project", "ValidFrom", "ValidTo"),
        T("F0223060917001", "0", "", "20230101", "20991231")] }
  ],
  "asset-capitalization": [
    { file: "CAP_HEADERNEW.txt", read: true, desc: "Dokumen Capitalization (OACQ): series, tanggal, remarks unik per dokumen",
      rows: [T("DocEntry", "DocNum", "Series", "PostingDate", "DocumentDate", "AssetValueDate", "Status", "Remarks", "DepreciationArea"),
        T("DocEntry", "DocNum", "Series", "PostingDate", "DocumentDate", "AssetValueDate", "Status", "Remarks", "DepreciationArea"),
        T("1", "1", c.series || "", "20261001", "20261001", "20260930", "adsPosted", "Opening Balance - " + (c.cls || "KELOMPOK ASET"), "*")] },
    { file: "CAP_DETAILNEW.txt", read: true, desc: "Baris aset per dokumen (ACQ1): kode aset, quantity, nilai perolehan total",
      rows: [T("ParentKey", "LineNum", "AssetNumber", "Quantity", "TotalLC"), T("DocEntry", "LineNum", "AssetNumber", "Quantity", "TotalLC"),
        T("1", "0", "F0223060917001", "1", "237376190.00")] }
  ],
  "asset-manual-depreciation": [
    { file: "MANDEP_HEADERNEW.txt", read: true, desc: "Dokumen Penyusutan Manual (OMDP): series, tanggal, area, remarks unik per dokumen. ManualDepreciationType (jenis transaksi) opsional, tambahkan kolomnya bila perlu",
      rows: [T("DocEntry", "DocNum", "Series", "PostingDate", "DocumentDate", "AssetValueDate", "DepreciationArea", "Remarks"),
        T("DocEntry", "DocNum", "Series", "PostingDate", "DocumentDate", "AssetValueDate", "DepreciationArea", "Remarks"),
        T("1", "1", c.series || "", "20261001", "20261001", "20261001", c.area || "Main Area", "Penyusutan Manual - KODE ASET")] },
    { file: "MANDEP_DETAILNEW.txt", read: true, desc: "Baris aset per dokumen (MDP1): kode aset dan jumlah penyusutan (mata uang lokal)",
      rows: [T("ParentKey", "LineNum", "AssetNumber", "TotalLC"), T("DocEntry", "LineNum", "AssetNumber", "TotalLC"),
        T("1", "0", "F0223060917001", "12352536.00")] }
  ]
});
export const hasTxtTemplate = stepId => !!txtTemplates()[stepId];

/** Zip berisi file TXT berformat DTW + satu baris contoh + BACA_SAYA.txt + REFERENSI.txt (kode dari DB). ctx = txtContext(...) atau kosong. Hasil: { blob, filename } */
export function dtwTemplateZip(stepId, title, prefix = "", ctx = null) {
  const list = txtTemplates(ctx || {})[stepId];
  if (!list) throw new Error(`Langkah '${stepId}' belum punya template TXT.`);
  const crlf = rows => rows.join("\r\n") + "\r\n";
  const readme = ["Template TXT format DTW (tab-delimited) untuk: " + title, "",
    "Baris 1 = nama field, baris 2 = nama kolom DB (jangan diubah). Isi data mulai baris 3, pisahkan kolom dengan TAB, hapus baris contoh sebelum upload.",
    "Tanggal ditulis YYYYMMDD. Kolom kunci (ParentKey / DocEntry) menghubungkan file anak ke file induknya.",
    ctx ? "Kode di baris contoh (item group, asset class, location, series, cost center) diambil dari database tujuan saat template diunduh; daftar lengkapnya di REFERENSI.txt."
      : "Kode di baris contoh dikosongkan karena daftar dari database tidak terbaca; isi sendiri.", "",
    ...list.map(f => `${f.file}  [${f.read ? "dibaca web Setup dan DTW" : "hanya DTW"}]  ${f.desc}`), "",
    "Upload lewat web: menu Setup, langkah ini, cara \"Upload file TXT DTW\", lalu pilih semua file yang dibaca web sekaligus.",
    "Upload lewat DTW: Import > Add New Data, petakan tiap file ke tabelnya (OITM, ITM7, OACQ, ACQ1, OMDP, MDP1, dst.)."];
  const refs = ctx && ctx.ref ? Object.entries(ctx.ref).flatMap(([k, v]) => ["", `## ${k}`, ...(v.length ? v.map(x => `${x.code}\t${x.name || ""}`) : ["(kosong)"])]) : null;
  const files = [...list.map(f => [f.file, crlf(f.rows)]), ["BACA_SAYA.txt", crlf(readme)]];
  if (refs) files.push(["REFERENSI.txt", crlf(["Kode yang tersedia di database tujuan (kode<TAB>nama):", ...refs])]);
  return { blob: zip(files, "application/zip"),
    filename: `${prefix ? prefix + " - " : ""}TXT DTW - ${title}.zip`.replace(/[\\/:*?"<>|]+/g, " ") };
}

const BUILDERS = { "fixed-assets": fixedAssets, "asset-capitalization": capitalization, "asset-manual-depreciation": manualDepreciation };

/** files: File[] dari input. Hasil: { rows, notes } */
export async function dtwRows(stepId, files) {
  const build = BUILDERS[stepId];
  if (!build) throw new Error(`Langkah '${stepId}' belum punya pembaca TXT DTW.`);
  const parsed = [];
  for (const f of files) parsed.push(parse(await f.text(), f.name));
  return build(parsed);
}
