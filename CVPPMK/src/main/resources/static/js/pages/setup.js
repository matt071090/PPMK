// Setup & Cut Off, halaman terpisah setup.html (hanya mode dev / edit).
// Setiap langkah data diisi dengan salah satu dari 2 cara: copy dari database lain, atau upload template Excel (templates.js).
// Apa pun caranya, data dibandingkan dulu dengan DB tujuan, lalu baris yang dipilih di-upload lewat Service Layer.
// Langkah & query ada di server (classpath:setup/steps.json, setup/sql/<id>.sql), diurutkan menurut ketergantungan data (tahap A-E).
// Alias kolom query = nama field Service Layer = baris ke-2 template Excel, jadi ketiganya bisa dibandingkan langsung.
// Kolom berawalan "_" = pembanding saja (tidak dikirim), mis. _ItemGroup: nama referensi yang kodenya bisa beda antar DB;
// kode tujuannya dicari lewat step.lookups saat upload. Langkah kind "ref" (branch, dimension) hanya sumber pencarian, tidak tampil.
import { $, $$, esc, isEmpty, onMount, flushMounts } from "../ui.js";
import { xlsxBlob, download } from "../xlsx.js";
import { readXlsx } from "../xlsx-read.js";
import { TEMPLATES, refLists, downloadTemplate } from "../templates.js";
import { uploadInChunks, progressUi, resultsTable } from "./upload-progress.js";
import { hanaPage } from "./hana.js";

const PROJECT = "CVPPMK";
const store = {
  get: k => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { } }
};
const getJson = async (url, opts) => {
  const r = await fetch(url, opts), d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || `HTTP ${r.status}`);
  return d;
};
const rowsOf = r => r && r.rows ? r.rows.map(row => Object.fromEntries(r.columns.map((c, i) => [c, row[i]]))) : [];

const TIERS = {
  A: ["Konfigurasi perusahaan", "Dicek manual di SAP sebelum data apa pun di-upload. Branch wajib ada sebelum Warehouse dan Business Partner."],
  B: ["Tanpa Chart of Accounts", "Tidak memakai akun G/L, jadi boleh dikerjakan sebelum COA. Currency paling awal karena dipakai akun."],
  C: ["Chart of Accounts", "Fondasi semua langkah berikutnya."],
  D: ["Butuh Chart of Accounts", "Memakai akun G/L. Baris yang merujuk akun yang belum ada di COA tujuan ditandai Error."],
  E: ["Master data utama", "Paling akhir karena merujuk hampir semua langkah di atas."],
  F: ["Addon STEM", "Parameter dan master STEM Addon. Dikerjakan setelah DBCreator STEM dijalankan di DB tujuan, dan setelah Document Numbering serta Chart of Accounts."],
  G: ["Addon Farm Breeding", "Parameter dan master Farm Breeding Addon. Dikerjakan setelah DBCreator Farm Breeding (yang berjalan sesudah DBCreator STEM) dan setelah tahap Addon STEM."]
};
const label = f => f.startsWith("_") ? f.slice(1) : f;
const tplOf = step => step.template && TEMPLATES.find(t => `T${t.no}` === step.template);

// ---------- sumber database (dipilih sekali, dipakai semua langkah) ----------
let sourcesP = null;
const loadSources = () => sourcesP || (sourcesP = getJson("api/setup/sources").catch(e => { sourcesP = null; throw e; }));
const currentSrc = () => store.get("setup-src") || "";
function sourceSelect(src, list) {
  const opt = (id, text) => `<option value="${esc(id)}"${id === src ? " selected" : ""}>${esc(text)}</option>`;
  return `<select data-sx-src aria-label="Database sumber">
      ${opt("", "– pilih database sumber –")}
      ${list.same.length ? `<optgroup label="Server yang sama">${list.same.map(s => opt(s.id, `${s.schema}${s.company ? " · " + s.company : ""}`)).join("")}</optgroup>` : ""}
      ${list.others.length ? `<optgroup label="Server lain">${list.others.map(s => opt(s.id, `${s.name} · ${s.url}`)).join("")}</optgroup>` : ""}
    </select>
    ${(list.missing || []).length ? `<span class="badge warn" title="Cek ejaan di setup.source-dbs (application.properties)">DB sumber tidak ditemukan di server: ${list.missing.map(esc).join(", ")}</span>` : ""}`;
}
const srcName = (src, list) => {
  const s = [...list.same, ...list.others].find(x => x.id === src);
  return s ? s.schema || s.name : src;
};
const dataUrl = (id, src) => `api/setup/${id}${src ? `?src=${encodeURIComponent(src)}` : ""}`;

// ---------- data referensi tujuan (dicache selama halaman terbuka; dihapus saat Muat ulang) ----------
const tgtCache = new Map();
const targetRows = id => tgtCache.get(id) || (tgtCache.set(id, getJson(dataUrl(id, "")).then(d => rowsOf(d.target))
  .catch(e => { tgtCache.delete(id); throw e; })), tgtCache.get(id));

const norm = v => isEmpty(v) ? "" : String(v).trim();
const up = v => norm(v).toUpperCase();
const numLike = v => v !== "" && isFinite(+v);
// lookups: { "<step id>|<field by>": Map(NAMA -> _key tujuan) }
async function loadLookups(step) {
  const out = {};
  for (const l of step.lookups || []) {
    const k = `${l.step}|${l.by}`;
    if (!out[k]) out[k] = new Map((await targetRows(l.step)).map(r => [up(r[l.by]), r._key]));
  }
  return out;
}

