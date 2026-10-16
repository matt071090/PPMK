import { $, $$, esc, slug, callouts, flushMounts, rowsOf, table, resetExports, exportOf, exportRows } from "./ui.js";
import { xlsxBlob, download } from "./xlsx.js";
import { PAGES as GENERAL } from "./pages/general.js";
import { PAGES as MODULES } from "./pages/modules.js";

const PAGES = { ...GENERAL, ...MODULES };

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
    const { sl, withSql } = PAGES[id] || {};
    const p = !sl ? getJson(`api/section/${id}`)
      : !withSql ? loadSl(sl)
      : Promise.all([getJson(`api/section/${id}`), loadSl(sl)]).then(([a, b]) => ({ ...a, results: { ...a.results, ...b.results } }));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return cache.get(id);
}
const dataOf = res => res.results;
const queryMs = res => Object.values(res.results).reduce((t, r) => t + (r.ms || 0), 0);
const queryErrors = res => Object.entries(res.results).filter(([, v]) => v.error);

// ---------- sidebar ----------
function buildNav() {
  $("#nav").innerHTML = `
    <div class="progress-box"><div class="lbl"><span>Menu sudah sesuai</span><b id="rv-count"></b></div>
      <div class="bar"><div id="rv-ok"></div><div id="rv-nok"></div></div></div>
    ${chapters.map(ch => {
      const flat = ch.pages.length === 1;
      if (flat) { // bab satu halaman: tampil sebagai satu tautan saja
        const p = ch.pages[0];
        return `<div class="nav-group flat"><a href="#/${p.id}" data-id="${p.id}" class="chapter-link ${p.status === "todo" ? "todo" : ""}">
          <span class="gno">${esc(ch.no)}</span><span>${esc(ch.title)}</span>${p.status ? `<span class="dot" data-dot="${p.id}"></span>` : ""}</a></div>`;
      }
      return `<div class="nav-group" data-no="${ch.no}">
        <button type="button" aria-expanded="true"><span class="gno">${esc(ch.no)}</span>${esc(ch.title)}
          <svg class="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
        <ul>${ch.pages.map(p => `<li><a href="#/${p.id}" data-id="${p.id}" class="${p.status === "todo" ? "todo" : ""}">
          ${p.no ? `<span class="no">${esc(p.no)}</span>` : ""}<span>${esc(p.title)}</span>${p.status ? `<span class="dot" data-dot="${p.id}"></span>` : ""}</a></li>`).join("")}</ul>
      </div>`;
    }).join("")}
    <div class="legend">${Object.entries(REVIEW).map(([k, [lbl]]) => `<span><i class="dot ${k}"></i>${lbl}</span>`).join("")}</div>`;
  $$(".nav-group > button").forEach(b => b.onclick = () => {
    const g = b.parentElement; g.classList.toggle("collapsed"); b.setAttribute("aria-expanded", !g.classList.contains("collapsed"));
  });
  paintNav();
}
// warna titik & bar progres mengikuti status review manual (edit mode)
function paintNav() {
  const menus = pages.filter(p => p.status), cnt = s => menus.filter(p => statusOf(p.id) === s).length;
  $$("#nav [data-dot]").forEach(d => {
    const s = statusOf(d.dataset.dot), note = review.pages[d.dataset.dot]?.note;
    d.className = `dot ${s}`; d.title = REVIEW[s][0] + (note ? ` – ${note}` : "");
  });
  $("#rv-count").textContent = `${cnt("ok")}/${menus.length}`;
  $("#rv-ok").style.width = `${cnt("ok") / menus.length * 100}%`;
  $("#rv-nok").style.width = `${cnt("nok") / menus.length * 100}%`;
}

// ---------- review manual: status menu & exclusion temuan ----------
// review.json di server: { pages: {id: {status: "ok"|"nok", note, at}}, exclusions: {key: {page, msg, reason, at}} }
const REVIEW = { ok: ["Sesuai", "yes"], nok: ["Belum sesuai", "danger"], none: ["Belum direview", ""] };
let review = { pages: {}, exclusions: {} }, reviewLoaded = false;
const statusOf = id => review.pages[id]?.status || "none";
const editing = () => document.body.classList.contains("edit");
// key memuat teks pesan: kalau datanya berubah (mis. daftar field kosong berubah), temuan dianggap baru dan muncul lagi
const exKey = (pageId, [t, msg]) => `${pageId}|${t}|${msg}`;
const now = () => { const d = new Date(); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16).replace("T", " "); };

