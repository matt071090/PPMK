// Helper render yang dipakai semua halaman.
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
export const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
export const slug = s => String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Fungsi yang dijalankan setelah HTML halaman masuk ke DOM (pasang event untuk tabel cari, filter, dll).
const mounts = [];
export const onMount = fn => mounts.push(fn);
export const flushMounts = () => mounts.splice(0).forEach(fn => fn());

export const isEmpty = v => v === null || v === undefined || v === "";
export const empty = () => `<span class="empty">belum diisi</span>`;
export const val = v => isEmpty(v) ? empty() : esc(v);
export const YN = v => v === "Y" ? `<span class="yn y">Ya</span>` : v === "N" ? `<span class="yn n">Tidak</span>` : val(v);
export const badgeYN = v => v === "Y" ? `<span class="badge yes">Ya</span>` : v === "N" ? `<span class="badge">Tidak</span>` : val(v);
// Daftar nilai dipisah "|" (hasil STRING_AGG di SQL) -> tag. none: teks kalau kosong (default "belum diisi").
export const tags = (v, { none } = {}) => isEmpty(v) ? (none ? `<span class="tag none">${esc(none)}</span>` : empty())
  : `<span class="tags">${String(v).split("|").map(t => `<span class="tag">${esc(t)}</span>`).join("")}</span>`;
export const coded = (map, v) => map[v] ? `${esc(map[v])}<span class="raw">(${esc(v)})</span>` : val(v);
// ---------- kolom UDF dinamis (metadata "udf" dari penanda /*@udf-cols*/ di file .sql) ----------
const NUM_TYPES = /^(DECIMAL|INTEGER|SMALLINT|BIGINT|TINYINT|DOUBLE|REAL|FLOAT|SMALLDECIMAL)$/;
const numText = v => isEmpty(v) ? "" : esc(String(+v));
export const udfCols = r => (r && r.udf || []).map(u => ({ key: u.col, label: u.label, num: u.num, fmt: u.num ? numText : undefined }));
export const hasUdf = (r, col) => !!(r && r.udf || []).some(u => u.col === col);
// Semua kolom hasil query apa adanya (judul = alias kolom, UDF = deskripsi CUFD); kolom angka dari tipe kolom DB
export function autoCols(r) {
  const udf = Object.fromEntries((r && r.udf || []).map(u => [u.col, u]));
  return (r && r.columns || []).map((c, i) => {
    const u = udf[c], num = u ? u.num : NUM_TYPES.test((r.types || [])[i] || "");
    return { key: c, label: u ? u.label : c, num, fmt: num ? numText : undefined };
  });
}
// Header: nama company dari DB (OADM.CompnyName), juga dipakai di nama file export; kalau gagal tetap "No company".
// Logo = huruf depan 2 kata pertama, tanpa bentuk badan usaha (CV. Putra Prima ... -> PP).
export const company = { name: "No company" };
export function showCompanyName() {
  fetch("api/section/company-name").then(r => r.ok ? r.json() : null).then(d => {
    if (!d || !d.name) return;
    company.name = d.name;
    $("#company-name").textContent = d.name;
    const words = d.name.split(/\s+/).filter(w => !/^(CV|PT|UD|TBK)\.?$/i.test(w));
    $("#company-logo").textContent = words.slice(0, 2).map(w => w[0]).join("").toUpperCase() || "NC";
  }).catch(() => { });
}
export const rowsOf = r => r && r.rows ? r.rows.map(row => Object.fromEntries(r.columns.map((c, i) => [c, row[i]]))) : [];