// ---------- template Excel -> baris sumber ----------
// Dropdown template: "kode - nama" (ambil kodenya) atau nama (dicari kodenya di data tujuan langkah referensi).
const CODE_SPLIT = new Set(["accounts", "titles", "banks", "country"]);
const REF_STEPS = {
  vat_in: ["tax-groups", "Name", "Code"], vat_out: ["tax-groups", "Name", "Code"], dims: ["dimensions", "Name", "_key"],
  branches: ["branches", "Name", "_key"], pricelists: ["price-lists", "PriceListName", "_key"],
  payterms: ["payment-terms", "PaymentTermsGroupName", "_key"], slp: ["sales-employees", "SalesEmployeeName", "_key"],
  bpgroups: ["bp-groups", "Name", "_key"], itemgroups: ["item-groups", "GroupName", "_key"]
};
const excelDate = n => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10);
// hasil: { sheet, rows: [{...field, _row, _errors}] } atau throw kalau file bukan template langkah ini
export async function excelRows(step, tpl, sheets) {
  const main = tpl.sheets[0];
  const sh = sheets.find(s => s.name === main.name) || sheets.find(s => !s.hidden);
  const fields = (sh && sh.rows[1] || []).map(norm);
  if (!sh || !main.fields.filter(f => f.req).every(f => fields.includes(f.field)))
    throw new Error(`File ini bukan template T${tpl.no} ${tpl.title}: sheet "${main.name}" dengan nama field di baris 2 tidak ditemukan.`);
  const defs = Object.fromEntries(main.fields.map(f => [f.field, f]));
  const lookupBy = Object.fromEntries((step.lookups || []).map(l => [l.field, l]));
  const refs = {};
  for (const f of main.fields) if (f.ref && REF_STEPS[f.ref] && !lookupBy[f.field]) {
    const [id, by, take] = REF_STEPS[f.ref], rows = await targetRows(id);
    refs[f.ref] = { byName: new Map(rows.map(r => [up(r[by]), r[take]])), codes: new Set(rows.map(r => norm(r[take]))) };
  }
  const rows = [];
  sh.rows.slice(2).forEach((cells, i) => {
    if (!cells.some(c => norm(c) !== "")) return;
    const o = { _row: i + 3, _errors: [] }, err = m => o._errors.push(`Baris ${i + 3}: ${m}`);
    fields.forEach((name, x) => {
      if (!name) return;
      const def = defs[name] || {}, raw = cells[x];
      let v = typeof raw === "number" ? raw : norm(raw);
      if (v === "") { if (def.req) err(`${def.label || name} wajib diisi`); return; }
      if (def.kind === "date" && typeof v === "number") v = excelDate(v);
      v = String(v);
      if (def.enum) {
        if (v in def.enum) v = def.enum[v];
        else if (!Object.values(def.enum).includes(v)) return err(`${def.label} "${v}" bukan pilihan dari dropdown`);
      }
      if (def.kind === "num" && !numLike(v)) return err(`${def.label} "${v}" bukan angka`);
      const l = lookupBy[name];
      if (l) { o[l.from] = v; return; }                       // nama referensi, kodenya dicari saat upload
      if (def.ref && CODE_SPLIT.has(def.ref)) v = v.split(" - ")[0].trim();
      else if (def.ref && refs[def.ref]) {
        const r = refs[def.ref], code = r.byName.get(v.toUpperCase());
        if (code !== undefined) v = String(code);
        else if (!r.codes.has(v)) return err(`${def.label} "${v}" tidak ada di tujuan`);
      }
      o[name] = v;
    });
    rows.push(o);
  });
  return { sheet: sh.name, rows };
}
// baris sumber -> sheet utama template (dipakai "Export ke template Excel" di cara database)
export function templateSheet(step, tpl, list) {
  const main = tpl.sheets[0], lookupBy = Object.fromEntries((step.lookups || []).map(l => [l.field, l]));
  const back = f => f.enum ? Object.fromEntries(Object.entries(f.enum).map(([k, v]) => [v, k])) : null;
  const value = (f, r) => {
    const v = lookupBy[f.field] ? norm(r[lookupBy[f.field].from]) : norm(r[f.field]), b = back(f);
    return b && b[v] !== undefined ? b[v] : f.kind === "num" && numLike(v) ? +v : v;
  };
  return { name: main.name, rows: [main.fields.map(f => f.label + (f.req ? " *" : "")), main.fields.map(f => f.field),
    ...list.map(r => main.fields.map(f => value(f, r)))] };
}
let refP = null;   // dropdown template dari SAP tujuan, dipakai ulang
const loadRef = () => refP || (refP = getJson("api/section/template-ref").then(d => refLists(d.results)).catch(e => { refP = null; throw e; }));