async function saveReview() {
  if (!reviewLoaded) throw new Error("data review gagal dimuat saat start. Muat ulang halaman dulu supaya file review tidak tertimpa");
  const r = await fetch("api/review", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(review) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  paintNav();
}

// temuan otomatis dibagi jadi aktif & dikecualikan
function findings(pageId, list) {
  const isEx = i => !!review.exclusions[exKey(pageId, i)];
  const active = list.filter(i => !isEx(i)), excluded = list.filter(isEx);
  const btn = (act, lbl, i) => `<button type="button" class="cbtn" data-act="${act}" data-key="${esc(exKey(pageId, i))}">${lbl}</button>`;
  return callouts(active, { action: editing() ? i => btn("exclude", "Exclude", i) : null })
    + (excluded.length ? `<details class="excluded"${editing() ? " open" : ""}><summary>Dikecualikan (${excluded.length})</summary>
      ${callouts(excluded, {
        note: i => { const x = review.exclusions[exKey(pageId, i)]; return `<span class="reason">Alasan: ${x.reason ? esc(x.reason) : "<i>tanpa alasan</i>"} · ${esc(x.at)}</span>`; },
        action: editing() ? i => btn("restore", "Batalkan", i) : null
      })}</details>` : "");
}
const activeCount = (pageId, list) => list.filter(i => !review.exclusions[exKey(pageId, i)]).length;

// kotak status review di bawah judul halaman
function reviewBox(page) {
  if (!page.status) return "";
  const r = review.pages[page.id] || {}, s = statusOf(page.id);
  if (!editing()) return s === "none" && !r.note ? "" : `<div class="review-view"><span class="badge ${REVIEW[s][1]}">${REVIEW[s][0]}</span>
    ${r.note ? `<span>${esc(r.note)}</span>` : ""}${r.at ? `<small>${esc(r.at)}</small>` : ""}</div>`;
  return `<div class="review-box" data-page="${page.id}"><div class="seg" role="radiogroup" aria-label="Status review">
      ${Object.entries(REVIEW).map(([k, [lbl]]) => `<label class="${k}"><input type="radio" name="rv-status" value="${k}" ${k === s ? "checked" : ""}>${lbl}</label>`).join("")}</div>
    <textarea rows="2" placeholder="Catatan review, mis. alamat & NPWP menunggu data dari client" aria-label="Catatan review">${esc(r.note || "")}</textarea></div>`;
}

function setPageReview(id, patch) {
  const old = review.pages[id], r = { ...old, ...patch, at: now() };
  if (r.status === "none") delete r.status;
  if (!r.note) delete r.note;
  if (r.status || r.note) review.pages[id] = r; else delete review.pages[id];
  saveReview().catch(e => {
    if (old) review.pages[id] = old; else delete review.pages[id];
    alert(`Gagal menyimpan review: ${e.message}`); rerender();
  });
}

// render ulang halaman aktif tanpa ambil data lagi, posisi scroll dipertahankan
async function rerender() {
  const y = window.scrollY; current = null;
  await route(false, true);
  window.scrollTo(0, y);
}

// ---------- 1.20 Remarks (Mode edit): isi disimpan di review.remarks ----------
const RM = () => PAGES.remarks.remarks;
async function saveRemarks(next, redraw) {
  const old = review.remarks;
  review.remarks = { ...next, at: now() };
  try { await saveReview(); if (redraw) rerender(); }
  catch (err) { review.remarks = old; alert(`Gagal menyimpan remarks: ${err.message}`); rerender(); }
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
  const box = e.target.closest(".review-box"); if (!box) return;
  if (e.target.name === "rv-status") setPageReview(box.dataset.page, { status: e.target.value });
  else if (e.target.tagName === "TEXTAREA") setPageReview(box.dataset.page, { note: e.target.value.trim() });
});

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-act]"); if (!b) return;
  const key = b.dataset.key, callout = b.closest(".callout");
  if (b.dataset.act === "exclude") { // form alasan muncul di dalam callout
    if ($(".ex-form", callout)) return $(".ex-form input", callout).focus();
    $(".ct", callout).insertAdjacentHTML("beforeend", `<form class="ex-form"><input type="text" placeholder="Alasan, mis. sudah dikonfirmasi client tidak dipakai" aria-label="Alasan exclusion">
      <button type="submit" class="cbtn primary">Simpan</button><button type="button" class="cbtn" data-act="cancel">Batal</button></form>`);
    const f = $(".ex-form", callout); $("input", f).focus();
    f.onsubmit = async ev => {
      ev.preventDefault();
      const [page, , ...msg] = key.split("|");
      review.exclusions[key] = { page, msg: msg.join("|"), reason: $("input", f).value.trim(), at: now() };
      try { await saveReview(); rerender(); } catch (err) { delete review.exclusions[key]; alert(`Gagal menyimpan: ${err.message}`); }
    };
  } else if (b.dataset.act === "cancel") b.closest(".ex-form").remove();
  else if (b.dataset.act === "restore") {
    const old = review.exclusions[key]; delete review.exclusions[key];
    try { await saveReview(); rerender(); } catch (err) { review.exclusions[key] = old; alert(`Gagal menyimpan: ${err.message}`); }
  }
});