// ---------- tab seperti layar SAP B1 ----------
// list: [[label, html], ...]. Tab terakhir yang dibuka diingat per id, supaya render ulang tidak balik ke tab pertama.
const activeTab = {};
export function tabs(id, list) {
  const cur = Math.min(activeTab[id] || 0, list.length - 1);
  return `<div class="tabs" data-tabs="${id}"><div class="tab-list" role="tablist">${list.map(([label], i) =>
      `<button type="button" role="tab" data-tab="${i}" aria-selected="${i === cur}">${esc(label)}</button>`).join("")}</div>
    ${list.map(([, html], i) => `<div class="tab-panel" role="tabpanel"${i === cur ? "" : " hidden"}>${html}</div>`).join("")}</div>`;
}
function showTab(box, i) {
  activeTab[box.dataset.tabs] = i;
  $$(":scope > .tab-list > button", box).forEach((b, j) => b.setAttribute("aria-selected", i === j));
  $$(":scope > .tab-panel", box).forEach((p, j) => p.hidden = i !== j);
}
document.addEventListener("click", e => {
  const b = e.target.closest(".tab-list > button[data-tab]");
  if (b) showTab(b.closest("[data-tabs]"), +b.dataset.tab);
});
// buka tab yang berisi el (dipakai sebelum scroll ke anchor hasil pencarian)
export function revealTab(el) {
  for (let p = el.closest(".tab-panel"); p; p = p.parentElement.closest(".tab-panel"))
    if (p.hidden) showTab(p.parentElement, $$(":scope > .tab-panel", p.parentElement).indexOf(p));
}

// ---------- struktur halaman ----------
export function section(id, title, body, { lead, no, src, level = 2 } = {}) {
  const h = `h${level}`;
  return `<${h} id="${id}">${no ? `<span class="no">${esc(no)}</span>` : ""}${esc(title)}<a class="anchor" href="#" data-anchor="${id}" aria-label="Tautan ke bagian ini">#</a></${h}>
    ${lead ? `<p class="sec-lead">${lead}</p>` : ""}${body}${src ? `<div class="src">Sumber: ${src}</div>` : ""}`;
}

const ICON = { warn: "!", info: "i", ok: "✓", danger: "!" };
const TAG = { warn: "Perlu dicek", info: "Info", ok: "OK", danger: "Masalah" };
// action(item) -> HTML tambahan di kanan callout (tombol exclude di edit mode). note(item) -> baris keterangan di bawah pesan.
export function callouts(list, { action, note, cls = "" } = {}) {
  if (!list.length) return "";
  return `<div class="callouts ${cls}">${list.map(item => { const [t, msg, link] = item; return `<div class="callout ${t}"><span class="ci">${ICON[t]}</span>
    <div class="ct"><b>${TAG[t]}</b>${esc(msg)}${link ? ` <a href="${link[0]}">${esc(link[1])} →</a>` : ""}${note ? note(item) : ""}</div>${action ? action(item) : ""}</div>`; }).join("")}</div>`;
}

export function kv(pairs) {
  return `<dl class="kv">${pairs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join("")}</dl>`;
}

// ---------- tabel pengaturan format blueprint (No | Pengaturan | Nilai) ----------
// rows: { label, col, type: "yn"|"opt"|"text"|"na", opts, fmt, verify, group, sub }
//   group: baris judul grup (tanpa nilai). sub: baris anak dari grup sebelumnya.
//   col: "TABEL.Kolom". Nilai diambil dari d[nama kolom], atau dari fmt(d) kalau ada.
//   verify: pemetaan kolom ↔ layar SAP belum dicek langsung.
//   opsi emptyText: teks pengganti "belum diisi" untuk nilai kosong yang memang disengaja.
export function settings(rows, d, idPrefix, { emptyText } = {}) {
  let n = 0;
  const body = rows.map(r => {
    if (r.group) return `<tr class="grp"><td class="n"></td><td colspan="2">${esc(r.group)}</td></tr>`;
    const rid = `${idPrefix}-${slug(r.label)}`;
    return `<tr id="${rid}" class="${r.sub ? "sub" : ""}"><td class="n">${++n}</td>
      <td class="lbl">${esc(r.label)}${r.verify ? `<span class="verify" title="Pemetaan kolom belum diverifikasi langsung di layar SAP B1">?</span>` : ""}
        ${r.col ? `<span class="col mono">${esc(r.col)}</span>` : ""}</td>
      <td>${settingValue(r, d, emptyText)}</td></tr>`;
  }).join("");
  return `<table class="settings"><thead><tr><th>No</th><th>Pengaturan</th><th>Nilai</th></tr></thead><tbody>${body}</tbody></table>`;
}