// ---------- perbandingan sumber vs tujuan ----------
function same(a, b, numeric) {
  a = norm(a); b = norm(b);
  if (numeric || (numLike(a) && numLike(b))) return (+a || 0) === (+b || 0);
  return a === b;
}
// data: { target: {columns, rows}, source?: {columns, rows}, sourceRows?: [obj], targetAccounts? }
// hasil: { fields, rows: [{status: new|diff|same|error|target, src, tgt, diffs: Set, errors: []}] }
export function compare(step, data, lookups = {}) {
  const target = rowsOf(data.target), tgtCols = new Set((data.target && data.target.columns) || []);
  const source = data.sourceRows || (data.source ? rowsOf(data.source) : null);
  const cols = data.sourceRows ? [...tgtCols, ...new Set(data.sourceRows.flatMap(Object.keys))].filter((c, i, a) => a.indexOf(c) === i)
    : (data.source && data.source.columns) || (data.target && data.target.columns) || [];
  const fields = cols.filter(c => c !== "_key" && c !== "_row" && c !== "_errors");
  const numeric = new Set(step.numeric || []), key = r => step.match.map(f => up(r[f])).join("|");
  const tgtBy = new Map(target.map(t => [key(t), t]));
  const accts = data.targetAccounts ? new Set(data.targetAccounts) : null;
  const info = new Set(step.info || []);   // kolom info (mis. _Level): ditampilkan, tidak dibandingkan, tidak dikirim
  if (!source) return { fields, rows: target.map(t => ({ status: "target", tgt: t, diffs: new Set(), errors: [] })) };
  // hierarki (COA): level baris sumber dihitung dari rantai induk kalau belum ada (mis. dari Excel), induk harus ada di tujuan / sumber
  const P = step.parent, srcCodes = P ? new Map(source.map(s => [norm(s[P.key]), s])) : null;
  const tgtLevel = P ? new Map(target.map(t => [norm(t[P.key]), +t[P.level] || 0])) : null;
  const levelOf = (code, depth = 0) => {
    if (!code || depth > 20) return 0;
    if (tgtLevel.has(code) && !srcCodes.has(code)) return tgtLevel.get(code);
    const s = srcCodes.get(code);
    if (!s) return 0;
    if (!isEmpty(norm(s[P.level]))) return +s[P.level];
    const father = norm(s[P.field]);
    return father ? levelOf(father, depth + 1) + 1 : 1;
  };
  if (P) source.forEach(s => { if (isEmpty(norm(s[P.level]))) s[P.level] = String(levelOf(norm(s[P.key])) || ""); });
  const seen = new Set(), rows = [];
  for (const s of source) {
    const k = key(s), t = tgtBy.get(k), errors = [...(s._errors || [])];
    if (seen.has(k)) errors.push(`Duplikat di sumber: ${step.match.map(f => s[f]).join(" / ")}`);
    seen.add(k);
    // field yang dibandingkan hanya yang juga ada di query tujuan; field tambahan dari template ikut dikirim saat baris baru
    const diffs = new Set(t ? fields.filter(f => tgtCols.has(f) && !info.has(f) && f in s && !same(s[f], t[f], numeric.has(f))) : []);
    const touched = f => !isEmpty(norm(s[f])) && (!t || diffs.has(f));
    for (const f of step.required || []) if (isEmpty(norm(s[f]))) errors.push(`${label(f)} wajib diisi`);
    if (P && touched(P.field) && !tgtLevel.has(norm(s[P.field])) && !srcCodes.has(norm(s[P.field])))
      errors.push(`Akun induk ${s[P.field]} tidak ada di tujuan maupun di data sumber`);
    if (accts) for (const f of step.accounts || [])
      if (touched(f) && !accts.has(norm(s[f]))) errors.push(`Akun ${s[f]} (${f}) tidak ada di COA tujuan`);
    for (const l of step.lookups || [])
      if (touched(l.from) && !(lookups[`${l.step}|${l.by}`] || new Map()).has(up(s[l.from])))
        errors.push(`${label(l.from)} "${s[l.from]}" belum ada di tujuan`);
    // baris anak (step.children): upload tidak mengubah detail yang sudah ada (PATCH koleksi UDO bisa menggandakan baris)
    const childFrom = new Set((step.children || []).map(c => c.from));
    if (t && childFrom.size && diffs.size && [...diffs].every(f => childFrom.has(f)))
      errors.push("Detail beda dengan sumber; upload tidak bisa mengubah baris detail, ubah di SAP");
    const status = errors.length ? "error" : t && !diffs.size ? "same" : t ? "diff" : "new";
    rows.push({ status, src: s, tgt: t, diffs, errors });
  }
  target.filter(t => !seen.has(key(t))).forEach(t => rows.push({ status: "target", tgt: t, diffs: new Set(), errors: [] }));
  return { fields, rows };
}
const STATUS = {
  new: ["Baru", "info"], diff: ["Beda", "warn"], same: ["Sama", ""], error: ["Error", "danger"], target: ["Hanya di tujuan", ""]
};
const uploadable = r => r.status === "new" || r.status === "diff";

// body upload: baris baru = semua field terisi, baris beda = hanya field yang berubah (+ step.alwaysSend).
// Kolom "_..." tidak dikirim; field lookup diisi kode tujuan dari nama referensinya.
export function payload(step, r, lookups) {
  const numeric = new Set(step.numeric || []);
  const val = (f, v) => numeric.has(f) ? +v : v;
  const fs = (r.status === "new" ? Object.keys(r.src) : [...new Set([...r.diffs, ...(step.alwaysSend || [])])])
    .filter(f => !f.startsWith("_") && !isEmpty(norm(r.src[f])));
  const data = Object.fromEntries(fs.map(f => [f, val(f, norm(r.src[f]))]));
  for (const l of step.lookups || []) {
    const v = norm(r.src[l.from]);
    if (!v || (r.status !== "new" && !r.diffs.has(l.from))) continue;
    const k = lookups[`${l.step}|${l.by}`].get(v.toUpperCase());
    data[l.field] = numLike(String(k)) ? +k : k;
  }
  // baris anak UDO (step.children): hanya untuk baris baru; _Detail = nilai digabung, dipecah jadi satu baris anak per nilai
  if (r.status === "new") for (const c of step.children || []) {
    const v = norm(r.src[c.from]);
    if (!v) continue;
    // anak banyak kolom (c.fields): baris dipisah c.rowSep, kolom dipisah c.colSep, kolom kosong tidak dikirim
    if (c.fields) data[c.collection] = v.split(c.rowSep || "¦").map(row => Object.fromEntries(row.split(c.colSep || "^")
      .map((x, i) => [c.fields[i], x.trim()]).filter(([k, x]) => k && x !== "").map(([k, x]) => [k, (c.numeric || []).includes(k) ? +x : x]))).filter(o => Object.keys(o).length);
    else data[c.collection] = v.split(c.sep || "|").map(x => x.trim()).filter(Boolean).map(x => ({ [c.field]: x }));
  }
  return r.status === "new" ? { action: "create", data } : { action: "update", key: r.tgt._key, data };
}

