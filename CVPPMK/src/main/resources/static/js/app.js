import { $, $$, esc, slug, callouts, flushMounts, rowsOf } from "./ui.js";
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
  const d = await getJson(`/api/sl/${name}`);
  if (d.error) throw new Error(`Service Layer: ${d.error}`);
  const data = Object.fromEntries(Object.entries(d.data).filter(([, v]) => v === null || typeof v !== "object"));
  return { generatedAt: d.generatedAt, results: { sl: { columns: Object.keys(data), rows: [Object.values(data)], ms: d.ms } } };
}
function load(id, fresh) {
  if (fresh || !cache.has(id)) {
    const { sl, withSql } = PAGES[id] || {};
    const p = !sl ? getJson(`/api/section/${id}`)
      : !withSql ? loadSl(sl)
      : Promise.all([getJson(`/api/section/${id}`), loadSl(sl)]).then(([a, b]) => ({ ...a, results: { ...a.results, ...b.results } }));
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
  const done = pages.filter(p => p.status === "done").length, total = pages.filter(p => p.status).length;
  const inProg = pages.filter(p => p.status === "progress").length;
  $("#nav").innerHTML = `
    <div class="progress-box"><div class="lbl"><span>Progres dokumentasi</span><b>${done + inProg}/${total}</b></div>
      <div class="bar"><div style="width:${((done + inProg * .5) / total) * 100}%"></div></div></div>
    ${chapters.map(ch => {
      const flat = ch.pages.length === 1;
      if (flat) { // bab satu halaman: tampil sebagai satu tautan saja
        const p = ch.pages[0];
        return `<div class="nav-group flat"><a href="#/${p.id}" data-id="${p.id}" class="chapter-link ${p.status === "todo" ? "todo" : ""}">
          <span class="gno">${esc(ch.no)}</span><span>${esc(ch.title)}</span>${p.status ? `<span class="dot ${p.status}" title="${statusLabel(p.status)}"></span>` : ""}</a></div>`;
      }
      return `<div class="nav-group" data-no="${ch.no}">
        <button type="button" aria-expanded="true"><span class="gno">${esc(ch.no)}</span>${esc(ch.title)}
          <svg class="chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
        <ul>${ch.pages.map(p => `<li><a href="#/${p.id}" data-id="${p.id}" class="${p.status === "todo" ? "todo" : ""}">
          ${p.no ? `<span class="no">${esc(p.no)}</span>` : ""}<span>${esc(p.title)}</span>${p.status ? `<span class="dot ${p.status}" title="${statusLabel(p.status)}"></span>` : ""}</a></li>`).join("")}</ul>
      </div>`;
    }).join("")}
    <div class="legend"><span><i class="dot done"></i>Selesai</span><span><i class="dot progress"></i>Dikerjakan</span><span><i class="dot todo"></i>Belum</span></div>`;
  $$(".legend .dot").forEach(d => Object.assign(d.style, { display: "inline-block", width: "7px", height: "7px", borderRadius: "50%" }));
  $$(".nav-group > button").forEach(b => b.onclick = () => {
    const g = b.parentElement; g.classList.toggle("collapsed"); b.setAttribute("aria-expanded", !g.classList.contains("collapsed"));
  });
}
const statusLabel = s => ({ done: "Selesai", progress: "Sedang dikerjakan", todo: "Belum mulai" }[s] || "");

// ---------- routing ----------
function parseHash() {
  const [, id, anchor] = location.hash.match(/^#\/([^/]+)(?:\/(.+))?/) || [];
  return { id: pages.some(p => p.id === id) ? id : "ringkasan", anchor };
}
let current = null;
async function route(fresh = false) {
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
  window.scrollTo(0, 0);
  document.title = `${page.no ? page.no + " " : ""}${page.title} · Dokumentasi CVPPMK`;

  let html, meta = "";
  try {
    if (id === "ringkasan") ({ html, meta } = await renderSummary(fresh));
    else if (!PAGES[id]) html = renderTodo(page);
    else if (PAGES[id].static) html = PAGES[id].render({});
    else {
      const res = await load(id, fresh);
      const def = PAGES[id], d = dataOf(res), errs = queryErrors(res);
      html = (errs.length ? `<div class="error">Query gagal: ${errs.map(([k, v]) => `<b>${esc(k)}</b> – ${esc(v.error)}`).join("<br>")}</div>` : "")
        + callouts(def.checks ? def.checks(d) : []) + def.render(d);
      meta = `<span>Diperbarui ${esc(res.generatedAt.replace("T", " "))}</span><span>Query ${queryMs(res)} ms</span>`;
    }
  } catch (e) {
    html = `<div class="error">Gagal mengambil data dari SAP B1: ${esc(e.message)}</div>`;
  }
  if (current !== id) return; // user sudah pindah halaman
  const def = id === "ringkasan" ? SUMMARY : PAGES[id];
  art.innerHTML = head(page, def) + html + pager(page);
  flushMounts();
  buildToc(page, meta);
  scrollToAnchor(anchor, false);
}

function head(page, def) {
  const ch = chapters.find(c => c.pages.includes(page));
  return `<nav class="crumbs" aria-label="Breadcrumb"><span>Dokumentasi</span><span>${esc(ch.no)}. ${esc(ch.title)}</span>${page.no ? `<span>${esc(page.no)}</span>` : ""}</nav>
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
  const total = groups.reduce((t, [, l]) => t + l.length, 0);
  const html = `<div class="kpis">
      ${kpi("org-structure", n("org-structure", "branches"), "Branch")}
      ${kpi("org-structure", n("org-structure", "warehouses"), "Warehouse")}
      ${kpi("posting-period", n("posting-period", "periods"), "Posting period")}
      ${kpi("users", n("users", "users"), "User SAP B1")}
      ${kpi("document-numbering", n("document-numbering", "series"), "Numbering series")}
    </div>
    <h2 id="temuan">Temuan otomatis <span class="no">${total}</span></h2>
    ${groups.length ? groups.map(([p, list]) => `<h3 id="t-${p.id}">${p.no ? `<span class="no">${p.no}</span> ` : ""}${esc(p.title)}</h3>
      ${callouts(list.map(([t, m]) => [t, m]))}<p style="margin:-18px 0 0;font-size:13px"><a href="#/${p.id}">Buka ${esc(p.title)} →</a></p>`).join("")
      : callouts([["ok", "Tidak ada temuan."]])}`;
  return { html, meta: "" };
}
const SUMMARY = {
  lead: "Gambaran konfigurasi di database SAP B1 dan temuan yang dicek otomatis dari semua bab. Temuan hilang sendiri kalau konfigurasinya sudah diperbaiki di SAP B1."
};

// ---------- panel "Di halaman ini" + scrollspy ----------
let spy;
const headingText = h => { const c = h.cloneNode(true); $$(".anchor, .no", c).forEach(x => x.remove()); return c.textContent.trim(); };
function buildToc(page, meta) {
  const hs = $$("#article h2[id], #article h3[id]");
  $("#toc-list").innerHTML = hs.length ? `<h4>Di halaman ini</h4><ul>${hs.map(h =>
    `<li><a href="#/${page.id}/${h.id}" data-anchor="${h.id}" class="${h.tagName === "H3" ? "l3" : ""}">${esc(headingText(h))}</a></li>`).join("")}</ul>` : "";
  const hasSettings = !!$("#article .settings");
  $("#toc-meta").innerHTML = `${meta}
    ${hasSettings ? `<label><input type="checkbox" id="show-cols" ${document.body.classList.contains("show-cols") ? "checked" : ""}> Tampilkan nama kolom DB</label>` : ""}
    ${(PAGES[page.id] && !PAGES[page.id].static) || page.id === "ringkasan" ? `<button type="button" id="refresh">↻ Muat ulang dari SAP B1</button>` : ""}`;
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
  chapters = await (await fetch("/sections.json")).json();
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

  window.onhashchange = () => route();
  route();
})();