function settingValue(r, d, emptyText) {
  if (r.type === "na") return `<span class="na">${esc(r.note || "Kolom belum ditemukan, cek manual di SAP B1")}</span>`;
  const key = r.col ? r.col.split(".").pop() : null;
  const v = r.fmt ? r.fmt(d) : d[key];
  if (emptyText && isEmpty(v)) return `<span class="na">${esc(emptyText)}</span>`;
  if (r.type === "html") return v;
  if (r.type === "yn") return YN(v);
  if (r.type === "opt") {
    const known = Object.prototype.hasOwnProperty.call(r.opts, v);
    return `<div class="opts">${Object.entries(r.opts).map(([code, label]) =>
      `<span class="opt ${String(code) === String(v) ? "on" : ""}">${esc(label)}</span>`).join("")}
      ${!known && !isEmpty(v) ? `<span class="raw">kode ${esc(v)}</span>` : ""}${isEmpty(v) ? empty() : ""}</div>`;
  }
  return isEmpty(v) ? empty() : `<span class="vv">${esc(v)}</span>`;
}

// ---------- export Excel ----------
// Setiap tabel data mendaftarkan kolom + barisnya di sini supaya bisa diekspor persis seperti yang tampil.
// Registry dikosongkan setiap kali halaman dirender ulang (resetExports di app.js).
const exportsReg = new Map();
let exportSeq = 0;
export const resetExports = () => { exportsReg.clear(); exportSeq = 0; lazyReg.clear(); };
// detail baris expandable yang baru dirender saat pertama kali dibuka (opsi lazy di table)
const lazyReg = new Map();
let lazySeq = 0;
export const exportOf = id => exportsReg.get(id);

// Teks polos dari HTML sel: tag dipisah koma, nama akun dipisah " - ", opsi yang tidak terpilih & "belum diisi" dibuang
export function cellText(html) {
  const el = document.createElement("div");
  el.innerHTML = html;
  $$(".empty, .opt:not(.on)", el).forEach(x => x.remove());
  $$(".tag:not(:last-child)", el).forEach(t => t.append(", "));
  $$(".acct small", el).forEach(s => s.prepend(" - "));
  $$(".raw", el).forEach(s => s.prepend(" "));
  return el.textContent.replace(/\s+/g, " ").trim();
}
// Baris tabel -> baris Excel. Kolom angka diekspor sebagai angka dari nilai mentahnya.
export function exportRows(cols, rows) {
  return [cols.map(c => c.label), ...rows.map(r => cols.map(c => {
    const raw = r[c.key];
    if (c.num && raw !== null && raw !== "" && isFinite(+raw)) return +raw;
    return cellText(c.fmt ? c.fmt(raw, r) : esc(raw));
  }))];
}

const exportBtn = id => `<button type="button" class="xbtn" data-export="${id}" title="Download tabel ini sebagai file Excel">
  <svg width="13" height="13" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10m0 0l-4-4m4 4l4-4M4 16h12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Excel</button>`;

// Tombol Excel saja (tanpa tabel), untuk tampilan yang bukan tabel. title = nama sheet.
export function exportButton(cols, rows, title) {
  const id = `x${++exportSeq}`;
  exportsReg.set(id, { cols, rows });
  return `<div class="xbar">${exportBtn(id).replace("<button ", `<button data-title="${esc(title || "")}" `)}</div>`;
}

// Tombol Excel satu file berisi beberapa sheet. sheets: [{ name, cols, rows }].
export function exportSheets(sheets, title) {
  const id = `x${++exportSeq}`;
  exportsReg.set(id, { sheets });
  return `<div class="xbar">${exportBtn(id).replace("<button ", `<button data-title="${esc(title || "")}" `).replace("Excel</button>", `Excel (${sheets.length} sheet)</button>`)}</div>`;
}
// Satu sheet per file SQL halaman, kolom apa adanya dari query (autoCols). names: { keyHasilQuery: "Nama sheet" }
export const sqlSheets = (d, names) => Object.entries(names).filter(([k]) => d[k] && d[k].columns)
  .map(([k, name]) => ({ name, cols: autoCols(d[k]), rows: rowsOf(d[k]) }));