// ---------- halaman satu langkah ----------
const canUpload = s => s.upload !== false && !!s.entity;
function stepHead(step) {
  const tpl = tplOf(step);
  return `${step.note ? `<p class="sx-note-box">${esc(step.note)}</p>` : ""}
    <div class="sx-facts">
      ${step.requires ? `<span><b>Butuh:</b> ${step.requires.map(esc).join(", ")}</span>` : ""}
      ${tpl ? `<span><b>Template Excel:</b> ${esc(step.template)} ${esc(tpl.title)}</span>` : ""}
      ${step.kind === "data" ? `<span><b>Dicocokkan lewat:</b> ${step.match.map(f => `<code>${esc(label(f))}</code>`).join(" + ")}</span>` : ""}
    </div>`;
}
function stepPage(step) {
  if (step.kind === "setting") return {
    lead: "Langkah setting: dicek dan diatur manual di SAP B1, tidak di-upload dari sini.",
    doc: step.doc,
    render: () => stepHead(step) + `<p class="sx-actions">
      <a class="cbtn primary" href="index.html#/${esc(step.doc)}">Buka konfigurasi saat ini di dokumentasi →</a>
      ${tplOf(step) ? `<button type="button" class="cbtn" data-sx-tpl>⤓ Download template ${esc(step.template)}</button>` : ""}</p>`,
    mount: box => { const b = $("[data-sx-tpl]", box); if (b) b.onclick = () => getTemplate(step, b); }
  };
  return {
    lead: `Isi data ${esc(step.title)} dengan salah satu dari 2 cara, cek perbandingannya dengan SAP tujuan, lalu upload baris yang dipilih`
      + (canUpload(step) ? "." : " (upload untuk langkah ini menyusul; sekarang bandingkan & export dulu)."),
    menu: canUpload(step) ? `Service Layer › ${step.action ? step.action.create : step.entity}` : "",
    doc: step.doc,
    render() {
      const id = `sx-${step.id}`;
      onMount(() => mountStep(step, $(`#${id}`)));
      return stepHead(step) + `<div class="sx" id="${id}">
        <ol class="sx-steps" aria-label="Tahapan">
          <li data-n="1"><span class="sx-num">1</span><span><b>Pilih cara isi data</b><small data-sx-s1>database lain atau Excel</small></span></li>
          <li data-n="2"><span class="sx-num">2</span><span><b>Cek &amp; bandingkan</b><small>dengan data di SAP tujuan</small></span></li>
          <li data-n="3"><span class="sx-num">3</span><span><b>Upload ke SAP</b><small>baris yang dipilih</small></span></li>
        </ol>
        <h2 class="sx-h">0. Yang sudah ada di DB tujuan</h2>
        <div class="sx-now"><p class="sx-req">Memuat…</p></div>
        <h2 class="sx-h">1. Pilih cara isi data</h2>
        <div class="sx-ways" role="radiogroup" aria-label="Cara isi data">
          <div class="sx-way" data-way="db">
            <label class="sx-way-h"><input type="radio" name="way-${step.id}" value="db"><b>Copy dari database lain</b></label>
            <p class="sx-way-d">Ambil ${esc(step.title)} langsung dari company DB lain, mis. DB lama untuk cut off.</p>
            <div class="sx-way-b" data-body="db"></div>
          </div>
          <div class="sx-way" data-way="excel">
            <label class="sx-way-h"><input type="radio" name="way-${step.id}" value="excel"${tplOf(step) ? "" : " disabled"}><b>Upload template Excel</b></label>
            <p class="sx-way-d">${tplOf(step) ? `Isi template ${esc(step.template)}, lalu upload filenya. Dropdown di template diambil dari SAP tujuan.`
              : "Belum ada template Excel untuk langkah ini."}</p>
            <div class="sx-way-b" data-body="excel"></div>
          </div>
        </div>
        <h2 class="sx-h">2. Cek &amp; bandingkan <span class="sx-cmp-label"></span></h2>
        <div class="sx-body"><p class="sx-req">Pilih cara isi data di atas.</p></div>
        <details class="grp sx-sql"><summary><span>Query &amp; mapping kolom <span class="muted">· untuk review: alias = nama field Service Layer = baris 2 template</span></span></summary>
          <pre class="sx-pre" data-sx-sql>Memuat…</pre></details>
      </div>`;
    }
  };
}
async function getTemplate(step, btn) {
  const text = btn.innerHTML;
  btn.disabled = true; btn.textContent = "Menyiapkan…";
  try { downloadTemplate(tplOf(step), await loadRef(), PROJECT); }
  catch (e) { alert(`Gagal membuat template: ${e.message}`); }
  finally { btn.disabled = false; btn.innerHTML = text; }
}

const excelState = new Map();   // step id -> { file, rows, sheet } file Excel terakhir, tetap ada saat pindah cara
const stage = (box, n, done) => $$(".sx-steps li", box).forEach(li => {
  const i = +li.dataset.n;
  li.className = i < n || (i === n && done) ? "done" : i === n ? "now" : "";
  $(".sx-num", li).textContent = li.className === "done" ? "✓" : i;
});

