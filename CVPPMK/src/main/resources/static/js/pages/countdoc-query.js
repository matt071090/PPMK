// Count Document, Tahap A "Daftar Query": 71 query bawaan satu per satu (master-detail), jalankan, lihat SQL, tandai hasil cek manual.
// Backend: CountDocQueryController (/api/countdoc/queries|query/run|query-checks). Klien hanya mengirim id query; SQL tidak pernah dari klien.
// Semua teks dari server dipasang lewat textContent (bukan innerHTML) supaya nilai sel/nama tidak bisa menyisipkan HTML.
import * as L from "./countdoc-query-lib.js";
import { groupInfo } from "./countdoc-engine.js";
import { xlsxBlob, download } from "../xlsx.js";
import { companyKey } from '../company.js';

const API = "api/countdoc";
const RUNS_KEY = "cdq-runs", PARAMS_KEY = "cdq-params", OPEN_KEY = "cdq-groups";
const ssGet = k => { try { return sessionStorage.getItem(companyKey(k)); } catch { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(companyKey(k), v); } catch { /* abaikan */ } };
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtNum = n => Number(n).toLocaleString("id-ID");

/** Pembuat elemen kecil: h("div", {class:"x", onclick:fn}, "teks", child). Teks anak selalu node teks. */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

async function api(path, opts) {
  const o = Object.assign({ headers: { Accept: "application/json" } }, opts || {});
  if (o.body !== undefined) { o.headers = Object.assign({ "Content-Type": "application/json" }, o.headers); o.body = JSON.stringify(o.body); }
  const r = await fetch(`${API}/${path}`, o);
  const ct = r.headers.get("content-type") || "";
  const d = ct.includes("json") ? await r.json().catch(() => ({})) : {};
  if (!r.ok) {
    const e = new Error((d && d.message) || (r.status === 403 ? "Akses ditolak. Buka kunci Setup dulu." : `Gagal memuat (HTTP ${r.status}).`));
    e.status = r.status; e.code = d && d.code; e.data = d; throw e;
  }
  return d;
}