// ---------- tabel data ----------
// xid: id export tetap (dipakai searchable); allRows: baris yang diekspor kalau berbeda dari yang dirender (mis. dibatasi limit)
// expand(r): HTML detail baris; baris jadi bisa diklik untuk buka/tutup detail di bawahnya.
// exportCols: kolom Excel kalau berbeda dari kolom yang tampil (mis. isi detail ikut diekspor).
// lazy: detail baru dirender saat baris dibuka (data besar).
export function table(cols, rows, { flag, xid, allRows, noExport, expand, exportCols, lazy } = {}) {
  const id = xid || `x${++exportSeq}`;
  if (!noExport) exportsReg.set(id, { cols: exportCols || cols, rows: allRows || rows });
  const n = cols.length + (expand ? 1 : 0);
  const row = r => {
    const cells = cols.map(c => `<td class="${c.num ? "num" : ""}">${c.fmt ? c.fmt(r[c.key], r) : val(r[c.key])}</td>`).join("");
    const cls = [flag && flag(r) ? "flag" : "", expand ? "has-exp" : ""].join(" ").trim();
    return expand
      ? `<tr class="${cls}" aria-expanded="false"><td class="exp-tg"></td>${cells}</tr><tr class="exp-row" hidden>${lazy ? `<td colspan="${n}" data-lazy="${lazyKey(() => expand(r))}"></td>` : `<td colspan="${n}">${expand(r)}</td>`}</tr>`
      : `<tr class="${cls}">${cells}</tr>`;
  };
  return `${noExport || xid ? "" : `<div class="xbar">${exportBtn(id)}</div>`}<div class="table-wrap"><table class="data${expand ? " expandable" : ""}">
    <thead><tr>${expand ? "<th></th>" : ""}${cols.map(c => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(row).join("")
      || `<tr><td colspan="${n}" style="text-align:center;color:var(--muted);padding:28px">Tidak ada data</td></tr>`}</tbody>
  </table></div>`;
}
const lazyKey = fn => { const k = `l${++lazySeq}`; lazyReg.set(k, fn); return k; };
export function toggleRow(tr, open = tr.getAttribute("aria-expanded") !== "true") {
  tr.setAttribute("aria-expanded", open);
  const td = tr.nextElementSibling.firstElementChild;
  if (open && td.dataset.lazy) { td.innerHTML = lazyReg.get(td.dataset.lazy)?.() || ""; delete td.dataset.lazy; flushMounts(); }
  tr.nextElementSibling.hidden = !open;
}
document.addEventListener("click", e => {
  const tr = e.target.closest("tr.has-exp");
  if (tr && !e.target.closest("a, button, input")) toggleRow(tr);
});

// Tabel expandable + kotak cari (ikut mencari isi detail yang tertutup) + tombol Buka/Tutup semua.
export function expandList(id, cols, rows, opts = {}) {
  onMount(() => {
    const box = $(`#${id}`); if (!box) return;
    const trs = $$(":scope > .table-wrap > table > tbody > tr.has-exp", box);
    $("input[type=search]", box).oninput = e => {
      const t = e.target.value.toLowerCase();
      trs.forEach(tr => {
        const hit = (tr.textContent + " " + tr.nextElementSibling.textContent).toLowerCase().includes(t);
        tr.hidden = !hit; if (!hit) toggleRow(tr, false);
      });
    };
    $$("[data-exp-all]", box).forEach(b => b.onclick = () => trs.filter(tr => !tr.hidden).forEach(tr => toggleRow(tr, b.dataset.expAll === "1")));
  });
  return `<div id="${id}"><div class="toolbar"><input type="search" placeholder="${esc(opts.placeholder || "Cari…")}" aria-label="Cari di tabel">
      <button type="button" class="cbtn" data-exp-all="1">Buka semua</button><button type="button" class="cbtn" data-exp-all="0">Tutup semua</button></div>
    ${table(cols, rows, opts)}</div>`;
}