// Isi DB tujuan saat ini: query langkah yang sama, hanya SELECT. Ditampilkan sebelum membandingkan dengan sumber,
// supaya terlihat apa yang sudah ada di tujuan (mis. tabel addon sudah terisi dari DB lama atau masih kosong).
async function showNow(step, el) {
  if (!el) return;
  el.innerHTML = `<p class="sx-req">Memuat…</p>`;
  try {
    const t = (await getJson(dataUrl(step.id, ""))).target || {};
    if (t.error) {
      el.innerHTML = `<div class="error">Tidak bisa membaca DB tujuan: ${esc(t.error)}<br>Kalau tabelnya belum ada, jalankan DBCreator addon di DB tujuan dulu.</div>`;
      return;
    }
    const cols = (t.columns || []).filter(c => !c.startsWith("_")), idx = cols.map(c => t.columns.indexOf(c)), rows = t.rows || [], SHOW = 15;
    if (!rows.length) {
      el.innerHTML = `<p class="sx-req"><b>0</b> baris. Tabel ada tapi masih kosong, jadi semua data dari sumber akan berstatus baru.</p>`;
      return;
    }
    el.innerHTML = `<p class="sx-req"><b>${rows.length}</b> baris sudah ada di DB tujuan${rows.length > SHOW ? `, menampilkan ${SHOW} pertama` : ""}. Nanti dibandingkan dengan sumber di langkah 2.</p>
      <div class="table-wrap"><table class="data"><thead><tr>${cols.map(c => `<th>${esc(label(c))}</th>`).join("")}</tr></thead>
      <tbody>${rows.slice(0, SHOW).map(r => `<tr>${idx.map(i => `<td>${esc(norm(r[i]))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  } catch (e) {
    el.innerHTML = `<div class="error">Gagal memuat: ${esc(e.message)}</div>`;
  }
}

async function mountStep(step, box) {
  if (!box) return;
  showNow(step, $(".sx-now", box));
  const sql = $(".sx-sql", box);
  sql.ontoggle = () => { if (sql.open && $("[data-sx-sql]", box).textContent === "Memuat…")
    fetch(`api/setup/${step.id}/sql`).then(r => r.text()).then(t => $("[data-sx-sql]", box).textContent = t); };
  const tpl = tplOf(step);
  let way = store.get(`setup-way:${step.id}`) || "db";
  if (way === "excel" && !tpl) way = "db";
  $$(".sx-way", box).forEach(c => {
    const on = c.dataset.way === way;
    c.classList.toggle("on", on);
    $("input[type=radio]", c).checked = on;
    $("input[type=radio]", c).onchange = () => { store.set(`setup-way:${step.id}`, c.dataset.way); mountStep(step, box); };
    $(".sx-way-b", c).hidden = !on;
  });
  const body = $(".sx-body", box), cmpLabel = $(".sx-cmp-label", box);
  let list;
  try { list = await loadSources(); }
  catch (e) { body.innerHTML = `<div class="error">Daftar sumber gagal dimuat: ${esc(e.message)}</div>`; return; }
  const reload = () => { tgtCache.clear(); mountStep(step, box); };

  if (way === "db") {
    const src = currentSrc(), dbBody = $('[data-body="db"]', box);
    dbBody.innerHTML = `<div class="sx-row">${sourceSelect(src, list)}<button type="button" class="cbtn" data-sx-reload>↻ Baca ulang</button></div>
      <small class="muted" data-sx-info></small>`;
    $("[data-sx-src]", dbBody).onchange = e => { store.set("setup-src", e.target.value); mountStep(step, box); };
    $("[data-sx-reload]", dbBody).onclick = reload;
    $("[data-sx-s1]", box).textContent = src ? `Copy dari ${srcName(src, list)}` : "database lain atau Excel";
    if (!src) {
      stage(box, 1, false);
      cmpLabel.textContent = "";
      body.innerHTML = `<p class="sx-req">Pilih database sumber di atas. Data ${esc(step.title)} yang sudah ada di ${esc(list.target)}:</p><div class="sx-tgt"></div>`;
      try { drawStep(step, $(".sx-tgt", body), compare(step, await getJson(dataUrl(step.id, ""))), { target: list.target, tpl }); }
      catch (e) { $(".sx-tgt", body).innerHTML = `<div class="error">Gagal membaca data tujuan: ${esc(e.message)}</div>`; }
      return;
    }
    stage(box, 2, false);
    cmpLabel.textContent = `· ${srcName(src, list)} → ${list.target}`;
    body.innerHTML = `<div class="skeleton"><div></div><div></div><div></div></div>`;
    let data, lookups;
    try { [data, lookups] = await Promise.all([getJson(dataUrl(step.id, src)), loadLookups(step)]); }
    catch (e) { body.innerHTML = `<div class="error">Gagal membaca data: ${esc(e.message)}</div>`; return; }
    const errs = [["tujuan", data.target], ["sumber", data.source]].filter(([, r]) => r && r.error);
    if (errs.length) { body.innerHTML = `<div class="error">${errs.map(([w, r]) => `Query di ${w} gagal: ${esc(r.error)}`).join("<br>")}</div>`; return; }
    $("[data-sx-info]", dbBody).textContent = `${data.source.rows.length} baris dibaca dari ${srcName(src, list)}, ${data.generatedAt.replace("T", " ")}`;
    drawStep(step, body, compare(step, data, lookups), { hasSrc: true, way, target: list.target, tpl, lookups, box });
    return;
  }

  // cara Excel
  const xlBody = $('[data-body="excel"]', box), st = excelState.get(step.id);
  xlBody.innerHTML = `<div class="sx-row"><button type="button" class="cbtn" data-sx-tpl>⤓ Download template ${esc(step.template)}</button>
      <label class="cbtn primary sx-file">Pilih file .xlsx…<input type="file" accept=".xlsx" hidden></label></div>
    ${st ? `<div class="sx-filechip"><b>${esc(st.file)}</b><span class="muted">· sheet ${esc(st.sheet)} · ${st.rows.length} baris terbaca</span></div>` : ""}`;
  $("[data-sx-tpl]", xlBody).onclick = e => getTemplate(step, e.currentTarget);
  $("input[type=file]", xlBody).onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    body.innerHTML = `<div class="skeleton"><div></div><div></div><div></div></div>`;
    try {
      const { sheet, rows } = await excelRows(step, tpl, await readXlsx(f));
      excelState.set(step.id, { file: f.name, sheet, rows });
      mountStep(step, box);
    } catch (err) { body.innerHTML = `<div class="error">${esc(err.message)}</div>`; }
  };
  $("[data-sx-s1]", box).textContent = st ? `File ${st.file}` : "database lain atau Excel";
  if (!st) { stage(box, 1, false); cmpLabel.textContent = ""; body.innerHTML = `<p class="sx-req">Download template, isi datanya mulai baris 3, lalu pilih filenya di atas.</p>`; return; }
  stage(box, 2, false);
  cmpLabel.textContent = `· file Excel → ${list.target}`;
  body.innerHTML = `<div class="skeleton"><div></div><div></div><div></div></div>`;
  let data, lookups;
  try { [data, lookups] = await Promise.all([getJson(dataUrl(step.id, "")), loadLookups(step)]); }
  catch (e) { body.innerHTML = `<div class="error">Gagal membaca data tujuan: ${esc(e.message)}</div>`; return; }
  if (data.target.error) { body.innerHTML = `<div class="error">Query di tujuan gagal: ${esc(data.target.error)}</div>`; return; }
  drawStep(step, body, compare(step, { ...data, sourceRows: st.rows }, lookups), { hasSrc: true, way, target: list.target, tpl, lookups, box,
    fileErrors: st.rows.filter(r => r._errors.length).length });
}

// urutan kirim: step.uploadSort (mis. COA: ActiveAccount tNO dulu = semua akun judul, lalu level naik, lalu kode),
// angka dibandingkan sebagai angka; baris dikirim server satu per satu dalam urutan ini
export function sortForUpload(step, list) {
  const keys = step.uploadSort || [];
  const cmp = (a, b) => {
    for (const k of keys) {
      const x = norm(a.src[k]), y = norm(b.src[k]);
      const d = numLike(x) && numLike(y) ? +x - +y : x.localeCompare(y);
      if (d) return d;
    }
    return 0;
  };
  return keys.length ? [...list].sort(cmp) : list;
}

// opt: { hasSrc, way ("db" | "excel"), target, tpl, lookups, box, fileErrors }
function drawStep(step, body, cmp, opt) {
  const { fields, rows } = cmp, hasSrc = !!opt.hasSrc, upl = hasSrc && canUpload(step);
  const count = s => rows.filter(r => r.status === s).length;
  const chips = hasSrc ? [["", "Semua", rows.length], ...["new", "diff", "same", "error", "target"].map(s => [s, STATUS[s][0], count(s)])] : [];
  const info = new Set(step.info || []), P = step.parent;
  // hierarki (COA): nama diberi indentasi per level, akun judul ditebalkan
  const isTitle = row => P && P.title && norm(row[P.title[0]]) === P.title[1];
  const cell = (r, f) => {
    const s = r.src, t = r.tgt, row = s || t;
    let html = !s ? esc(norm(t[f])) : r.diffs.has(f) ? `<span class="sx-old">${esc(norm(t[f])) || "∅"}</span><b>${esc(norm(s[f])) || "∅"}</b>` : esc(norm(s[f]));
    if (P && f === "Name") html = `<span style="padding-left:${Math.max((+row[P.level] || 1) - 1, 0) * 14}px">${isTitle(row) ? `<b>${html}</b>` : html}</span>`;
    return html;
  };
  const th = f => info.has(f) ? `<th>${esc(label(f))}</th>`
    : f.startsWith("_") ? `<th class="sx-ref" title="Pembanding saja, tidak dikirim; kode di tujuan dicari lewat nama ini">${esc(label(f))} ↔</th>` : `<th>${esc(f)}</th>`;
  body.innerHTML = `
    ${opt.fileErrors ? `<div class="error"><b>${opt.fileErrors} baris di file tidak lolos cek template</b> (baris Error di bawah, lihat kolom Catatan). Perbaiki di Excel lalu pilih ulang filenya.</div>` : ""}
    ${hasSrc ? `<div class="chips" role="group" aria-label="Saring status">${chips.map(([s, l, n], i) =>
      `<button type="button" class="chip" data-st="${s}" aria-pressed="${!i}">${esc(l)}<b>${n}</b></button>`).join("")}</div>` : ""}
    <div class="table-wrap tall"><table class="data sx-table">
      <thead><tr>${upl ? `<th><input type="checkbox" data-sx-all aria-label="Pilih semua baris yang bisa di-upload"></th>` : ""}${hasSrc ? "<th>Status</th>" : ""}
        ${fields.map(th).join("")}${hasSrc ? "<th>Catatan</th>" : ""}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr data-i="${i}" data-st="${r.status}" class="sx-${r.status}">
        ${upl ? `<td><input type="checkbox" data-sx-row="${i}"${uploadable(r) ? " checked" : " disabled"} aria-label="Pilih baris"></td>` : ""}
        ${hasSrc ? `<td><span class="badge ${STATUS[r.status][1]}">${STATUS[r.status][0]}</span></td>` : ""}
        ${fields.map(f => `<td>${cell(r, f)}</td>`).join("")}
        ${hasSrc ? `<td class="sx-note">${r.errors.map(esc).join("<br>") || (r.status === "diff" ? `${r.diffs.size} field berubah` : "")}</td>` : ""}
      </tr>`).join("") || `<tr><td colspan="${fields.length + 3}" style="text-align:center;color:var(--muted);padding:28px">Tidak ada data</td></tr>`}</tbody>
    </table></div>
    <div class="sx-bar">
      ${hasSrc ? `<b class="sx-bar-h">3. Upload ke SAP</b>` : ""}<span class="sx-count"></span>
      ${opt.way === "db" && opt.tpl ? `<button type="button" class="xbtn" data-sx-totpl title="Simpan data sumber ke format template ${esc(step.template)}, bisa diedit lalu di-upload lewat cara Excel">⤓ Export ke template Excel</button>` : ""}
      <button type="button" class="xbtn" data-sx-export>⤓ Export hasil cek</button>
      ${upl ? `<button type="button" class="cbtn primary" data-sx-upload>Upload ke SAP…</button>` : hasSrc ? `<span class="badge">Upload menyusul</span>` : ""}
    </div>
    <div class="sx-result"></div>`;

  const boxes = $$("[data-sx-row]", body), all = $("[data-sx-all]", body), cnt = $(".sx-count", body);
  const visible = () => rows.filter((r, i) => !$(`tr[data-i="${i}"]`, body).hidden);
  const picked = () => upl ? boxes.filter(b => b.checked && !b.closest("tr").hidden).map(b => rows[+b.dataset.sxRow]) : visible();
  const refresh = () => {
    const p = picked();
    cnt.innerHTML = upl ? `<b>${p.length}</b> baris dipilih · ${p.filter(r => r.status === "new").length} baru, ${p.filter(r => r.status === "diff").length} beda`
      : `${p.length} baris`;
    if (all) all.checked = p.length > 0 && p.length === boxes.filter(b => !b.disabled && !b.closest("tr").hidden).length;
  };
  boxes.forEach(b => b.onchange = refresh);
  if (all) all.onchange = () => { boxes.filter(b => !b.disabled && !b.closest("tr").hidden).forEach(b => b.checked = all.checked); refresh(); };
  $$(".chip", body).forEach(c => c.onclick = () => {
    $$(".chip", body).forEach(x => x.setAttribute("aria-pressed", x === c));
    $$("tbody tr[data-st]", body).forEach(tr => tr.hidden = !!c.dataset.st && tr.dataset.st !== c.dataset.st);
    refresh();
  });
  refresh();

  $("[data-sx-export]", body).onclick = () => {
    const list = picked();
    const head = [...(hasSrc ? ["Status"] : []), ...fields, ...(hasSrc ? ["Catatan"] : [])];
    const out = list.map(r => [...(hasSrc ? [STATUS[r.status][0]] : []), ...fields.map(f => norm((r.src || r.tgt)[f])), ...(hasSrc ? [r.errors.join("; ")] : [])]);
    download(xlsxBlob([{ name: step.title.slice(0, 31), rows: [head, ...out] }]), `Setup ${step.order} ${step.title} - hasil cek - ${PROJECT}.xlsx`);
  };
  const toTpl = $("[data-sx-totpl]", body);
  if (toTpl) toTpl.onclick = () => {
    const list = picked().filter(r => r.src).map(r => r.src);
    if (!list.length) return alert("Belum ada baris sumber yang dipilih.");
    download(xlsxBlob([templateSheet(step, opt.tpl, list)]), `${PROJECT} - ${opt.tpl.no} - ${opt.tpl.title} (dari database).xlsx`);
  };

  const btn = $("[data-sx-upload]", body);
  if (btn) btn.onclick = async () => {
    const list = sortForUpload(step, picked());
    if (!list.length) return alert("Belum ada baris yang dipilih.");
    const nNew = list.filter(r => r.status === "new").length, nDiff = list.length - nNew;
    if (!confirm(`Tulis ke database ${opt.target} lewat Service Layer (${step.action ? "SeriesService" : step.entity}):\n\n`
      + `• ${nNew} baris baru akan dibuat\n• ${nDiff} baris akan diperbarui\n\nLanjutkan?`)) return;
    btn.disabled = true; btn.textContent = "Mengirim…";
    const res = $(".sx-result", body);
    const prog = progressUi(step.title, list.length);
    try {
      const url = `api/setup/${step.id}/upload`;
      const { results, aborted } = await uploadInChunks(list.map(r => payload(step, r, opt.lookups)),
        part => getJson(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: part }) }),
        { onProgress: prog.update, shouldStop: prog.isStopped });
      prog.close();
      const ok = results.filter(x => x.ok).length, unsent = list.length - results.length;
      if (opt.box) stage(opt.box, 3, ok > 0);
      tgtCache.delete(step.id);
      showNow(step, document.querySelector(`#sx-${step.id} .sx-now`));   // isi tujuan setelah upload
      res.innerHTML = `<h3>Hasil upload</h3>
        <p class="sx-req"><b>${ok}</b> berhasil, <b>${results.length - ok}</b> gagal${unsent ? `, <b>${unsent}</b> belum dikirim (${aborted ? "pengiriman terhenti: " + esc(aborted) : "dihentikan"})` : ""}. Baca ulang untuk membandingkan lagi dengan data terbaru.</p>
        <div class="sx-res-tbl"></div>`;
      resultsTable($(".sx-res-tbl", res), results.map((x, i) => ({ ok: !!x.ok, action: list[i].status === "new" ? "Dibuat" : "Diperbarui",
        cells: step.match.map(f => norm(list[i].src[f])), message: x.message })), step.match.map(label));
      res.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      res.innerHTML = `<div class="error">Upload gagal: ${esc(e.message)}</div>`;
    } finally {
      prog.close();
      btn.disabled = false; btn.textContent = "Upload ke SAP…";
    }
  };
}