export function countdocQueryPage(root) {
  const st = {
    queries: [], checks: {}, companies: [], runs: L.loadRuns(ssGet(RUNS_KEY)), results: {}, tv: {}, drafts: {},
    sel: null, q: "", chip: "all", running: null, maxRows: 5000, fatal: null,
    closed: new Set((() => { try { return JSON.parse(ssGet(OPEN_KEY) || "[]"); } catch { return []; } })()),
    params: (() => { try { return JSON.parse(ssGet(PARAMS_KEY) || "{}") || {}; } catch { return {}; } })()
  };
  const now = new Date();
  if (!st.params.from) st.params.from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
  if (!st.params.to) st.params.to = ymd(now);

  root.classList.add("cq-app");
  root.replaceChildren();
  root.append(
    h("nav", { class: "crumbs", "aria-label": "Breadcrumb" }, h("span", {}, "Tools"), h("span", {}, "Audit SAP")),
    h("h1", {}, "Daftar Query"),
    h("p", { class: "cq-lead" }, "Jalankan satu per satu query bawaan Count Document, lihat SQL-nya, lalu tandai hasil cek manual. Query hanya membaca data (SELECT)."),
    h("div", { class: "cq-fatal", id: "cq-fatal", role: "alert", hidden: true }),
    h("div", { class: "cq", id: "cq" })
  );
  const $ = s => root.querySelector(s);
  const cq = $("#cq");

  // ---------- kerangka ----------
  const listPane = h("aside", { class: "cq-list", "aria-label": "Daftar query" });
  const searchInput = h("input", { id: "cq-search", type: "search", class: "cq-search", placeholder: "Cari nama, tabel, kelompok", autocomplete: "off", oninput: e => { st.q = e.target.value; renderList(); } });
  const chipsEl = h("div", { class: "cq-chips", role: "group", "aria-label": "Saring status" });
  const countEl = h("p", { class: "cq-count", id: "cq-count", "aria-live": "polite" });
  const groupsEl = h("div", { class: "cq-groups", id: "cq-groups" });
  listPane.append(
    h("label", { class: "cq-sr", for: "cq-search" }, "Cari query"), searchInput, chipsEl, countEl, groupsEl);

  const detail = h("section", { class: "cq-detail", "aria-label": "Rincian query" });
  const backBtn = h("button", { type: "button", class: "cbtn cq-back", onclick: () => { location.hash = ""; } }, "‹ Daftar query");
  const empty = h("div", { class: "cq-empty", id: "cq-empty" }, h("p", {}, "Pilih query di daftar untuk melihat SQL dan menjalankannya."));
  const body = h("div", { id: "cq-body", hidden: true });
  const titleEl = h("div", { class: "cq-title", id: "cq-title" });
  const paramsEl = h("fieldset", { class: "cq-params" });
  const sqlEl = h("div", { id: "cq-sql" });
  const checkEl = h("div", { id: "cq-check" });
  const resEl = h("div", { id: "cq-res" });
  body.append(titleEl, paramsEl, sqlEl, checkEl, resEl);
  const bar = h("div", { class: "cq-bar", id: "cq-bar" });
  detail.append(backBtn, empty, body, bar);
  cq.append(listPane, detail);

  // ---------- parameter (company + rentang) ----------
  const coSel = h("select", { id: "cq-co", onchange: e => { st.params.company = e.target.value; saveParams(); } });
  const fromIn = h("input", { id: "cq-from", type: "date", value: st.params.from, onchange: e => { st.params.from = e.target.value; saveParams(); } });
  const toIn = h("input", { id: "cq-to", type: "date", value: st.params.to, onchange: e => { st.params.to = e.target.value; saveParams(); } });
  paramsEl.append(h("legend", {}, "Parameter"),
    h("div", { class: "cq-pgrid" },
      h("label", { class: "cq-f" }, h("span", {}, "Company"), coSel),
      h("label", { class: "cq-f" }, h("span", {}, "Dari tanggal"), fromIn),
      h("label", { class: "cq-f" }, h("span", {}, "Sampai tanggal"), toIn)),
    h("p", { class: "cq-hint" }, "Tanggal dikirim sebagai parameter (:from, :to). Rentang maksimal 400 hari."));
  function saveParams() { ssSet(PARAMS_KEY, JSON.stringify(st.params)); }
  function fillCompanies() {
    coSel.replaceChildren(...st.companies.map(c => h("option", { value: c.schema }, c.name ? `${c.name} (${c.schema})` : c.schema)));
    const ok = st.companies.some(c => c.schema === st.params.company);
    if (!ok) { const a = st.companies.find(c => c.active) || st.companies[0]; st.params.company = a ? a.schema : ""; }
    coSel.value = st.params.company;
  }

  // ---------- daftar ----------
  const runOf = id => st.runs[id] ? st.runs[id].state : "belum";
  const checkOf = id => (st.checks[id] && st.checks[id].status) || "belum";
  const stateTag = (set, key, extra) => h("span", { class: "cq-st", "data-s": key }, h("i", { "aria-hidden": "true" }, set[key].sym), set[key].label, extra || null);

  function visible() {
    return L.groupQueries(st.queries, q => L.matchesQuery(q, st.q) && (st.chip === "all" || (st.chip === "gagal" ? runOf(q.id) === "gagal" : runOf(q.id) === "belum")));
  }
  function renderChips() {
    const n = key => st.queries.filter(q => key === "gagal" ? runOf(q.id) === "gagal" : runOf(q.id) === "belum").length;
    const defs = [["all", "Semua", st.queries.length], ["gagal", "Gagal", n("gagal")], ["belum", "Belum", n("belum")]];
    chipsEl.replaceChildren(...defs.map(([k, label, c]) => h("button", { type: "button", class: "cq-chip", "aria-pressed": String(st.chip === k), onclick: () => { st.chip = k; renderList(); } }, label, h("b", {}, String(c)))));
  }
  function renderList() {
    renderChips();
    const done = st.queries.filter(q => checkOf(q.id) !== "belum").length;
    countEl.textContent = `Cek: ${done} dari ${st.queries.length}`;
    const groups = visible();
    const forceOpen = !!st.q.trim() || st.chip !== "all";
    if (!groups.length) { groupsEl.replaceChildren(h("p", { class: "cq-none" }, "Tidak ada query yang cocok.")); return; }
    groupsEl.replaceChildren(...groups.map(g => {
      const info = groupInfo(g.group);
      const open = forceOpen || !st.closed.has(g.group);
      const d = h("details", { class: "cq-grp", "data-g": info.code, open },
        h("summary", {}, h("span", { class: "cq-gname" }, g.group), h("b", { class: "cq-gn" }, String(g.items.length))),
        h("ul", {}, g.items.map(q => h("li", {},
          h("button", { type: "button", class: "cq-item", "data-id": q.id, "aria-current": q.id === st.sel ? "true" : null, onclick: () => { location.hash = "q=" + encodeURIComponent(q.id); } },
            h("span", { class: "cq-il" }, q.label),
            h("span", { class: "cq-im" }, h("span", { class: "cq-st sm", "data-s": runOf(q.id), title: "Status jalan: " + L.RUN_STATES[runOf(q.id)].label }, h("i", { "aria-hidden": "true" }, L.RUN_STATES[runOf(q.id)].sym), L.RUN_STATES[runOf(q.id)].label),
              h("span", { class: "cq-st sm chk", "data-s": checkOf(q.id), title: "Cek manual: " + L.CHECK_STATES[checkOf(q.id)].label }, h("i", { "aria-hidden": "true" }, L.CHECK_STATES[checkOf(q.id)].sym), L.CHECK_STATES[checkOf(q.id)].label)))))));
      d.addEventListener("toggle", () => {
        if (forceOpen) return;
        if (d.open) st.closed.delete(g.group); else st.closed.add(g.group);
        ssSet(OPEN_KEY, JSON.stringify([...st.closed]));
      });
      return d;
    }));
  }

  // ---------- detail ----------
  const cur = () => st.queries.find(q => q.id === st.sel) || null;

  function runLine(q) {
    const r = st.runs[q.id];
    const key = r ? r.state : "belum";
    const bits = [];
    if (r && r.state !== "belum") {
      if (r.state !== "tidak_tersedia" && r.state !== "gagal") bits.push(`${fmtNum(r.rows)} baris`);
      bits.push(L.fmtMs(r.ms));
      if (r.state === "terpotong") bits.push(`dipotong di ${fmtNum(st.maxRows)} baris`);
      if (r.state === "lambat") bits.push("lebih dari 8 detik");
      if (r.state === "tidak_tersedia") bits.push("tabel/kolom belum ada di database ini");
      if (r.state === "gagal" && r.code) bits.push(`kode ${r.code}`);
    }
    return h("p", { class: "cq-runline", "aria-live": "polite" }, stateTag(L.RUN_STATES, key), bits.length ? " " + bits.join(" · ") : "");
  }
  function renderTitle() {
    const q = cur(); if (!q) return;
    const run = h("button", { type: "button", class: "cbtn primary cq-run", "data-act": "run", disabled: !!st.running, onclick: runQuery }, st.running === q.id ? "Menjalankan…" : "Jalankan");
    titleEl.replaceChildren(
      h("div", { class: "cq-trow" },
        h("div", { class: "cq-tmain" }, h("h2", {}, q.label, " ", h("span", { class: "badge info" }, "Bawaan")),
          h("p", { class: "cq-meta" }, `${q.group} · tabel ${q.source || "-"} · ${q.role || "-"}${q.dateKind ? " · " + q.dateKind : ""}${q.approval ? " · persetujuan" : ""}`)),
        run),
      runLine(q));
    renderBar();
  }
  function renderBar() {
    const q = cur();
    if (!q) { bar.replaceChildren(); return; }
    const flat = visible().flatMap(g => g.items), i = flat.findIndex(x => x.id === q.id);
    const next = flat[i + 1] || null;
    bar.replaceChildren(
      h("button", { type: "button", class: "cbtn primary", disabled: !!st.running, onclick: runQuery }, st.running === q.id ? "Menjalankan…" : "Jalankan"),
      h("button", { type: "button", class: "cbtn", disabled: !next, onclick: () => { if (next) location.hash = "q=" + encodeURIComponent(next.id); } }, "Query berikutnya ›"));
  }
  function renderSql() {
    const q = cur(); if (!q) return;
    sqlEl.replaceChildren(h("details", { class: "cq-sqld" }, h("summary", {}, "SQL (baca-saja)"),
      h("pre", { class: "cq-pre", tabindex: "0", "aria-label": "SQL query, baca-saja" }, q.sql),
      h("p", { class: "cq-hint" }, ":from dan :to diisi dari parameter di atas saat dijalankan.")));
  }
  function renderCheck(msg, isErr) {
    const q = cur(); if (!q) return;
    const c = st.checks[q.id] || { status: "belum", note: "", rev: 0 };
    const draft = st.drafts[q.id] || { status: c.status, note: c.note };
    const name = "cq-chk-" + st.queries.indexOf(q);
    const radios = Object.keys(L.CHECK_STATES).map(k => h("label", { class: "cq-rd" },
      h("input", { type: "radio", name, value: k, checked: draft.status === k, onchange: () => { st.drafts[q.id] = { status: k, note: noteEl.value }; } }),
      h("span", {}, h("i", { "aria-hidden": "true" }, L.CHECK_STATES[k].sym), L.CHECK_STATES[k].label)));
    const noteEl = h("textarea", { id: "cq-note", rows: "3", maxlength: "1000", oninput: () => { const cs = checkEl.querySelector("input:checked"); st.drafts[q.id] = { status: cs ? cs.value : draft.status, note: noteEl.value }; } });
    noteEl.value = draft.note;
    const status = h("p", { class: "cq-status" + (isErr ? " err" : ""), role: "status", "aria-live": "polite" }, msg || (c.updatedAt ? `Tersimpan ${c.updatedAt.replace("T", " ")}` : "Belum pernah disimpan."));
    checkEl.replaceChildren(h("fieldset", { class: "cq-card" }, h("legend", {}, "Cek manual"),
      h("div", { class: "cq-rds", role: "radiogroup", "aria-label": "Hasil cek manual" }, radios),
      h("label", { class: "cq-f" }, h("span", {}, "Catatan"), noteEl),
      h("div", { class: "cq-arow" }, h("button", { type: "button", class: "cbtn primary", onclick: saveCheck }, "Simpan cek"), status)));
  }
  async function saveCheck() {
    const q = cur(); if (!q) return;
    const c = st.checks[q.id] || { rev: 0 };
    const chosen = checkEl.querySelector("input:checked");
    const payload = { rev: c.rev || 0, status: chosen ? chosen.value : "belum", note: checkEl.querySelector("#cq-note").value };
    try {
      const it = await api(`query-checks/${encodeURIComponent(q.id)}`, { method: "PUT", body: payload });
      st.checks[q.id] = it; delete st.drafts[q.id];
      renderCheck("Tersimpan."); renderList();
    } catch (e) {
      if (e.status === 409 && e.data && e.data.current) { st.checks[q.id] = e.data.current; delete st.drafts[q.id]; renderCheck(e.message, true); renderList(); }
      else renderCheck(e.message, true);
    }
  }

  // ---------- jalankan ----------
  async function runQuery() {
    const q = cur(); if (!q || st.running) return;
    if (!st.params.company) { setRunError(q, "Pilih company dulu."); return; }
    st.running = q.id; renderTitle();
    resEl.replaceChildren(h("p", { class: "cq-loading", role: "status" }, "Menjalankan query… bisa memakan waktu hingga 1 menit."));
    let resp;
    try {
      resp = await api("query/run", { method: "POST", body: { id: q.id, company: st.params.company, from: st.params.from, to: st.params.to } });
    } catch (e) {
      st.running = null;
      // 400/403/429: bukan hasil query, jangan dicatat sebagai status jalan
      setRunError(q, e.message);
      return;
    }
    st.running = null;
    const d = L.deriveRun(resp);
    st.runs[q.id] = { state: d.state, ms: d.ms, rows: d.rows, code: d.code || null };
    ssSet(RUNS_KEY, JSON.stringify(st.runs));
    if (resp.error) delete st.results[q.id];
    else { st.results[q.id] = { columns: resp.columns || [], rows: resp.rows || [], truncated: !!resp.truncated, ms: resp.ms, from: resp.from, to: resp.to, company: resp.company }; st.tv[q.id] = { q: "", col: null, dir: null, page: 0, size: 50 }; }
    renderList();
    if (st.sel === q.id) { renderTitle(); renderRes(); }
  }
  function setRunError(q, msg) {
    renderTitle();
    if (st.sel === q.id) resEl.replaceChildren(h("p", { class: "cq-err", role: "alert" }, msg));
  }

  // ---------- hasil ----------
  function renderRes() {
    const q = cur(); if (!q) return;
    const r = st.results[q.id], run = st.runs[q.id];
    if (!r) {
      let msg = "Belum dijalankan. Klik Jalankan untuk melihat hasil.";
      if (run && run.state === "tidak_tersedia") msg = "Query ini tidak tersedia di database ini (tabel atau kolom UDT/UDF belum ada).";
      else if (run && run.state === "gagal") msg = "Query gagal dijalankan. Detail ada di log server" + (run.code ? ` (kode ${run.code}).` : ".");
      else if (run) msg = "Hasil sebelumnya tidak disimpan. Jalankan lagi untuk melihat tabel.";
      resEl.replaceChildren(h("p", { class: "cq-none" + (run && (run.state === "gagal" || run.state === "tidak_tersedia") ? " err" : "") }, msg));
      return;
    }
    const tv = st.tv[q.id];
    const filter = h("input", { type: "search", class: "cq-search", id: "cq-rf", placeholder: "Filter hasil", "aria-label": "Filter hasil", value: tv.q, oninput: e => { tv.q = e.target.value; tv.page = 0; renderTable(); } });
    resEl.replaceChildren(...[
      r.truncated ?h("p", { class: "cq-warn", role: "status" }, `Hasil dipotong di ${fmtNum(st.maxRows)} baris pertama. Persempit rentang tanggal.`) : null,
      h("div", { class: "cq-rtool" }, h("label", { class: "cq-sr", for: "cq-rf" }, "Filter hasil"), filter,
        h("button", { type: "button", class: "cbtn", onclick: () => exportRes("csv") }, "CSV"),
        h("button", { type: "button", class: "cbtn", onclick: () => exportRes("xlsx") }, "Excel")),
      h("div", { id: "cq-tbl" })].filter(Boolean));
    renderTable();
  }
  function viewRows(q) {
    const r = st.results[q.id], tv = st.tv[q.id];
    const type = tv.col != null && r.columns[tv.col] ? r.columns[tv.col].type : "text";
    return L.sortRows(L.filterRows(r.rows, tv.q), tv.col, type, tv.dir);
  }
  function renderTable() {
    const q = cur(); if (!q || !st.results[q.id]) return;
    const r = st.results[q.id], tv = st.tv[q.id], host = $("#cq-tbl");
    const rows = viewRows(q), pg = L.paginate(rows.length, tv.page, tv.size);
    tv.page = pg.page; tv.size = pg.size;
    const th = r.columns.map((c, i) => {
      const dir = tv.col === i ? tv.dir : null;
      return h("th", { scope: "col", class: c.type === "num" ? "num" : "", "aria-sort": dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none" },
        h("button", { type: "button", class: "cq-sortb", title: "Urutkan menurut " + c.name, onclick: () => {
          if (tv.col !== i) { tv.col = i; tv.dir = "asc"; } else if (tv.dir === "asc") tv.dir = "desc"; else { tv.col = null; tv.dir = null; }
          tv.page = 0; renderTable();
        } }, c.name, h("i", { "aria-hidden": "true" }, dir === "asc" ? " ▲" : dir === "desc" ? " ▼" : "")));
    });
    const trs = rows.slice(pg.from, pg.to).map(row => h("tr", {}, row.map((v, i) => {
      const num = r.columns[i] && r.columns[i].type === "num" && v !== null;
      return h("td", { class: num ? "num" : "" }, v === null || v === undefined ? "" : num ? fmtNum(v) : String(v));
    })));
    const sizeSel = h("select", { id: "cq-size", "aria-label": "Baris per halaman", onchange: e => { tv.size = +e.target.value; tv.page = 0; renderTable(); } },
      L.PAGE_SIZES.map(n => h("option", { value: n, selected: n === tv.size }, `${n} / halaman`)));
    host.replaceChildren(
      h("div", { class: "cq-twrap", tabindex: "0", role: "region", "aria-label": "Tabel hasil, bisa digulir" },
        h("table", { class: "cq-t" }, h("caption", { class: "cq-sr" }, `Hasil ${q.label}`), h("thead", {}, h("tr", {}, th)),
          h("tbody", {}, trs.length ? trs : [h("tr", {}, h("td", { colspan: String(Math.max(1, r.columns.length)), class: "cq-none" }, r.rows.length ? "Tidak ada baris yang cocok dengan filter." : "Query berjalan tetapi tidak mengembalikan baris."))]))),
      h("div", { class: "cq-pager" },
        h("span", { class: "cq-pinfo", "aria-live": "polite" }, rows.length ? `${fmtNum(pg.from + 1)}–${fmtNum(pg.to)} dari ${fmtNum(rows.length)}${rows.length !== r.rows.length ? ` (disaring dari ${fmtNum(r.rows.length)})` : ""}` : "0 baris"),
        sizeSel,
        h("button", { type: "button", class: "cbtn", disabled: pg.page <= 0, onclick: () => { tv.page--; renderTable(); } }, "‹ Sebelumnya"),
        h("span", {}, `Hal. ${pg.page + 1} / ${pg.pages}`),
        h("button", { type: "button", class: "cbtn", disabled: pg.page >= pg.pages - 1, onclick: () => { tv.page++; renderTable(); } }, "Berikutnya ›")));
  }
  function exportRes(kind) {
    const q = cur(); if (!q || !st.results[q.id]) return;
    const r = st.results[q.id], rows = viewRows(q);
    const name = `query_${L.slugName(q.id)}_${r.from}_${r.to}`;
    if (kind === "csv") download(new Blob([L.csvOf(r.columns, rows)], { type: "text/csv;charset=utf-8" }), name + ".csv");
    else download(xlsxBlob([{ name: "Hasil", rows: L.toMatrix(r.columns, rows) }]), name + ".xlsx");
  }

  // ---------- navigasi (hash #q=<id>; tombol Kembali browser = kembali ke daftar di HP) ----------
  function route() {
    const m = /^#q=(.+)$/.exec(location.hash);
    let id = null;
    if (m) { try { id = decodeURIComponent(m[1]); } catch { id = null; } }
    const q = id ? st.queries.find(x => x.id === id) : null;
    st.sel = q ? q.id : null;
    cq.classList.toggle("open", !!q);
    empty.hidden = !!q; body.hidden = !q; bar.hidden = !q;
    listPane.querySelectorAll(".cq-item").forEach(b => { if (q && b.dataset.id === q.id) b.setAttribute("aria-current", "true"); else b.removeAttribute("aria-current"); });
    if (q) { renderTitle(); renderSql(); renderCheck(); renderRes(); if (cq.classList.contains("open")) detail.scrollTop = 0; }
  }

  // ---------- muat ----------
  async function init() {
    try {
      const [qs, ck, co] = await Promise.all([api("queries"), api("query-checks"), api("companies")]);
      st.queries = qs.queries || []; st.maxRows = qs.maxRows || 5000;
      st.checks = ck.checks || {}; st.companies = co.companies || [];
    } catch (e) {
      st.fatal = e.message;
      const f = $("#cq-fatal"); f.hidden = false; f.textContent = e.message + (e.code ? ` (kode ${e.code})` : "");
      cq.hidden = true;
      return;
    }
    fillCompanies();
    renderList();
    route();
    window.addEventListener("hashchange", route);
  }
  const ready = init();
  return { st, ready, route, runQuery, renderTable };
}