function setEdit(on) {
  document.body.classList.toggle("edit", on);
  $("#edit-btn").setAttribute("aria-pressed", on);
  store.set("edit", on ? "1" : "");
}

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
  document.body.classList.remove("nav-open");
  $$("#nav a[data-id]").forEach(a => a.classList.toggle("active", a.dataset.id === id));
  const page = pages.find(p => p.id === id);
  const art = $("#article");
  art.classList.remove("enter"); void art.offsetWidth; art.classList.add("enter");
  art.innerHTML = head(page) + `<div class="skeleton">${"<div></div>".repeat(6)}</div>`;
  $("#toc-list").innerHTML = ""; $("#toc-meta").innerHTML = "";
  if (!keepScroll) window.scrollTo(0, 0);
  document.title = `${page.no ? page.no + " " : ""}${page.title} · Project Check List CVPPMK`;

  let html, meta = "";
  resetExports();
  try {
    if (id === "ringkasan") ({ html, meta } = await renderSummary(fresh));
    else if (!PAGES[id]) html = renderTodo(page);
    else if (PAGES[id].static) html = PAGES[id].render({}, { review, editing: editing() });
    else {
      const res = await load(id, fresh);
      const def = PAGES[id], d = dataOf(res), errs = queryErrors(res);
      html = (errs.length ? `<div class="error">Query gagal: ${errs.map(([k, v]) => `<b>${esc(k)}</b> – ${esc(v.error)}`).join("<br>")}</div>` : "")
        + findings(id, def.checks ? def.checks(d) : []) + def.render(d);
      meta = `<span>Diperbarui ${esc(res.generatedAt.replace("T", " "))}</span><span>Query ${queryMs(res)} ms</span>`;
    }
  } catch (e) {
    html = `<div class="error">Gagal mengambil data dari SAP B1: ${esc(e.message)}</div>`;
  }
  if (current !== id) return; // user sudah pindah halaman
  const def = id === "ringkasan" ? SUMMARY : PAGES[id];
  art.innerHTML = head(page, def) + reviewBox(page) + html + pager(page);
  flushMounts();
  buildToc(page, meta);
  scrollToAnchor(anchor, false);
}