// ---------- ringkasan: semua langkah per tahap ----------
const ways = s => s.kind === "setting" ? (s.template ? `Manual · Excel ${s.template}` : "Manual di SAP")
  : s.template ? `Database · Excel ${s.template}` : "Database";
function overviewPage(steps) {
  return {
    lead: "Semua setup & master data, diurutkan menurut ketergantungan datanya: langkah yang tidak memakai akun G/L ada di atas Chart of Accounts.",
    render() {
      onMount(() => mountOverview(steps, $("#sx-overview")));
      onMount(() => wireOverviewSearch($("#sx-overview")));
      const tiers = Object.keys(TIERS).filter(t => steps.some(s => s.tier === t));
      return `<div class="sx" id="sx-overview">
        <div class="sx-ways sx-ways-info">
          <div class="sx-way"><b>Copy dari database lain</b><p class="sx-way-d">Ambil data langsung dari company DB lain, mis. DB lama untuk cut off.</p></div>
          <div class="sx-way"><b>Upload template Excel</b><p class="sx-way-d">Download template langkahnya, isi datanya, lalu upload filenya. Dipakai kalau data belum ada di SAP mana pun.</p></div>
        </div>
        <p class="sx-req">Dua cara ini dipilih di halaman tiap langkah. Apa pun caranya, data selalu dicek dulu terhadap SAP tujuan sebelum di-upload lewat Service Layer.
          Kolom <b>Di tujuan</b> = jumlah data yang sudah ada sekarang.</p>
        <div class="toolbar"><input type="search" id="sx-q" placeholder="Cari langkah: nama, tabel, tahap, atau butuh apa…" aria-label="Cari langkah setup"><span class="count" id="sx-qc"></span></div>
        ${tiers.map(t => `<h2 id="tahap-${t.toLowerCase()}"><span class="no">${t}</span>${esc(TIERS[t][0])}</h2>
          <p class="sec-lead">${esc(TIERS[t][1])}</p>
          <div class="table-wrap"><table class="data sx-overview"><thead><tr><th class="num">Urut</th><th>Langkah</th><th>Jenis</th><th>Butuh</th>
            <th>Cara isi</th><th class="num">Di tujuan</th></tr></thead>
          <tbody>${steps.filter(s => s.tier === t).map(s => `<tr data-step="${s.id}" data-tier="${esc(t + " " + TIERS[t][0])}">
            <td class="num">${s.order}</td>
            <td><a href="#/${s.id}"><b>${esc(s.title)}</b></a><div class="muted">${esc(s.ref || "")}</div></td>
            <td><span class="badge ${s.kind === "data" ? "info" : ""}">${s.kind === "data" ? "Data" : "Setting"}</span></td>
            <td class="sx-note">${(s.requires || []).map(esc).join(", ") || "–"}</td>
            <td>${esc(ways(s))}${s.kind === "data" && !canUpload(s) ? ` <span class="badge" title="Bandingkan & export saja">upload menyusul</span>` : ""}</td>
            <td class="num" data-c="tgt">${s.kind === "data" ? "…" : "–"}</td>
          </tr>`).join("")}</tbody></table></div>`).join("")}</div>`;
    }
  };
}
// Cocokkan teks dengan kueri: semua kata (dipisah spasi) harus ada, tanpa peduli huruf besar/kecil.
export function matchQuery(text, query) {
  const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean), t = String(text || "").toLowerCase();
  return words.every(w => t.includes(w));
}
// Kotak cari di halaman Urutan Setup: menyembunyikan baris yang tidak cocok dan tahap yang barisnya habis; Esc mengosongkan.
function wireOverviewSearch(box) {
  if (!box) return;
  const q = $("#sx-q", box), cnt = $("#sx-qc", box), rows = $$("tbody tr[data-step]", box);
  const text = new Map(rows.map(tr => [tr, `${tr.textContent} ${tr.dataset.step} ${tr.dataset.tier || ""}`]));
  const draw = () => {
    let shown = 0;
    rows.forEach(tr => { const ok = matchQuery(text.get(tr), q.value); tr.hidden = !ok; if (ok) shown++; });
    $$("table.sx-overview", box).forEach(tb => {
      const any = $$("tbody tr[data-step]", tb).some(tr => !tr.hidden), wrap = tb.closest(".table-wrap");
      [wrap, wrap && wrap.previousElementSibling, wrap && wrap.previousElementSibling && wrap.previousElementSibling.previousElementSibling]
        .forEach(el => { if (el) el.hidden = !any; });
    });
    cnt.textContent = q.value.trim() ? (shown ? `${shown} dari ${rows.length} langkah` : "Tidak ada langkah yang cocok") : `${rows.length} langkah`;
  };
  q.oninput = draw;
  q.onkeydown = e => { if (e.key === "Escape" && q.value) { q.value = ""; draw(); } };
  draw();
}
// Pencarian di sidebar: menyembunyikan langkah yang tidak cocok (dan tahap yang habis), membuka semua tahap selama mencari.
// Enter membuka langkah pertama yang cocok, Esc mengosongkan.
function wireNavSearch(nav) {
  const q = $("#nav-q", nav);
  if (!q) return;
  const groups = $$(".nav-group:not(.flat)", nav);
  const draw = () => {
    const on = q.value.trim() !== "";
    nav.classList.toggle("searching", on);
    groups.forEach(g => {
      const items = $$("li", g), head = $("button", g) ? $("button", g).textContent : "";
      items.forEach(li => {
        const link = $("a", li), id = link && link.dataset ? link.dataset.id : "";   // kode langkah ikut dicari (mis. uom, stem-params)
        li.hidden = on && !matchQuery(`${li.textContent} ${id} ${head}`, q.value);
      });
      g.hidden = on && !items.some(li => !li.hidden);
    });
  };
  q.oninput = draw;
  q.onkeydown = e => {
    if (e.key === "Escape" && q.value) { q.value = ""; draw(); }
    else if (e.key === "Enter") {
      const first = $$("li", nav).find(li => !li.hidden && !li.closest("[hidden]"));
      if (first) { const a = $("a", first); if (a) location.hash = a.getAttribute("href"); }
    }
  };
}
async function mountOverview(steps, box) {
  if (!box) return;
  // dimuat 4 langkah sekaligus supaya server & DB tidak dibanjiri query
  const queue = steps.filter(s => s.kind === "data");
  const work = async () => {
    for (let s; (s = queue.shift());) {
      const c = $(`tr[data-step="${s.id}"] [data-c="tgt"]`, box);
      try { const rows = await targetRows(s.id); c.textContent = rows.length.toLocaleString("id-ID"); }
      catch (e) { c.innerHTML = `<span class="badge danger" title="${esc(e.message)}">gagal</span>`; }
    }
  };
  await Promise.all([work(), work(), work(), work()]);
}

