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
export const rowsOf = r => r && r.rows ? r.rows.map(row => Object.fromEntries(r.columns.map((c, i) => [c, row[i]]))) : [];

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

// ---------- tabel data ----------
export function table(cols, rows, { flag } = {}) {
  return `<div class="table-wrap"><table class="data">
    <thead><tr>${cols.map(c => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${rows.map(r => `<tr class="${flag && flag(r) ? "flag" : ""}">${cols.map(c =>
      `<td class="${c.num ? "num" : ""}">${c.fmt ? c.fmt(r[c.key], r) : val(r[c.key])}</td>`).join("")}</tr>`).join("")
      || `<tr><td colspan="${cols.length}" style="text-align:center;color:var(--muted);padding:28px">Tidak ada data</td></tr>`}</tbody>
  </table></div>`;
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
      out.innerHTML = table(cols, list.slice(0, limit), { flag });
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
      <span class="count"></span></div>
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
  234000032: "Goods Return Request", 1470000049: "Asset Capitalization", 1470000060: "Asset Capitalization Credit Memo"
};
export const sapVersion = v => v && v.length >= 7 ? `${+v.slice(0, -5)}.${v.slice(-5, -3)}.${v.slice(-3)}` : v;