// Tabel dengan kotak cari + filter dropdown opsional. limit: jumlah baris maksimum yang dirender (data besar).
export function searchable(id, cols, rows, { filterKey, filterLabel, flag, limit = Infinity } = {}) {
  const opts = filterKey ? [...new Set(rows.map(r => r[filterKey]))].filter(Boolean) : [];
  onMount(() => {
    const box = $(`#${id}`); if (!box) return;
    const q = $("input", box), sel = $("select", box), out = $(".out", box), cnt = $(".count", box);
    const draw = () => {
      const t = q.value.toLowerCase(), f = sel ? sel.value : "";
      const list = rows.filter(r => (!f || r[filterKey] === f) &&
        (!t || Object.values(r).some(v => String(v ?? "").toLowerCase().includes(t))));
      // export mengikuti hasil cari/filter saat ini, tanpa batas limit tampilan
      out.innerHTML = table(cols, list.slice(0, limit), { flag, xid: id, allRows: list });
      $(".table-wrap", out).classList.add("tall");
      cnt.textContent = list.length > limit
        ? `menampilkan ${limit} dari ${list.length} baris yang cocok, persempit pencarian`
        : `${list.length} dari ${rows.length} baris`;
    };
    q.oninput = draw; if (sel) sel.onchange = draw; draw();
  });
  return `<div id="${id}">
    <div class="toolbar"><input type="search" placeholder="Cari…" aria-label="Cari di tabel">
      ${filterKey ? `<select aria-label="Filter ${esc(filterLabel)}"><option value="">Semua ${esc(filterLabel)}</option>${opts.map(o => `<option>${esc(o)}</option>`).join("")}</select>` : ""}
      <span class="count"></span>${exportBtn(id)}</div>
    <div class="out"></div></div>`;
}

// ---------- kode SAP B1 ----------
export const VALUATION = { A: "Moving Average", S: "Standard", F: "FIFO" };
export const GL_METHOD = { C: "Item Group", W: "Warehouse", L: "Item Level" };
export const DATE_FMT = { 0: "DD/MM/YY", 1: "DD/MM/CCYY", 2: "MM/DD/YY", 3: "MM/DD/CCYY", 4: "CCYY/MM/DD", 5: "DD Month YYYY", 6: "YY/MM/DD" };
export const TIME_FMT = { 0: "24H", 1: "12H (AM/PM)" };
export const PERIOD_STAT = {
  N: ["Terbuka", "yes"], S: ["Terbuka kecuali Sales", "info"], C: ["Closing Period", "warn"], Y: ["Terkunci", "danger"]
};
export const OBJECTS = {
  2: "Business Partner", 4: "Item", 13: "A/R Invoice", 14: "A/R Credit Memo", 15: "Delivery", 16: "Return",
  17: "Sales Order", 18: "A/P Invoice", 19: "A/P Credit Memo", 20: "Goods Receipt PO", 21: "Goods Return",
  22: "Purchase Order", 23: "Sales Quotation", 24: "Incoming Payment", 25: "Deposit", 30: "Journal Entry",
  46: "Outgoing Payment", 59: "Goods Receipt", 60: "Goods Issue", 67: "Inventory Transfer", 69: "Landed Costs",
  162: "Inventory Revaluation", 191: "Service Call", 202: "Production Order", 203: "A/R Down Payment",
  204: "A/P Down Payment", 10000071: "Inventory Posting", 310000001: "Inventory Opening Balance",
  1250000001: "Inventory Transfer Request", 1250000025: "Blanket Agreement", 1470000065: "Inventory Counting",
  1470000113: "Purchase Request", 540000006: "Purchase Quotation", 234000031: "Return Request",
  234000032: "Goods Return Request", 1470000049: "Asset Capitalization", 1470000060: "Asset Capitalization Credit Memo",
  // nama di bawah dari SAP B1 REFDB (sl-requests/REFDB.chm), 1470000085 dari nama series "FAAR"
  290: "Resource", 234000021: "Project Management Document", 1470000075: "Asset Manual Depreciation",
  1470000085: "Asset Revaluation", 1470000090: "Asset Transfer", 1470000094: "Asset Retirement",
  68: "Production Instructions", 132: "Correction Invoice", 163: "A/P Correction Invoice", 164: "A/P Correction Invoice Reversal",
  165: "A/R Correction Invoice", 166: "A/R Correction Invoice Reversal", 270: "A/R Monthly Invoice", 280: "A/R Tax Invoice",
  281: "A/P Tax Invoice", 140000009: "Outgoing Excise Invoice", 140000010: "Incoming Excise Invoice", 140000014: "A/P Monthly Invoice",
  253000001: "Withholding Tax Document"
};
export const sapVersion = v => v && v.length >= 7 ? `${+v.slice(0, -5)}.${v.slice(-5, -3)}.${v.slice(-3)}` : v;