// ---------- aplikasi setup.html: sidebar per tahap + routing #/ (ringkasan) dan #/<langkah> ----------
export async function startSetupApp() {
  const art = $("#article"), nav = $("#nav");
  $("#theme-btn").onclick = () => {
    const el = document.documentElement, dark = el.dataset.theme ? el.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    el.dataset.theme = dark ? "light" : "dark"; store.set("theme", el.dataset.theme);
  };
  $("#menu-btn").onclick = () => document.body.classList.toggle("nav-open");
  let steps;
  try {
    const mode = await getJson("api/review/mode");
    if (!mode.editable) {
      art.innerHTML = `<h1>Setup &amp; Cut Off</h1><div class="error">Halaman ini hanya tersedia di mode dev / edit, karena bisa menulis data ke SAP.</div>`;
      return;
    }
    steps = (await getJson("api/setup/steps")).filter(s => s.kind !== "ref");   // langkah referensi tidak ditampilkan
  } catch (e) {
    art.innerHTML = `<h1>Setup &amp; Cut Off</h1><div class="error">Gagal memuat langkah setup: ${esc(e.message)}</div>`;
    return;
  }
  steps.forEach((s, i) => s.order = i + 1);   // nomor urut = urutan di steps.json
  const pages = { "": { title: "Urutan Setup", def: overviewPage(steps) } };
  steps.forEach(s => pages[s.id] = { title: s.title, no: String(s.order), chapter: `${s.tier} · ${TIERS[s.tier][0]}`, def: stepPage(s) });
  pages.hana = { title: "Backup & Restore HANA", chapter: "Utilitas", def: hanaPage() };
  const tiers = Object.keys(TIERS).filter(t => steps.some(s => s.tier === t));
  nav.innerHTML = `<div class="nav-group flat"><a href="#/" data-id="" class="chapter-link"><span class="gno">⌂</span><span>Urutan Setup</span></a><a href="#/hana" data-id="hana" class="chapter-link"><span class="gno">⛁</span><span>Backup &amp; Restore HANA</span></a></div>`
    + `<div class="nav-search"><input type="search" id="nav-q" placeholder="Cari langkah…" aria-label="Cari langkah di sidebar" autocomplete="off"></div>`
    + tiers.map(t => `<div class="nav-group"><button type="button" aria-expanded="true"><span class="gno">${t}</span>${esc(TIERS[t][0])}</button>
      <ul>${steps.filter(s => s.tier === t).map(s => `<li><a href="#/${s.id}" data-id="${s.id}"${s.kind === "setting" ? ` class="todo"` : ""}>
        <span class="no">${s.order}</span><span>${esc(s.title)}</span></a></li>`).join("")}</ul></div>`).join("");
  $$(".nav-group > button", nav).forEach(b => b.onclick = () => {
    const g = b.parentElement; g.classList.toggle("collapsed"); b.setAttribute("aria-expanded", !g.classList.contains("collapsed"));
  });
  wireNavSearch(nav);
  const route = () => {
    const id = (location.hash.match(/^#\/([a-z0-9-]*)/) || [])[1] || "", page = pages[id] || pages[""];
    document.body.classList.remove("nav-open");
    $$("#nav a[data-id]").forEach(a => a.classList.toggle("active", a.dataset.id === (pages[id] ? id : "")));
    document.title = `${page.no ? page.no + " " : ""}${page.title} · Setup CVPPMK`;
    art.innerHTML = `<nav class="crumbs" aria-label="Breadcrumb"><span>Setup &amp; Cut Off</span>${page.chapter ? `<span>${esc(page.chapter)}</span>` : ""}</nav>
      <h1>${page.no ? `<span class="no">${esc(page.no)}</span>` : ""}${esc(page.title)}</h1>
      <p class="lead">${page.def.lead}</p>
      <div class="page-meta">${page.def.menu ? `<span><b>Tujuan:</b> ${esc(page.def.menu)}</span>` : ""}
        ${page.def.doc ? `<span><b>Dokumentasi:</b> <a href="index.html#/${esc(page.def.doc)}">lihat konfigurasi saat ini →</a></span>` : ""}</div>
      ${page.def.render()}`;
    if (page.def.mount) page.def.mount(art);
    flushMounts();
    window.scrollTo(0, 0);
  };
  window.addEventListener("hashchange", route);
  route();
}
