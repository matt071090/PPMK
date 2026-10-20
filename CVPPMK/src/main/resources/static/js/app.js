import { $, $$, esc, slug, company, showCompanyName, callouts, flushMounts, rowsOf, table, resetExports, exportOf, exportRows, revealTab } from "./ui.js";
import { xlsxBlob, download } from "./xlsx.js";
import { PAGES as GENERAL } from "./pages/general.js";
import { PAGES as MODULES } from "./pages/modules.js";
import { PAGES as UPLOAD } from "./pages/upload.js";
import { extendPages } from "./pages/addon-sections.js";
import { addonPages, addonPage, addonEmptyPage, UNCAT } from "./pages/addon.js";

const PAGES = { ...GENERAL, ...MODULES, ...UPLOAD };
extendPages(PAGES);   // section Addon STEM / Farm Breeding di halaman UDT, UDF, Validasi SP

let chapters = [], pages = [];          // pages: daftar datar semua halaman, urut sesuai sidebar
const cache = new Map();                // id halaman -> Promise data API
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { } }
};

// ---------- data ----------
// Halaman biasa: /api/section/{id} (SQL). Halaman dengan def.sl: /api/sl/{nama}, dibungkus ke bentuk yang sama
// ({generatedAt, results: {sl: {columns, rows}}}) supaya render & checks tidak perlu tahu sumbernya.
// def.withSql: halaman memakai keduanya, hasil SQL dan Service Layer digabung.
async function getJson(url) {
  const r = await fetch(url), d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || `HTTP ${r.status}`);
  return d;
}
async function loadSl(name) {
  const d = await getJson(`api/sl/${name}`);
  if (d.error) throw new Error(`Service Layer: ${d.error}`);
  const data = Object.fromEntries(Object.entries(d.data).filter(([, v]) => v === null || typeof v !== "object"));
  return { generatedAt: d.generatedAt, results: { sl: { columns: Object.keys(data), rows: [Object.values(data)], ms: d.ms } } };
}
function load(id, fresh) {
  if (fresh || !cache.has(id)) {
    // sumber data halaman: query SQL (default), Service Layer (def.sl), License Server (def.sld); withSql = SQL ikut dimuat
    // def.addon: halaman generik bab 7 Addon, isi tabel header + child dari api/addon/data/{kode}
    const { sl, sld, withSql, addon } = PAGES[id] || {};
    const parts = addon ? [getJson(`api/addon/data/${encodeURIComponent(addon)}`)]
      : [...(!sl && !sld) || withSql ? [getJson(`api/section/${id}`)] : [], ...sl ? [loadSl(sl)] : [], ...sld ? [getJson(`api/sld/${sld}`)] : []];
    const p = Promise.all(parts).then(rs => ({ ...rs[0], results: Object.assign({}, ...rs.map(r => r.results)) }));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return cache.get(id);
}
const dataOf = res => res.results;

// Temuan halaman = cek khusus halaman + cek generik UDF: nilai yang bukan valid values (UFD1) di master data mana pun
const pageChecks = (def, d) => [...(def.checks ? def.checks(d) : []), ...udfFindings(d)];
function udfFindings(d) {
  const out = [];
  for (const r of Object.values(d || {})) for (const u of (r && r.udf) || []) {
    if (!u.values || !u.values.length) continue;
    const i = r.columns.indexOf(u.col), bad = {};
    if (i < 0) continue;
    // tampilan "kode - deskripsi" atau cukup "kode" -> valid kalau kodenya ada di valid values
    r.rows.forEach(row => {
      const v = row[i];
      if (v !== null && v !== "" && !u.values.some(c => v === c || v.startsWith(c + " - "))) bad[v] = (bad[v] || 0) + 1;
    });
    const list = Object.entries(bad);
    if (list.length) out.push(["warn", `UDF ${u.label} (${u.col}) berisi nilai di luar valid values: ${list.map(([v, n]) => `"${v}" (${n} baris)`).join(", ")}. Valid values: ${u.values.join(", ")}.`]);
  }
  return out;
}
const queryMs = res => Object.values(res.results).reduce((t, r) => t + (r.ms || 0), 0);
const queryErrors = res => Object.entries(res.results).filter(([, v]) => v.error);

// ---------- sidebar ----------
const HOME_ICON = `<svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true" style="vertical-align:-2px"><path d="M3 9.5L10 4l7 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-5V17H4a1 1 0 0 1-1-1z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round"/></svg>`;
const navItem = p => `<li><a href="#/${p.id}" data-id="${p.id}" class="${p.status === "todo" ? "todo" : ""}"${p.addon ? ` title="${esc(p.addon)}"` : ""}>
  ${p.no ? `<span class="no">${esc(p.no)}</span>` : ""}<span class="t">${esc(p.title)}</span>${p.status ? `<span class="nav-st" data-dot="${p.id}"></span>` : ""}</a></li>`;
// bab Addon: item dikelompokkan per sub kategori (urutan sudah dari addonPages), tiap sub kategori bisa dilipat
function navSubcats(list) {
  const cats = [...new Set(list.map(p => p.cat))];
  return cats.map(c => { const items = list.filter(p => p.cat === c);
    return `<li class="subcat${c === UNCAT ? " new" : ""}"><button type="button" aria-expanded="true">${esc(c)}<span class="cnt">${items.length}</span>
      <svg class="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
      <ul>${items.map(navItem).join("")}</ul></li>`; }).join("");
}
function buildNav() {
  $("#nav").innerHTML = `
    <div class="progress-box"><div class="lbl"><span>Menu sudah sesuai</span><b id="rv-count"></b></div>
      <div class="bar"><div id="rv-ok"></div><div id="rv-nok"></div></div></div>
    ${chapters.map(ch => {
      const flat = ch.pages.length === 1;
      if (flat) { // bab satu halaman: tampil sebagai satu tautan saja
        const p = ch.pages[0];
        return `<div class="nav-group flat"><a href="#/${p.id}" data-id="${p.id}" class="chapter-link ${p.status === "todo" ? "todo" : ""}">
          <span class="gno">${ch.home ? HOME_ICON : esc(ch.no || "")}</span><span>${esc(ch.title)}</span>${p.status ? `<span class="nav-st" data-dot="${p.id}"></span>` : ""}</a></div>`;
      }
      return `<div class="nav-group" data-no="${ch.no}">
        <button type="button" aria-expanded="true"><span class="gno">${esc(ch.no || "")}</span>${esc(ch.title)}
          <svg class="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
        <ul>${ch.dynamic ? navSubcats(ch.pages) : ch.pages.map(navItem).join("")}</ul>
      </div>`;
    }).join("")}
    <div class="legend">${Object.entries(REVIEW).map(([k, [lbl]]) => `<span>${stIcon(k)}${lbl}</span>`).join("")}</div>`;
  $$(".subcat > button").forEach(b => b.onclick = () => {
    const open = b.getAttribute("aria-expanded") !== "true"; b.setAttribute("aria-expanded", open); b.nextElementSibling.hidden = !open;
  });
  $$(".nav-group > button").forEach(b => b.onclick = () => {
    const g = b.parentElement; g.classList.toggle("collapsed"); b.setAttribute("aria-expanded", !g.classList.contains("collapsed"));
  });
  paintNav();
}
// ikon status & bar progres mengikuti status review manual; menu Belum direview ditandai merah (data-s="none")
function paintNav() {
  const menus = pages.filter(p => p.status), cnt = s => menus.filter(p => statusOf(p.id) === s).length;
  $$("#nav [data-dot]").forEach(d => {
    const s = statusOf(d.dataset.dot), note = review.pages[d.dataset.dot]?.note;
    d.innerHTML = `${stIcon(s)}<span class="sr">${REVIEW[s][0]}</span>`; d.title = REVIEW[s][0] + (note ? ` – ${note}` : "");
    d.closest("a").dataset.s = s;
  });
  $("#rv-count").textContent = `${cnt("ok")}/${menus.length}`;
  $("#rv-ok").style.width = `${cnt("ok") / menus.length * 100}%`;
  $("#rv-nok").style.width = `${cnt("nok") / menus.length * 100}%`;
}

// ---------- review manual: status menu, catatan & exclusion temuan ----------
// Data di server (log CSV per build, lihat ReviewController). State terkini dari GET api/review:
//   { pages: {id: {status: "ok"|"nok", note, at, by}}, exclusions: {key: {page, msg, reason, at, by}} }
// Review dimulai per halaman dari tombol Review di sebelah judul (wajib nama editor, diingat per browser);
// setiap perubahan tercatat dan bisa dilihat siapa saja lewat tombol ? (Riwayat).
const REVIEW = { ok: ["Sesuai"], nok: ["Belum sesuai"], none: ["Belum direview"] };
// ikon status beda bentuk (lingkaran centang / segitiga seru / cincin strip), tidak hanya beda warna
const ST_ICON = {
  ok: '<circle cx="10" cy="10" r="8" fill="currentColor"/><path d="M6.4 10.3l2.4 2.4 4.8-5.2" stroke="var(--surface)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  nok: '<path d="M10 2.2l8.3 14.6H1.7z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/><path d="M10 7.6v4.2" stroke="var(--surface)" stroke-width="2" stroke-linecap="round"/><circle cx="10" cy="14.4" r="1.1" fill="var(--surface)"/>',
  none: '<circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M6.6 10h6.8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'
};
const stIcon = s => `<svg class="sti ${s}" viewBox="0 0 20 20" aria-hidden="true">${ST_ICON[s]}</svg>`;
const stBadge = s => `<span class="sbadge s-${s}">${stIcon(s)}${REVIEW[s][0]}</span>`;
const ICON = {
  pencil: '<path d="M13.5 3.5l3 3L7 16H4v-3z"/>',
  help: '<circle cx="10" cy="10" r="7.5"/><path d="M7.9 7.8a2.2 2.2 0 0 1 4.2.8c0 1.5-2.1 1.8-2.1 3.1"/><circle cx="10" cy="14.4" r=".7" fill="currentColor" stroke="none"/>',
  check: '<path d="M4.5 10.5l3.5 3.5 7.5-8"/>',
  x: '<path d="M5 5l10 10M15 5L5 15"/>',
  undo: '<path d="M7 4.5L3.5 8 7 11.5"/><path d="M4 8h8a4.5 4.5 0 0 1 0 9H9"/>',
  eyeoff: '<path d="M3 3l14 14"/><path d="M8.3 5.2A7.6 7.6 0 0 1 10 5c4.5 0 7.5 5 7.5 5a13 13 0 0 1-2.2 2.7M5.7 6.6A12.7 12.7 0 0 0 2.5 10s3 5 7.5 5a7 7 0 0 0 3-.7"/>',
  note: '<path d="M5 3.5h7l3 3v10H5z"/><path d="M8 9.5h4M8 12.5h4"/>',
  user: '<circle cx="10" cy="7" r="3"/><path d="M4 17c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5"/>'
};
const ic = n => `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</svg>`;

let review = { pages: {}, exclusions: {} }, reviewLoaded = false, remarks = null;
let editPage = null;   // id halaman yang sedang direview (null = mode lihat); mati saat pindah halaman
const statusOf = id => review.pages[id]?.status || "none";
const editing = id => editPage !== null && editPage === id;
const editorName = () => store.get("editor") || "";
// key memuat teks pesan: kalau datanya berubah (mis. daftar field kosong berubah), temuan dianggap baru dan muncul lagi
const exKey = (pageId, [t, msg]) => `${pageId}|${t}|${msg}`;
const hhmm = () => new Date().toTimeString().slice(0, 5);

function toast(msg, err) {
  const t = document.createElement("div");
  t.className = `toast${err ? " err" : ""}`; t.setAttribute("role", err ? "alert" : "status");
  t.innerHTML = `${err ? "" : ic("check")}<span>${esc(msg)}</span>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), err ? 6000 : 3000);
}

async function sendReview(ev) {
  if (!reviewLoaded) throw new Error("Data review gagal dimuat. Muat ulang halaman dulu.");
  const r = await fetch("api/review/event", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ editor: editorName(), ...ev }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || `HTTP ${r.status}`);
  review = { pages: {}, exclusions: {}, ...d };
  paintNav();
}

// temuan otomatis: yang di-exclude tidak tampil lagi (jejaknya di Riwayat)
function findings(pageId, list) {
  const active = list.filter(i => !review.exclusions[exKey(pageId, i)]);
  return callouts(active, { action: editing(pageId)
    ? i => `<button type="button" class="cbtn" data-act="exclude" data-key="${esc(exKey(pageId, i))}">${ic("eyeoff")}Exclude</button>` : null });
}
const activeCount = (pageId, list) => list.filter(i => !review.exclusions[exKey(pageId, i)]).length;

// tombol di sebelah judul: Review / Selesai + ? (Riwayat)
function titleActions(page) {
  if (!page.status) return "";
  const main = editing(page.id)
    ? `<button class="t-btn primary hide-sm" type="button" data-act="rv-done">${ic("check")}<span>Selesai</span></button>`
    : `<button class="t-btn" type="button" data-act="rv-start" ${reviewLoaded ? "" : 'disabled title="Data review gagal dimuat. Muat ulang halaman."'}>${ic("pencil")}<span>Review</span></button>`;
  return `<div class="t-actions">${main}<button class="t-btn icon" type="button" data-act="rv-log" aria-label="Riwayat perubahan" title="Riwayat perubahan">${ic("help")}</button></div>`;
}

// kotak status review di bawah judul halaman
function reviewBox(page) {
  if (!page.status) return "";
  const r = review.pages[page.id] || {}, s = statusOf(page.id);
  if (!editing(page.id)) return `<div class="rv-card s-${s}"><div class="rv-top">${stBadge(s)}${r.at ? `<span class="rv-meta">oleh <b>${esc(r.by || "-")}</b>, ${esc(r.at)}</span>` : ""}</div>
    ${r.note ? `<p class="rv-note">${esc(r.note)}</p>` : r.at ? "" : `<p class="rv-note muted">Belum ada review untuk halaman ini.</p>`}</div>`;
  return `<div class="rv-box s-${s}" data-page="${page.id}" role="group" aria-label="Review halaman">
    <div class="rv-head"><span>${ic("user")}Mengedit sebagai <b>${esc(editorName())}</b> &middot; <button class="link" type="button" data-act="rv-name">Ganti</button></span><span class="saved" id="rv-saved"></span></div>
    <div class="seg" role="radiogroup" aria-label="Status review">
      ${Object.entries(REVIEW).map(([k, [lbl]]) => `<label class="s-${k}"><input type="radio" name="rv-status" value="${k}" ${k === s ? "checked" : ""}>${stIcon(k)}${lbl}</label>`).join("")}</div>
    <textarea rows="2" id="rv-note" placeholder="Catatan review, mis. alamat & NPWP menunggu data dari client" aria-label="Catatan review">${esc(r.note || "")}</textarea>
    <p class="rv-hint">Tersimpan otomatis dan tercatat di Riwayat.</p></div>`;
}
// HP: Selesai pindah ke bar bawah
const editBar = page => editing(page.id) ? `<div class="edit-bar"><span class="who">Mengedit sebagai<b>${esc(editorName())}</b></span>
  <button class="btn primary" type="button" data-act="rv-done">${ic("check")}Selesai</button></div>` : "";

async function setPageReview(id, ev) {
  try {
    await sendReview({ page: id, ...ev });
    const saved = $("#rv-saved"); if (saved) saved.innerHTML = `${ic("check")}Tersimpan ${hhmm()}`;
    $(".rv-box")?.setAttribute("class", `rv-box s-${statusOf(id)}`);
  } catch (e) { toast(`Gagal menyimpan review. ${e.message}`, true); rerender(); }
}

// render ulang halaman aktif tanpa ambil data lagi, posisi scroll dipertahankan
async function rerender() {
  const y = window.scrollY; current = null;
  await route(false, true);
  window.scrollTo(0, y);
}

// ---------- dialog nama editor ----------
function askEditor(then) {
  const page = pages.find(p => p.id === current);
  let dlg = $("#editor-dlg");
  if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "editor-dlg"; dlg.className = "dlg"; document.body.appendChild(dlg); }
  dlg.innerHTML = `<form novalidate><h3 id="editor-t">Mulai review</h3><p class="sub">${esc(page ? `${page.no ? page.no + " " : ""}${page.title}` : "")}</p>
    <label class="fld"><span>Nama editor</span><input type="text" id="editor-name" autocomplete="name" maxlength="60" value="${esc(editorName())}" aria-describedby="editor-h"></label>
    <p class="fld-msg" id="editor-h">${editorName() ? "Terisi dari browser ini. Ganti kalau bukan Anda." : "Nama ini tercatat di Riwayat untuk setiap perubahan."}</p>
    <p class="dlg-note">Perubahan status, catatan, dan exclusion dicatat atas nama ini di Riwayat.</p>
    <div class="dlg-act"><button class="btn" type="button" data-act="dlg-cancel">Batal</button><button class="btn primary" type="submit">Mulai review</button></div></form>`;
  dlg.setAttribute("aria-labelledby", "editor-t");
  const input = $("#editor-name", dlg);
  $("form", dlg).onsubmit = e => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) {
      input.classList.add("err"); $("#editor-h", dlg).className = "fld-msg err";
      $("#editor-h", dlg).textContent = "Nama editor wajib diisi. Ketik nama Anda untuk melanjutkan.";
      return input.focus();
    }
    store.set("editor", name); dlg.close(); then();
  };
  dlg.showModal(); input.focus(); input.select();
}

// ---------- Riwayat perubahan (per halaman, bisa dibuka siapa saja) ----------
const LOG_FILTER = { all: "Semua", status: "Status", note: "Catatan", ex: "Exclusion" };
let logFilter = "all";
async function openHistory(pageId) {
  const page = pages.find(p => p.id === pageId);
  let dlg = $("#history-dlg");
  if (!dlg) { dlg = document.createElement("dialog"); dlg.id = "history-dlg"; dlg.className = "history"; document.body.appendChild(dlg); }
  dlg.dataset.page = pageId;
  const shell = body => `<div class="dr-head"><div><h3>Riwayat perubahan</h3><small id="log-sub">${esc(`${page.no ? page.no + " " : ""}${page.title}`)}</small></div>
      <button class="icon-btn" type="button" data-act="log-close" aria-label="Tutup">${ic("x")}</button></div>${body}`;
  dlg.innerHTML = shell(`<div class="sk">${"<i></i>".repeat(9)}</div>`);
  if (!dlg.open) dlg.showModal();
  try {
    const list = await getJson(`api/review/log?page=${encodeURIComponent(pageId)}`);
    if (dlg.dataset.page !== pageId) return;
    const draw = () => {
      const shown = list.filter(e => logFilter === "all" || (logFilter === "ex" ? /exclude|restore/.test(e.action) : e.action === logFilter));
      dlg.innerHTML = shell(`<div class="dr-filter">${Object.entries(LOG_FILTER).map(([k, l]) => `<button class="chip ${k === logFilter ? "on" : ""}" type="button" data-f="${k}">${l}</button>`).join("")}</div>
        ${list.length ? `<ol class="logs">${shown.map(e => logRow(e, list, pageId)).join("") || `<li class="dr-state">Tidak ada perubahan untuk filter ini.</li>`}</ol>`
          : `<div class="dr-state"><b>Belum ada perubahan</b>Status, catatan, dan exclusion di halaman ini akan tercatat di sini.</div>`}
        ${!editing(pageId) && list.some(e => e.action === "exclude") ? `<div class="dr-foot">Membatalkan exclusion hanya bisa saat review.</div>` : ""}`);
      $("#log-sub", dlg).insertAdjacentText("beforeend", list.length ? ` · ${list.length} perubahan` : "");
      $$("[data-f]", dlg).forEach(b => b.onclick = () => { logFilter = b.dataset.f; draw(); });
    };
    draw();
  } catch (e) {
    dlg.innerHTML = shell(`<div class="dr-state"><div class="error">Riwayat gagal dimuat. ${esc(e.message)} <button class="cbtn" type="button" data-act="rv-log">Coba lagi</button></div></div>`);
  }
}
function logRow(e, list, pageId) {
  let icon, act, body = "";
  const msg = e.key ? e.key.split("|").slice(2).join("|") : "";
  if (e.action === "status") {
    icon = stIcon(e.to); act = `Status ${stBadge(e.from || "none")}<span class="arr">&rarr;</span>${stBadge(e.to)}`;
  } else if (e.action === "note") {
    icon = ic("note"); act = e.to ? (e.from ? "Catatan diubah" : "Catatan ditambah") : "Catatan dihapus";
    body = (e.from ? `<blockquote><s>${esc(e.from)}</s></blockquote>` : "") + (e.to ? `<p class="log-note"><span>Jadi:</span> ${esc(e.to)}</p>` : "");
  } else if (e.action === "exclude") {
    icon = ic("eyeoff"); act = "Temuan di-exclude";
    // dibatalkan = ada restore untuk temuan yang sama setelah baris ini (list urut terbaru di atas)
    const undo = list.slice(0, list.indexOf(e)).reverse().find(x => x.action === "restore" && x.key === e.key);
    const active = !undo && review.exclusions[e.key];
    body = `<blockquote>${esc(msg)}</blockquote><p class="log-note"><span>Alasan:</span> ${esc(e.note)}</p>
      <div class="log-foot">${undo ? `<span class="log-tag">Dibatalkan ${esc(undo.at)} oleh ${esc(undo.editor)}</span>`
        : active ? `<button class="cbtn" type="button" data-act="restore" data-key="${esc(e.key)}" ${editing(pageId) ? "" : 'disabled title="Mulai review dulu untuk membatalkan"'}>${ic("undo")}Batalkan</button>` : ""}</div>`;
  } else {
    icon = ic("undo"); act = "Exclusion dibatalkan"; body = `<blockquote>${esc(msg)}</blockquote><p class="log-note"><span>Temuan tampil lagi di halaman.</span></p>`;
  }
  return `<li class="log"><span class="log-ic">${icon}</span><div><div class="log-meta"><time>${esc(e.at)}</time> &middot; <b>${esc(e.editor)}</b></div>
    <div class="log-act">${act}</div>${body}</div></li>`;
}

// ---------- 1.9 Remarks (hanya mode dev): disimpan di server lewat api/review/remarks ----------
const RM = () => PAGES.remarks.remarks;
const now = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16).replace("T", " "); };
async function saveRemarks(next, redraw) {
  const old = remarks;
  remarks = { ...next, at: now() };
  try {
    const r = await fetch("api/review/remarks", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(remarks) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (redraw) rerender();
  } catch (err) { remarks = old; toast(`Gagal menyimpan remarks. ${err.message}`, true); rerender(); }
}
document.addEventListener("change", e => {
  const form = e.target.closest("#remarks-form");
  if (form) saveRemarks(RM().collect(form), false);
});
document.addEventListener("click", e => {
  const b = e.target.closest('[data-act="r-add"], [data-act="r-del"]'), form = b && b.closest("#remarks-form");
  if (!form) return;
  const r = RM().collect(form), list = r[b.dataset.list];
  if (b.dataset.act === "r-add") list.push(b.dataset.list === "facts" ? { label: "", value: "" } : { q: "", a: "" });
  else list.splice(+b.dataset.i, 1);
  saveRemarks(r, true);
});

document.addEventListener("change", e => {
  const box = e.target.closest(".rv-box"); if (!box) return;
  if (e.target.name === "rv-status") setPageReview(box.dataset.page, { action: "status", value: e.target.value });
  else if (e.target.id === "rv-note") setPageReview(box.dataset.page, { action: "note", value: e.target.value.trim() });
});

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const act = b.dataset.act, key = b.dataset.key;
  if (act === "rv-start") askEditor(() => { editPage = current; document.body.classList.add("edit"); rerender(); });
  else if (act === "rv-name") askEditor(() => rerender());
  else if (act === "rv-done") { editPage = null; document.body.classList.remove("edit"); rerender(); toast("Review selesai. Mode lihat aktif lagi."); }
  else if (act === "rv-log") openHistory(current);
  else if (act === "log-close" || act === "dlg-cancel") b.closest("dialog").close();
  else if (act === "exclude") { // form alasan muncul di dalam callout; alasan wajib karena temuan hilang dari halaman
    const callout = b.closest(".callout");
    if ($(".ex-form", callout)) return $(".ex-form input", callout).focus();
    $(".ct", callout).insertAdjacentHTML("beforeend", `<form class="ex-form" novalidate><label>Alasan exclusion</label>
      <div class="row"><input type="text" maxlength="300" placeholder="mis. sudah dikonfirmasi client tidak dipakai" aria-label="Alasan exclusion">
      <button type="submit" class="cbtn primary">Exclude</button><button type="button" class="cbtn" data-act="cancel">Batal</button></div>
      <p class="msg">Temuan akan hilang dari halaman. Bisa dibatalkan dari Riwayat.</p></form>`);
    const f = $(".ex-form", callout), input = $("input", f); input.focus();
    f.onsubmit = async ev => {
      ev.preventDefault();
      const reason = input.value.trim();
      if (!reason) { input.classList.add("err"); $(".msg", f).className = "msg err"; $(".msg", f).textContent = "Alasan wajib diisi. Tulis alasan singkat sebelum menyimpan."; return input.focus(); }
      try { await sendReview({ page: key.split("|")[0], action: "exclude", key, note: reason }); rerender(); toast("Temuan di-exclude. Jejaknya ada di Riwayat."); }
      catch (err) { toast(`Gagal menyimpan exclusion. ${err.message}`, true); }
    };
  } else if (act === "cancel") b.closest(".ex-form").remove();
  else if (act === "restore") {
    try {
      await sendReview({ page: key.split("|")[0], action: "restore", key });
      toast("Temuan dikembalikan ke halaman."); rerender();
      if ($("#history-dlg")?.open) openHistory($("#history-dlg").dataset.page);
    } catch (err) { toast(`Gagal membatalkan exclusion. ${err.message}`, true); }
  }
});

// ---------- routing ----------
function parseHash() {
  const [, id, anchor] = location.hash.match(/^#\/([^/]+)(?:\/(.+))?/) || [];
  return { id: pages.some(p => p.id === id) ? id : "ringkasan", anchor };
}
let current = null;
async function route(fresh = false, keepScroll = false) {
  const { id, anchor } = parseHash();
  if (current === id && !fresh) return scrollToAnchor(anchor);
  current = id;
  if (editPage && editPage !== id) { editPage = null; document.body.classList.remove("edit"); }   // mode review per halaman
  document.body.classList.remove("nav-open");
  $$("#nav a[data-id]").forEach(a => a.classList.toggle("active", a.dataset.id === id));
  const page = pages.find(p => p.id === id);
  const art = $("#article");
  art.classList.remove("enter"); void art.offsetWidth; art.classList.add("enter");
  art.innerHTML = head(page) + `<div class="skeleton">${"<div></div>".repeat(6)}</div>`;
  $("#toc-list").innerHTML = ""; $("#toc-meta").innerHTML = "";
  if (!keepScroll) window.scrollTo(0, 0);
  document.title = `${page.no ? page.no + " " : ""}${page.title} · Project Check List`;

  let html, meta = "";
  resetExports();
  try {
    if (id === "ringkasan") ({ html, meta } = await renderSummary(fresh));
    else if (!PAGES[id]) html = renderTodo(page);
    else if (PAGES[id].static) html = PAGES[id].render({}, { review: { ...review, remarks }, editing: editing(id) });
    else {
      const res = await load(id, fresh);
      const def = PAGES[id], d = dataOf(res), errs = queryErrors(res);
      html = (errs.length ? `<div class="error">Query gagal: ${errs.map(([k, v]) => `<b>${esc(k)}</b> – ${esc(v.error)}`).join("<br>")}</div>` : "")
        + findings(id, pageChecks(def, d)) + def.render(d);
      meta = `<span>Diperbarui ${esc(res.generatedAt.replace("T", " "))}</span><span>Query ${queryMs(res)} ms</span>`;
    }
  } catch (e) {
    html = `<div class="error">Gagal mengambil data dari SAP B1: ${esc(e.message)}</div>`;
  }
  if (current !== id) return; // user sudah pindah halaman
  const def = id === "ringkasan" ? SUMMARY : PAGES[id];
  art.innerHTML = head(page, def) + reviewBox(page) + html + pager(page) + editBar(page);
  flushMounts();
  buildToc(page, meta);
  scrollToAnchor(anchor, false);
}

function head(page, def) {
  const ch = chapters.find(c => c.pages.includes(page));
  return `<nav class="crumbs" aria-label="Breadcrumb"><span>Project Check List</span>${ch.home ? "" : `<span>${ch.no ? esc(ch.no) + ". " : ""}${esc(ch.title)}</span>`}${page.cat ? `<span>${esc(page.cat)}</span>` : ""}${page.no ? `<span>${esc(page.no)}</span>` : ""}</nav>
    <div class="title-row"><h1>${page.no ? `<span class="no">${esc(page.no)}</span>` : ""}${esc(page.title)}</h1>${titleActions(page)}</div>
    ${def ? `<p class="lead">${def.lead}</p>` : ""}
    <div class="page-meta">${def?.menu ? `<span><b>Menu SAP B1:</b> ${esc(def.menu)}</span>` : ""}${def?.tables ? `<span><b>Sumber:</b> ${def.tables.map(t => `<code>${t}</code>`).join(" ")}</span>` : ""}</div>`;
}

function pager(page) {
  const i = pages.indexOf(page), prev = pages[i - 1], next = pages[i + 1];
  const link = (p, cls, lbl) => p ? `<a class="${cls}" href="#/${p.id}"><small>${lbl}</small><b>${p.no ? p.no + " " : ""}${esc(p.title)}</b></a>` : "";
  return `<nav class="pager">${link(prev, "prev", "‹ Sebelumnya")}${link(next, "next", "Berikutnya ›")}</nav>`;
}

function renderTodo(page) {
  return `<div class="placeholder"><p style="margin:0 0 6px;font-weight:600;color:var(--text)">Halaman ini belum dikerjakan</p>
    ${page.tables ? `<p style="margin:0">Rencana sumber data: ${page.tables.map(t => `<code>${t}</code>`).join(" ")}</p>` : ""}</div>`;
}

// ---------- halaman Ringkasan ----------
async function renderSummary(fresh) {
  const ids = pages.filter(p => PAGES[p.id] && !PAGES[p.id].static).map(p => p.id);
  const results = await Promise.allSettled(ids.map(id => load(id, fresh)));
  const by = Object.fromEntries(ids.map((id, i) => [id, results[i].status === "fulfilled" ? dataOf(results[i].value) : null]));
  const n = (id, key) => by[id] ? rowsOf(by[id][key]).length : "–";
  const kpi = (id, num, lbl) => `<a class="kpi" href="#/${id}"><b>${typeof num === "number" ? num.toLocaleString("id-ID") : num}</b><span>${lbl}</span></a>`;
  const groups = ids.map(id => {
    const page = pages.find(p => p.id === id);
    if (!by[id]) return [page, [["danger", "Data halaman ini gagal dimuat."]]];
    return [page, pageChecks(PAGES[id], by[id])];
  }).filter(([, list]) => list.length);
  const total = groups.reduce((t, [p, l]) => t + activeCount(p.id, l), 0);
  const menus = pages.filter(p => p.status), nok = menus.filter(p => statusOf(p.id) === "nok");
  const cnt = s => menus.filter(p => statusOf(p.id) === s).length;
  const html = `<div class="kpis">
      ${kpi("warehouses", by.warehouses ? new Set(rowsOf(by.warehouses.warehouses).map(w => w.BPLName).filter(Boolean)).size : "–", "Branch")}
      ${kpi("warehouses", n("warehouses", "warehouses"), "Warehouse")}
      ${kpi("posting-period", n("posting-period", "periods"), "Posting period")}
      ${kpi("users", n("users", "users"), "User SAP B1")}
      ${kpi("document-numbering", n("document-numbering", "series"), "Numbering series")}
    </div>
    <h2 id="review">Status review menu</h2>
    <div class="review-sum">${Object.entries(REVIEW).map(([k, [lbl]]) => `<span>${stIcon(k)}<b>${cnt(k)}</b> ${lbl}</span>`).join("")}</div>
    ${nok.length ? table([
      { key: "no", label: "No" }, { key: "title", label: "Menu belum sesuai", fmt: (v, r) => `<a href="#/${r.id}">${esc(v)}</a>` },
      { key: "note", label: "Catatan" }, { key: "by", label: "Oleh" }, { key: "at", label: "Diubah" }
    ], nok.map(p => ({ ...p, ...review.pages[p.id] }))) : ""}
    <h2 id="temuan">Temuan otomatis <span class="no">${total}</span></h2>
    ${groups.length ? groups.map(([p, list]) => `<h3 id="t-${p.id}">${p.no ? `<span class="no">${p.no}</span> ` : ""}${esc(p.title)}</h3>
      ${findings(p.id, list.map(([t, m]) => [t, m]))}<p style="margin:-18px 0 0;font-size:13px"><a href="#/${p.id}">Buka ${esc(p.title)} →</a></p>`).join("")
      : callouts([["ok", "Tidak ada temuan."]])}`;
  return { html, meta: "" };
}
const SUMMARY = {
  lead: "Gambaran konfigurasi di database SAP B1 dan temuan yang dicek otomatis dari semua bab. Temuan hilang sendiri kalau konfigurasinya sudah diperbaiki di SAP B1, atau bisa di-exclude lewat tombol Review di halaman masing-masing."
};

// ---------- panel "Di halaman ini" + scrollspy ----------
let spy;
const headingText = h => { const c = h.cloneNode(true); $$(".anchor, .no", c).forEach(x => x.remove()); return c.textContent.trim(); };

// ---------- export Excel ----------
// Judul tabel = nama grup (details) atau judul bagian terdekat di atas tombolnya
function exportTitle(btn) {
  if (btn.dataset.title) return btn.dataset.title;
  const grp = btn.closest("details");
  if (grp) return $("summary > span", grp).firstChild.textContent.trim();
  const hs = $$("#article h2[id], #article h3[id]").filter(h => h.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING);
  return hs.length ? headingText(hs[hs.length - 1]) : "Data";
}
// buttons: tombol [data-export]; satu tombol = satu sheet, kecuali tombol exportSheets (beberapa sheet sekaligus).
// Nama file: "<no> <judul halaman> [- judul tabel].xlsx"
function exportExcel(buttons) {
  const page = pages.find(p => p.id === current);
  const sheets = buttons.map(b => ({ b, x: exportOf(b.dataset.export) })).filter(s => s.x)
    .flatMap(({ b, x }) => x.sheets ? x.sheets.map(s => ({ name: s.name, rows: exportRows(s.cols, s.rows) }))
      : [{ name: exportTitle(b), rows: exportRows(x.cols, x.rows) }]);
  if (!sheets.length) return;
  const base = `${page.no ? page.no + " " : ""}${page.title}`;
  download(xlsxBlob(sheets), `${sheets.length === 1 && buttons.length === 1 ? `${base} - ${sheets[0].name}` : base} - ${company.name}.xlsx`);
}
document.addEventListener("click", e => {
  const b = e.target.closest("button[data-export]");
  if (b) { e.preventDefault(); e.stopPropagation(); exportExcel([b]); }
});
function buildToc(page, meta) {
  // bar horizontal: cukup level h2; kalau halaman tidak punya h2, pakai h3
  const h2 = $$("#article h2[id]");
  const hs = h2.length ? h2 : $$("#article h3[id]");
  $("#toc-list").innerHTML = hs.map(h =>
    `<a href="#/${page.id}/${h.id}" data-anchor="${h.id}">${esc(headingText(h))}</a>`).join("");
  const hasSettings = !!$("#article .settings");
  $("#toc-meta").innerHTML = `${meta}
    ${hasSettings ? `<label><input type="checkbox" id="show-cols" ${document.body.classList.contains("show-cols") ? "checked" : ""}> Nama kolom DB</label>` : ""}
    ${(PAGES[page.id] && !PAGES[page.id].static) || page.id === "ringkasan" ? `<button type="button" id="refresh" title="Muat ulang dari SAP B1">↻ Muat ulang</button>` : ""}
    ${$("#article [data-export]") ? `<button type="button" id="export-page" title="Export semua tabel di halaman ini ke Excel">⤓ Export Excel</button>` : ""}`;
  $("#pagebar").hidden = !hs.length && !$("#toc-meta").children.length;
  $("#export-page") && ($("#export-page").onclick = () => exportExcel($$("#article [data-export]")));
  $("#show-cols") && ($("#show-cols").onchange = e => {
    document.body.classList.toggle("show-cols", e.target.checked); store.set("show-cols", e.target.checked ? "1" : "");
  });
  $("#refresh") && ($("#refresh").onclick = e => { e.target.disabled = true; current = null; route(true); });

  spy && spy.disconnect();
  const links = new Map($$("#toc-list a").map(a => [a.dataset.anchor, a]));
  const visible = new Set();
  spy = new IntersectionObserver(entries => {
    entries.forEach(e => e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id));
    const first = hs.find(h => visible.has(h.id));
    if (!first) return;
    links.forEach((a, id) => a.classList.toggle("active", id === first.id));
    const a = links.get(first.id), bar = $("#toc-list"); // jaga link aktif tetap kelihatan di bar
    if (a && (a.offsetLeft < bar.scrollLeft || a.offsetLeft + a.offsetWidth > bar.scrollLeft + bar.clientWidth))
      bar.scrollTo({ left: a.offsetLeft - 8, behavior: "smooth" });
  }, { rootMargin: "-110px 0px -65% 0px" });
  hs.forEach(h => spy.observe(h));
  links.size && links.values().next().value.classList.add("active");
}

function scrollToAnchor(anchor, smooth = true) {
  if (!anchor) return;
  const el = document.getElementById(anchor);
  if (!el) return;
  revealTab(el);
  el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: el.tagName === "TR" ? "center" : "start" });
  if (el.tagName === "TR") { el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit"); }
}

// klik tautan "#" di judul bagian / TOC -> ganti URL tanpa render ulang
document.addEventListener("click", e => {
  const a = e.target.closest("[data-anchor]");
  if (!a) return;
  e.preventDefault();
  history.replaceState(null, "", `#/${current}/${a.dataset.anchor}`);
  scrollToAnchor(a.dataset.anchor);
});