function head(page, def) {
  const ch = chapters.find(c => c.pages.includes(page));
  return `<nav class="crumbs" aria-label="Breadcrumb"><span>Project Check List</span><span>${esc(ch.no)}. ${esc(ch.title)}</span>${page.no ? `<span>${esc(page.no)}</span>` : ""}</nav>
    <h1>${page.no ? `<span class="no">${esc(page.no)}</span>` : ""}${esc(page.title)}</h1>
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
    return [page, PAGES[id].checks ? PAGES[id].checks(by[id]) : []];
  }).filter(([, list]) => list.length);
  const total = groups.reduce((t, [p, l]) => t + activeCount(p.id, l), 0);
  const menus = pages.filter(p => p.status), nok = menus.filter(p => statusOf(p.id) === "nok");
  const cnt = s => menus.filter(p => statusOf(p.id) === s).length;
  const html = `<div class="kpis">
      ${kpi("org-structure", n("org-structure", "branches"), "Branch")}
      ${kpi("org-structure", n("org-structure", "warehouses"), "Warehouse")}
      ${kpi("posting-period", n("posting-period", "periods"), "Posting period")}
      ${kpi("users", n("users", "users"), "User SAP B1")}
      ${kpi("document-numbering", n("document-numbering", "series"), "Numbering series")}
    </div>
    <h2 id="review">Status review menu</h2>
    <div class="review-sum">${Object.entries(REVIEW).map(([k, [lbl]]) => `<span><i class="dot ${k}"></i><b>${cnt(k)}</b> ${lbl}</span>`).join("")}</div>
    ${nok.length ? table([
      { key: "no", label: "No" }, { key: "title", label: "Menu belum sesuai", fmt: (v, r) => `<a href="#/${r.id}">${esc(v)}</a>` },
      { key: "note", label: "Catatan" }, { key: "at", label: "Diubah" }
    ], nok.map(p => ({ ...p, ...review.pages[p.id] }))) : ""}
    <h2 id="temuan">Temuan otomatis <span class="no">${total}</span></h2>
    ${groups.length ? groups.map(([p, list]) => `<h3 id="t-${p.id}">${p.no ? `<span class="no">${p.no}</span> ` : ""}${esc(p.title)}</h3>
      ${findings(p.id, list.map(([t, m]) => [t, m]))}<p style="margin:-18px 0 0;font-size:13px"><a href="#/${p.id}">Buka ${esc(p.title)} →</a></p>`).join("")
      : callouts([["ok", "Tidak ada temuan."]])}`;
  return { html, meta: "" };
}
const SUMMARY = {
  lead: "Gambaran konfigurasi di database SAP B1 dan temuan yang dicek otomatis dari semua bab. Temuan hilang sendiri kalau konfigurasinya sudah diperbaiki di SAP B1, atau bisa di-exclude lewat mode edit."
};

// ---------- panel "Di halaman ini" + scrollspy ----------
let spy;
const headingText = h => { const c = h.cloneNode(true); $$(".anchor, .no", c).forEach(x => x.remove()); return c.textContent.trim(); };

// ---------- export Excel ----------
// Judul tabel = nama grup (details) atau judul bagian terdekat di atas tombolnya
function exportTitle(btn) {
  const grp = btn.closest("details");
  if (grp) return $("summary > span", grp).firstChild.textContent.trim();
  const hs = $$("#article h2[id], #article h3[id]").filter(h => h.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING);
  return hs.length ? headingText(hs[hs.length - 1]) : "Data";
}
// buttons: tombol [data-export]; satu tombol = satu sheet. Nama file: "<no> <judul halaman> [- judul tabel].xlsx"
function exportExcel(buttons) {
  const page = pages.find(p => p.id === current);
  const sheets = buttons.map(b => ({ b, x: exportOf(b.dataset.export) })).filter(s => s.x)
    .map(({ b, x }) => ({ name: exportTitle(b), rows: exportRows(x.cols, x.rows) }));
  if (!sheets.length) return;
  const base = `${page.no ? page.no + " " : ""}${page.title}`;
  download(xlsxBlob(sheets), `${sheets.length === 1 && buttons.length === 1 ? `${base} - ${sheets[0].name}` : base} - CVPPMK.xlsx`);
}
document.addEventListener("click", e => {
  const b = e.target.closest("button[data-export]");
  if (b) { e.preventDefault(); e.stopPropagation(); exportExcel([b]); }
});
function buildToc(page, meta) {
  const hs = $$("#article h2[id], #article h3[id]");
  $("#toc-list").innerHTML = hs.length ? `<h4>Di halaman ini</h4><ul>${hs.map(h =>
    `<li><a href="#/${page.id}/${h.id}" data-anchor="${h.id}" class="${h.tagName === "H3" ? "l3" : ""}">${esc(headingText(h))}</a></li>`).join("")}</ul>` : "";
  const hasSettings = !!$("#article .settings");
  $("#toc-meta").innerHTML = `${meta}
    ${hasSettings ? `<label><input type="checkbox" id="show-cols" ${document.body.classList.contains("show-cols") ? "checked" : ""}> Tampilkan nama kolom DB</label>` : ""}
    ${(PAGES[page.id] && !PAGES[page.id].static) || page.id === "ringkasan" ? `<button type="button" id="refresh">↻ Muat ulang dari SAP B1</button>` : ""}
    ${$("#article [data-export]") ? `<button type="button" id="export-page">⤓ Export semua tabel (Excel)</button>` : ""}`;
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
    if (first) links.forEach((a, id) => a.classList.toggle("active", id === first.id));
  }, { rootMargin: "-64px 0px -65% 0px" });
  hs.forEach(h => spy.observe(h));
  links.size && links.values().next().value.classList.add("active");
}

function scrollToAnchor(anchor, smooth = true) {
  if (!anchor) return;
  const el = document.getElementById(anchor);
  if (!el) return;
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
      index.push({ title, where: `${p.no} ${p.title}`, href: `#/${p.id}/${anchor}`, text: `${p.title} ${title}` });
      rows.filter(r => r.label).forEach(r => index.push({
        title: r.label, where: `${p.no} ${p.title} › ${title}`, href: `#/${p.id}/${anchor}-${slug(r.label)}`,
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
    // war di Tomcat = web final read-only: tombol Mode edit tidak ditampilkan
    getJson("api/review/mode").then(m => m.editable).catch(() => false),
    getJson("api/review").then(r => { review = { pages: {}, exclusions: {}, ...r }; reviewLoaded = true; })
      .catch(e => console.warn("Data review gagal dimuat", e))
  ]);
  if (!editable) $("#edit-btn").remove();
  else if (store.get("edit")) setEdit(true);
  pages = chapters.flatMap(c => c.pages);
  buildNav(); buildIndex();

  $("#theme-btn").onclick = toggleTheme;
  if (editable) $("#edit-btn").onclick = () => { setEdit(!editing()); rerender(); };
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

  window.onhashchange = () => route();
  route();
})();