// ---------- pencarian (Ctrl+K) ----------
let index = [];
function buildIndex() {
  index = pages.map(p => ({ title: p.title, where: p.no ? `${p.no} · halaman` : "halaman", href: `#/${p.id}`, text: `${p.no || ""} ${p.title}` }));
  for (const p of pages) {
    const def = PAGES[p.id];
    for (const [anchor, title, rows] of def?.index || []) {
      index.push({ title, where: `${p.no ? p.no + " " : ""}${p.title}`, href: `#/${p.id}/${anchor}`, text: `${p.title} ${title}` });
      rows.filter(r => r.label).forEach(r => index.push({
        title: r.label, where: `${p.no ? p.no + " " : ""}${p.title} › ${title}`, href: `#/${p.id}/${anchor}-${slug(r.label)}`,
        text: `${r.label} ${r.col || ""} ${title}`
      }));
    }
  }
}
function openSearch() {
  const dlg = $("#search"), q = $("#search-q");
  dlg.showModal(); q.value = ""; q.focus(); drawResults("");
}
let sel = 0;
function drawResults(t) {
  const terms = t.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = terms.length ? index.filter(x => terms.every(w => x.text.toLowerCase().includes(w))).slice(0, 40) : index.filter(x => x.where.endsWith("halaman")).slice(0, 40);
  const mark = s => terms.reduce((h, w) => h.replace(new RegExp(`(${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"), "<mark>$1</mark>"), esc(s));
  sel = 0;
  $("#results").innerHTML = hits.length ? hits.map((x, i) => `<li><a href="${x.href}" class="${i ? "" : "sel"}">${mark(x.title)}<small>${esc(x.where)}</small></a></li>`).join("")
    : `<li class="none">Tidak ada hasil untuk “${esc(t)}”</li>`;
}
function moveSel(d) {
  const items = $$("#results a"); if (!items.length) return;
  items[sel].classList.remove("sel"); sel = (sel + d + items.length) % items.length;
  items[sel].classList.add("sel"); items[sel].scrollIntoView({ block: "nearest" });
}

// ---------- tema ----------
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
function toggleTheme() {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  const t = dark ? "light" : "dark"; applyTheme(t); store.set("theme", t);
}

// ---------- start ----------
(async () => {
  applyTheme(store.get("theme"));
  if (store.get("show-cols")) document.body.classList.add("show-cols");
  let editable;
  [chapters, editable] = await Promise.all([
    fetch("sections.json").then(r => r.json()),
    // mode dev (VS Code) vs war di Tomcat: Setup, Template Upload, dan Remarks hanya di mode dev; review bisa di keduanya
    getJson("api/review/mode").then(m => m.editable).catch(() => false),
    getJson("api/review").then(r => { review = { pages: {}, exclusions: {}, ...r }; reviewLoaded = true; })
      .catch(e => console.warn("Data review gagal dimuat", e))
  ]);
  // tombol Setup (halaman terpisah setup.html, bisa upload ke SAP) hanya di mode dev
  if (!editable) $("#setup-btn").remove();
  else remarks = await getJson("api/review/remarks").then(r => Object.keys(r).length ? r : null).catch(() => null);
  // bab / halaman bertanda devOnly (mis. Template Upload, Remarks) hanya tampil di mode dev
  if (!editable) chapters = chapters.filter(c => !c.devOnly).map(c => ({ ...c, pages: c.pages.filter(p => !p.devOnly) }));
  // bab / halaman yang disembunyikan dulu (mis. 6 Template Upload, License); nomor halaman di sections.json sudah digeser
  chapters = chapters.filter(c => !c.hidden).map(c => ({ ...c, pages: c.pages.filter(p => !p.hidden) }));
  // bab "dynamic": "addon" = daftar UDO/UDT dari DB + mapping; kosong / gagal = satu halaman berisi pesannya
  const addonCh = chapters.find(c => c.dynamic === "addon");
  if (addonCh) {
    try {
      const { objects } = await getJson("api/addon/objects");
      addonCh.pages = addonPages(objects);
      objects.filter(o => o.shown).forEach(o => { PAGES[addonCh.pages.find(p => p.addon === o.code).id] = addonPage(o); });
      if (!addonCh.pages.length) { addonCh.pages = [{ id: "addon", title: addonCh.title }]; PAGES.addon = addonEmptyPage(); }
    } catch (e) { addonCh.pages = [{ id: "addon", title: addonCh.title }]; PAGES.addon = addonEmptyPage(e.message); }
  }
  // halaman bertanda onlyIfData (mis. UoM) hanya tampil kalau hasil query itu lebih dari 1 baris (bukan cuma "Manual")
  const optional = chapters.flatMap(c => c.pages).filter(p => p.onlyIfData);
  const hide = new Set((await Promise.all(optional.map(p => load(p.id).then(res => rowsOf(dataOf(res)[p.onlyIfData]).length > 1 ? null : p.id, () => null))))
    .filter(Boolean));
  chapters = chapters.map(c => ({ ...c, pages: c.pages.filter(p => !hide.has(p.id)) })).filter(c => c.pages.length);
  pages = chapters.flatMap(c => c.pages);
  buildNav(); buildIndex();

  $("#theme-btn").onclick = toggleTheme;
  $("#menu-btn").onclick = () => document.body.classList.toggle("nav-open");
  document.addEventListener("click", e => {
    if (document.body.classList.contains("nav-open") && !e.target.closest(".sidebar, #menu-btn")) document.body.classList.remove("nav-open");
  });
  $("#search-btn").onclick = openSearch;
  $("#search-q").oninput = e => drawResults(e.target.value);
  $("#search-q").onkeydown = e => {
    if (e.key === "ArrowDown") { e.preventDefault(); moveSel(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveSel(-1); }
    else if (e.key === "Enter") { const a = $$("#results a")[sel]; if (a) { location.hash = a.getAttribute("href"); $("#search").close(); } }
  };
  $("#results").onclick = e => { if (e.target.closest("a")) $("#search").close(); };
  $("#search").onclick = e => { if (e.target === $("#search")) $("#search").close(); };
  document.addEventListener("keydown", e => {
    if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !e.target.closest("input, textarea, select"))) {
      e.preventDefault(); openSearch();
    }
  });

  showCompanyName();
  window.onhashchange = () => route();
  route();
})();
