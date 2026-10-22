// Crystal RPT Editor: UI web untuk StemRptAgent (agen lokal di PC user, 127.0.0.1:47831; lihat tools/rpt-agent).
// Browser bicara LANGSUNG ke agen (bukan lewat server Tomcat): file .rpt dan kredensial tidak lewat server.
// Satuan koordinat = twips (seperti di Crystal; 1 cm = 567 twips). Simpan selalu ke salinan <nama>_edit.rpt, file asli tidak ditimpa.
// Model data: balasan agen SELALU menang (d diganti penuh tiap op); klien hanya menggeser tampilan selama seret.
// Kanvas = SVG dari properti objek. Tidak pixel-perfect: pembungkusan teks per kata memakai pengukuran canvas, lebar huruf bisa beda dari Crystal.
import { esc } from "../ui.js";

const AG = "http://127.0.0.1:47831";
const PX_PER_CM = 37.8, TW_PER_CM = 567, GRID = 57; // snap 1 mm
const FONTS = ["Calibri", "Arial", "Times New Roman", "Courier New", "Verdana", "Tahoma", "Segoe UI", "Consolas", "Cambria", "Georgia"];
const SIZES = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48];
const DEF_FONT = { n: "Calibri", s: 9, b: false, i: false, u: false, x: false };
let token = null;
const AGENT_MIN = "0.7"; // versi agen yang diharapkan UI ini (0.6: /fs/recent, nama hasil unik, op replace; 0.7: Suppress sup/setSectionProps, op find, cloneTo place/gap, /fs/reveal, /rpt/checkFormula)
const cmpVer = (a, b) => { const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d < 0 ? -1 : 1; } return 0; };

async function ag(path, body) {
  const opts = { headers: { "Content-Type": "application/json" } };
  if (token) opts.headers.Authorization = "Bearer " + token;
  if (body !== undefined) { opts.method = "POST"; opts.body = JSON.stringify(body); }
  const r = await fetch(AG + path, opts);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "HTTP " + r.status);
  return d;
}

// "PageHeaderSection2" -> "Page Header"; "DetailSection1" -> "Details"; nama kembar diberi a, b, c seperti di Crystal.
function sectionLabels(secs) {
  const base = secs.map(s => { const b = s.name.replace(/Section\d+$/, "").replace(/([a-z])([A-Z])/g, "$1 $2"); return b === "Detail" ? "Details" : b; });
  return base.map((b, i) => {
    const same = base.filter(x => x === b).length; if (same < 2) return b;
    return b + " " + String.fromCharCode(97 + base.slice(0, i).filter(x => x === b).length);
  });
}
// Teks yang ditampilkan: field DB tampil nama saja seperti di Crystal, {Command.X} di dalam teks jadi {X}.
function shown(kind, text) {
  const t = text == null ? "" : String(text);
  if (kind === "Field") return t.replace(/^\{Command\./, "").replace(/^\{(\?|@)/, "$1").replace(/\}$/, "");
  return t.replace(/\{\{/g, "{").replace(/\}\}/g, "}").replace(/\{Command\./g, "{");
}
const cm = v => (v / TW_PER_CM).toFixed(2);
const tcol = c => /^#[0-9a-f]{6}$/i.test(c || "") ? c : "#000000";
const lsGet = k => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { } };

// ---------- ukur & bungkus teks (cache per font+teks; ukuran dihitung pada 100px lalu diskala) ----------
let mctx = null; const mcache = new Map();
const fontStr = f => `${f.i ? "italic " : ""}${f.b ? 700 : 400} 100px ${f.n}, Arial, sans-serif`;
function rawW(f, t) { if (!mctx) mctx = document.createElement("canvas").getContext("2d"); mctx.font = fontStr(f); return mctx.measureText(t).width; }
function cw(f, t) { const k = fontStr(f) + "|" + t; let v = mcache.get(k); if (v === undefined) { if (mcache.size > 6000) mcache.clear(); v = rawW(f, t); mcache.set(k, v); } return v; }
// bungkus satu paragraf per kata ke lebar avail (twips); kata terlalu panjang dipotong
function wrapText(text, f, fs, avail, maxLines) {
  const W = t => cw(f, t) * fs / 100; if (avail <= 0 || W(text) <= avail) return [text];
  if (maxLines <= 1 && !/\s/.test(text.trim())) return [text];
  const out = []; let cur = "";
  for (let wd of text.split(/\s+/).filter(Boolean)) {
    if (W(wd) > avail) { let lo = 1, hi = wd.length; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (rawW(f, wd.slice(0, m)) * fs / 100 <= avail) lo = m; else hi = m - 1; } wd = wd.slice(0, lo); }
    const t = cur ? cur + " " + wd : wd;
    if (!cur || W(t) <= avail) cur = t; else { out.push(cur); cur = wd; }
  }
  if (cur) out.push(cur); return out.length ? out : [text];
}
const NUMF = /number|currency|int/i;
const effHa = o => o.ha && o.ha !== "d" ? o.ha : (o.kind === "Field" && NUMF.test(o.ftype || "") ? "r" : "");

// ---------- geometri tool "Alat" (murni, tanpa DOM; diuji terpisah) ----------
const snapAxis = (start, size, delta, cands, thr, alt) => { // kembalikan delta yang sudah di-snap
  if (alt) return Math.round(delta);
  let best = null;
  for (const c of cands) for (const e of [start + delta, start + delta + size]) { const dd = c - e; if (Math.abs(dd) < thr && (best === null || Math.abs(dd) < Math.abs(best))) best = dd; }
  if (best !== null) return delta + best;
  return Math.round((start + delta) / GRID) * GRID - start;
};
const TOOL_DEF = { text: [2000, 300], field: [1800, 300], box: [2000, 500], line: [2000, 0] }; // ukuran bawaan (twips) = ukuran lama tombol + Teks/+ Kotak/+ Garis
const TOOL_NAME = { text: "Teks", field: "Field", box: "Kotak", line: "Garis" };
// section di bawah titik y (sama dengan logika drop Field: section bertinggi > 0 terakhir yang top-nya <= y, selain itu yang pertama)
const secAtPure = (d, y) => [...d.sections].reverse().find(s => s.h > 0 && y >= s.top) || d.sections.find(s => s.h > 0);
// a = titik awal (tekan / posisi kursor), p = titik sekarang; o = {alt, thr, axis ("h"|"v" kunci garis), center (ketuk sentuh)}
// hasil: kotak di koordinat kertas + {sec, l, t} relatif section; dijepit ke halaman dan ke dalam section asal (Kotak/Garis juga, agar Crystal tidak melebarkan section)
function toolRect(d, E, kind, a, p, o) {
  o = o || {}; const thr = o.thr || 60, alt = !!o.alt, sn = (v, cs) => snapAxis(0, 0, v, cs, thr, alt);
  const drag = Math.abs(p.x - a.x) + Math.abs(p.y - a.y) >= 30; let x, y, w, h, axis = "";
  if (!drag) {
    [w, h] = TOOL_DEF[kind]; x = snapAxis(0, w, a.x - (o.center ? w / 2 : 0), E.xs, thr, alt); y = snapAxis(0, h, a.y - (o.center ? h / 2 : 0), E.ys, thr, alt);
  } else {
    const x0 = sn(a.x, E.xs), y0 = sn(a.y, E.ys), x1 = sn(p.x, E.xs), y1 = sn(p.y, E.ys);
    if (kind === "line") {
      const hz = o.axis ? o.axis === "h" : Math.abs(p.x - a.x) >= Math.abs(p.y - a.y); axis = hz ? "h" : "v";
      if (hz) { x = Math.min(x0, x1); y = y0; w = Math.abs(x1 - x0); h = 0; } else { x = x0; y = Math.min(y0, y1); w = 0; h = Math.abs(y1 - y0); }
    } else { x = Math.min(x0, x1); y = Math.min(y0, y1); w = Math.max(170, Math.abs(x1 - x0)); h = Math.max(170, Math.abs(y1 - y0)); }
  }
  const sec = secAtPure(d, y); if (!sec) return null;
  w = Math.min(w, d.pageW); x = Math.max(0, Math.min(x, d.pageW - w)); h = Math.min(h, sec.h);
  const t = Math.max(0, Math.min(y - sec.top, sec.h - h));
  return { sec: sec.name, secTop: sec.top, secH: sec.h, x: Math.round(x), y: Math.round(sec.top + t), l: Math.round(x), t: Math.round(t), w: Math.round(w), h: Math.round(h), axis };
}

// ---------- Suppress: kondisi UI <-> teks (parser hanya untuk mengisi form dari rumus yang persis template agen; selain itu = kustom) ----------
const SUP_OPS = [["=", "sama dengan"], ["<>", "tidak sama dengan"], ["<", "lebih kecil dari"], [">", "lebih besar dari"], ["<=", "kurang dari atau sama"], [">=", "lebih dari atau sama"], ["empty", "kosong"], ["zero", "nol (atau kosong)"], ["contains", "mengandung"], ["starts", "diawali"]];
const NOVAL = op => op === "empty" || op === "zero";
const unq = s => s.slice(1, -1).replace(/""/g, '"');
const RFj = String.raw`\{[@?]?[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?\}`, RSj = String.raw`"(?:[^"]|"")*"`;
const COND_TERMS = [
  [new RegExp(String.raw`\(IsNull\((${RFj})\) Or Trim\((${RFj})\)=""\)`, "y"), m => m[1] === m[2] ? { field: m[1], op: "empty", value: "" } : null],
  [new RegExp(String.raw`\(IsNull\((${RFj})\) Or (${RFj}) = 0\)`, "y"), m => m[1] === m[2] ? { field: m[1], op: "zero", value: "" } : null],
  [new RegExp(String.raw`IsNull\((${RFj})\)`, "y"), m => ({ field: m[1], op: "empty", value: "" })],
  [new RegExp(String.raw`(${RFj}) (<>|<=|>=|=|<|>) (${RSj}|-?[0-9.]+(?:E[-+]?[0-9]+)?|Date\(([0-9]+),([0-9]+),([0-9]+)\)|True|False)`, "y"), m => ({ field: m[1], op: m[2], value: m[3][0] === '"' ? unq(m[3]) : m[4] ? `${m[4]}-${m[5].padStart(2, "0")}-${m[6].padStart(2, "0")}` : /^(True|False)$/.test(m[3]) ? m[3].toLowerCase() : m[3] })],
  [new RegExp(String.raw`InStr\(UpperCase\((${RFj})\),UpperCase\((${RSj})\)\)>0`, "y"), m => ({ field: m[1], op: "contains", value: unq(m[2]) })],
  [new RegExp(String.raw`(${RFj}) StartsWith (${RSj})`, "y"), m => ({ field: m[1], op: "starts", value: unq(m[2]) })]
];
function parseCond(t) { // null = bukan rumus template (kustom)
  t = String(t || ""); let pos = 0, join = ""; const conds = [];
  for (; ;) {
    let hit = null;
    for (const [re, fn] of COND_TERMS) { re.lastIndex = pos; const m = re.exec(t); if (m) { const c = fn(m); if (c) { hit = [c, re.lastIndex]; break; } } }
    if (!hit) return null; conds.push(hit[0]); pos = hit[1]; if (pos >= t.length) break;
    const j = t.startsWith(" And ", pos) ? "and" : t.startsWith(" Or ", pos) ? "or" : null; if (!j || (join && j !== join)) return null; join = j; pos += j === "and" ? 5 : 4;
  }
  return { conds, join: join || "and" };
}
const condErr = s => {
  if (!s.conds.length) return "Tambah minimal satu syarat."; if (s.conds.length > 8) return "Maksimal 8 syarat.";
  for (const [i, c] of s.conds.entries()) { if (!String(c.field).trim()) return `Syarat ${i + 1}: isi kolom (mis. {Command.Diskon}).`; if (!SUP_OPS.some(x => x[0] === c.op)) return `Syarat ${i + 1}: operator tidak dikenal.`; if (!NOVAL(c.op) && !String(c.value).trim()) return `Syarat ${i + 1}: isi nilainya.`; }
  return "";
};
const condLabel = c => { const f = String(c.field).trim().replace(/^\{(?:[^.}]+\.)?/, "").replace(/\}$/, "") || "(kolom)"; return c.op === "empty" ? `${f} kosong` : c.op === "zero" ? `${f} nol atau kosong` : c.op === "contains" ? `${f} mengandung "${c.value}"` : c.op === "starts" ? `${f} diawali "${c.value}"` : `${f} ${c.op} ${c.value}`; };
const condSummary = (name, s) => `Objek ${name} akan disembunyikan jika ${s.conds.map(condLabel).join(s.join === "and" ? " DAN " : " ATAU ")}.`;

// ---------- Batch (wizard): ekspor CSV log perubahan ----------
const csvCell = v => { const t = String(v == null ? "" : v); return /[",\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
const needsVerify = ops => (ops || []).some(o => (o.fieldReplace && o.fieldReplace.length) || o.source);
function batchCsv(results, ops) {
  const rows = [["Berkas sumber", "Status", "Pesan", "Objek", "Jenis", "Sebelum", "Sesudah", "Berkas hasil", "Verify Database"]], vf = needsVerify(ops);
  const st = { ok: "Siap/Selesai", skip: "Dilewati", error: "Gagal" };
  for (const r of results || []) {
    const ch = (r.matches || []).flatMap(m => typeof m === "string" ? [] : (m.changes || []).map(c => ({ ...c, kind: m.kind })));
    const base = [r.name || r.path || "", st[r.status] || r.status, r.message || ""], tail = [r.savedName || (r.saved ? String(r.saved).split(/[\\/]/).pop() : ""), r.status === "ok" ? (vf ? "Perlu Verify di Crystal" : "Tidak perlu") : ""];
    if (!ch.length) rows.push([...base, "", "", "", "", ...tail]); else ch.forEach(c => rows.push([...base, c.name, c.kind, c.before, c.after, ...tail]));
  }
  return rows.map(r => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export const _t = { toolRect, secAtPure, snapAxis, parseCond, condErr, condSummary, batchCsv, needsVerify };

export function rptPage(art, chip) {
  const st = { docs: [], cur: null, files: [], root: null, err: "", msg: "", clip: null, leftOpen: true, leftTab: "files", busy: "", verify: null, prev: null, shell: false, ffilter: "", clipCount: 0, batch: null, agentVer: "", agentOld: false, agentMsg: "", recent: [], picking: false, modalOpen: false, trigKey: null, trig: null, tool: null, gp: null, cx: null, cy: null, alt: false, ptype: "mouse", te: null, aiPop: false, rov: "", showSup: true, sup: null, batchSaved: null };
  const doc = () => st.docs.find(d => d.docId === st.cur);
  const setChip = (cls, txt) => { chip.className = "sbadge " + cls; chip.textContent = txt; };
  const $ = s => art.querySelector(s);

  // ---------- koneksi ----------
  let retryTimer = null;
  async function connect(silent) {
    const was = !!token;
    try {
      const h = await ag("/health"); const s = await ag("/session");
      token = s.token; st.root = h.root;
      const av = (String(h.agent || "").match(/(\d+(?:\.\d+)*)/) || [])[1] || "0"; st.agentVer = av; st.agentOld = cmpVer(av, AGENT_MIN) < 0;
      st.agentMsg = st.agentOld ? `Agen lama masih berjalan (versi ${av}). Keluar dari tray lalu jalankan StemRptAgent.exe lagi.` : "";
      setChip("s-ok", "Agent terhubung · SDK " + (h.sdk ? "OK" : "belum ada"));
      if (st.root) await list();
      await loadRecent();
      st.err = "";
    } catch (e) { token = null; st.tool = null; st.gp = null; setChip("s-none", "Agent tidak terhubung"); if (!silent || was) st.err = /origin/.test(e.message) ? e.message : ""; }
    if (!silent || was !== !!token) draw();
  }
  function launchAgent() {
    st.msg = "Menjalankan agen… (jika browser bertanya, izinkan membuka StemRptAgent)"; draw();
    location.href = "stemrpt://start";
    let n = 0; const iv = setInterval(async () => {
      await connect(true);
      if (token) { try { localStorage.setItem("rptAutoLaunch", "1"); } catch { } }   // protokol terbukti jalan: lain kali agen dinyalakan otomatis
      if (token || ++n > 15) { clearInterval(iv); st.msg = ""; draw(); }
    }, 1000);
  }
  async function run(fn) { st.err = ""; st.msg = ""; try { await fn(); } catch (e) { st.err = e.message; } draw(); }
  async function loadRecent() { if (st.agentOld) { st.recent = []; return; } try { st.recent = (await ag("/fs/recent", {})).recent || []; } catch { st.recent = []; } }
  async function list() { const r = await ag("/fs/list", { path: st.root }); st.files = r.files; }

  // ---------- dokumen ----------
  function applyDump(d, r) {
    const keep = { name: d.name, zoom: d.zoom, fields: d.fields, verified: d.verified, sel: d.sel || [] };
    Object.assign(d, r, keep); d.sel = keep.sel.filter(n => d.objects.some(o => o.name === n));
  }
  async function open(path, name) {
    const ex = st.docs.find(d => d.path === path); if (ex) { st.cur = ex.docId; return; }
    st.busy = "Membaca struktur " + name + "…"; draw();
    try { const d = await ag("/rpt/open", { path }); Object.assign(d, { name, dirty: false, sel: [], zoom: null, fields: null, verified: null }); st.docs.push(d); st.cur = d.docId; if (d.clip) { st.clip = d.clip; st.clipCount = d.clipCount || 0; } }
    finally { st.busy = ""; }
  }
  async function ops(list_) {
    const d = doc(); const r = await ag("/rpt/ops", { docId: d.docId, ops: list_ });
    applyDump(d, r); d.dirty = true; d.verified = null; st.msg = (r.results || []).join(" · "); if (r.clip) { st.clip = r.clip; st.clipCount = r.clipCount || 0; }
    // hasil 'ditempel N1,N2,...' (daftar dipisah koma) atau 'clone X'/'box X'/...
    const nn = (r.results || []).flatMap(x => { const m = String(x).match(/^(clone|ditempel|box|garis|teks|field)(?:\s+baru)?\s+(.+)$/i); if (!m) return []; return /^ditempel$/i.test(m[1]) ? m[2].split(/\s*,\s*/).filter(Boolean) : [m[2].split(/\s+/)[0]]; });
    if (nn.length) d.sel = nn;
  }
  async function history(dir) { const d = doc(); const r = await ag("/rpt/" + dir, { docId: d.docId }); applyDump(d, r); d.dirty = true; }
  const secMap = d => Object.fromEntries(d.sections.map(x => [x.name, x]));
  const selObjs = d => d.sel.map(n => d.objects.find(o => o.name === n)).filter(Boolean); // urutan = urutan pilih (objek pertama = acuan align)
  const scale = d => d.zoom * PX_PER_CM / TW_PER_CM;
  const fit = d => Math.min(3, Math.max(.25, (art.clientWidth - (st.leftOpen ? 250 : 0) - 280 - 96 - 70) / (d.pageW / TW_PER_CM * PX_PER_CM)));
  const defSection = d => (d.sel.length && d.objects.find(o => o.name === d.sel[0])?.section) || (d.sections.find(s => /^Detail/.test(s.name) && s.h > 0) || d.sections.find(s => s.h > 0)).name;
  // kotak absolut objek (x,y,w,h) dalam twips pada kertas
  function geom(d, o, map) {
    const sc = map[o.section]; let h = o.h;
    if ((o.kind === "Line" || o.kind === "Box") && o.ext && o.end && map[o.end]) h = map[o.end].top + map[o.end].h - (sc.top + o.t);
    return { x: o.l, y: sc.top + o.t, w: o.w, h };
  }

  // ---------- kerangka ----------
  function shell() {
    art.innerHTML = `<div id="rp-msg"></div><div class="rp-bar" id="rp-bar"></div><div class="rp-fmt" id="rp-fmt"></div>
      <div class="rp" id="rp-grid"><div class="rp-col" id="rp-left"></div>
        <div class="rp-col rp-main"><div class="rp-tabs" id="rp-tabs" role="tablist"></div><div class="rp-tools" id="rp-tools" role="toolbar" aria-label="Alat" hidden></div><div class="rp-scroll" id="rp-canvas"></div><div class="rp-status" id="rp-status"></div></div>
        <div class="rp-col" id="rp-side"></div></div><div id="rp-modal"></div><div id="rp-tchip" class="rp-tchip" hidden></div><div id="rp-live" class="rp-sr" role="status" aria-live="polite"></div>`;
    st.shell = true;
  }
  function draw() {
    if (window.innerWidth < 700) { // HP tidak didukung: 127.0.0.1 di HP menunjuk ke HP itu sendiri, bukan ke PC yang menjalankan agen
      st.shell = false; art.innerHTML = `<div class="placeholder" role="status"><b>Alat ini butuh PC atau tablet Windows dengan agen terpasang.</b><p>Editor tersambung ke agen di 127.0.0.1 milik perangkat yang membuka halaman ini. Di HP alamat itu menunjuk ke HP itu sendiri, jadi tidak bisa dipakai. Buka halaman ini dari PC atau tablet Windows.</p></div>`; return;
    }
    if (!token) {
      st.shell = false;
      art.innerHTML = `${st.err ? `<div class="error" role="alert">${esc(st.err)}</div>` : ""}${st.msg ? `<div class="callout" role="status"><span>${esc(st.msg)}</span></div>` : ""}
        <div class="placeholder"><b>Agen belum terhubung.</b><p>Jalankan agen di PC ini (ikon di tray Windows). Halaman ini mencoba menyambung ulang tiap 5 detik.</p>
        <button class="edit-btn" id="launch" type="button">Jalankan agen</button> <button class="edit-btn" id="retry" type="button">Coba lagi</button>
        <p class="rp-note">Belum terpasang? Jalankan <code>tools\\rpt-agent\\bin\\StemRptAgent.exe --install</code> satu kali.</p></div>`;
      return;
    }
    if (!st.shell) shell();
    const d = doc(); if (d && !d.zoom) d.zoom = fit(d);
    renderMsg(); renderBar(); renderTools(); renderFmt(); renderLeft(); renderTabs(); renderCanvas(); renderSide(); renderModal();
  }
  function renderMsg() {
    $("#rp-msg").innerHTML = `${st.err ? `<div class="error" role="alert">${esc(st.err)}</div>` : ""}${st.msg ? `<div class="callout" role="status"><span>${esc(st.msg)}</span></div>` : ""}${st.busy ? `<div class="callout" role="status"><span>${esc(st.busy)}</span></div>` : ""}${st.agentMsg ? `<div class="callout" role="status"><span>${esc(st.agentMsg)}</span></div>` : ""}`;
  }
  function renderBar() {
    const d = doc(), has = d && d.sel.length, one = d && d.sel.length === 1, fk = focusKey(document.activeElement);
    const b = (a, t, dis, ttl, lbl) => `<button class="edit-btn" data-a="${a}" ${dis ? "disabled" : ""} ${ttl ? `title="${esc(ttl)}"` : ""} ${lbl ? `aria-label="${esc(lbl)}"` : ""}>${t}</button>`;
    $("#rp-bar").innerHTML = `<button class="edit-btn" id="pick" type="button" ${st.picking ? "disabled" : ""}>${st.picking ? "Menunggu dialog…" : "Pilih folder…"}</button>${st.picking ? `<span class="rp-note" role="status">Dialog dibuka di PC Anda… lihat ikon di taskbar</span>${st.agentOld ? "" : `<button class="edit-btn" id="pickfront" type="button">Tidak terlihat? Munculkan</button>`}` : ""}
      <button class="edit-btn" id="lt" type="button" aria-pressed="${st.leftOpen}">Panel</button>
      <button class="edit-btn" id="batch" type="button" title="Ubah banyak layout sekaligus (hasil disimpan sebagai salinan _edit.rpt)">Batch…</button>
      <span class="rp-note rp-root" title="${esc(st.root || "")}">${esc(st.root || "belum ada folder")}</span>
      ${d ? `
      <span style="flex:1"></span><button class="edit-btn" data-a="preview" title="Tampilkan layout dengan data asli (PDF, tidak disimpan ke disk)">Preview</button><button class="edit-btn" data-a="verify" title="Daftarkan kolom baru dari database (isi server dan kredensial sendiri)">Verify Database ${d.verified ? `<span class="rp-ok">✓ ${esc(d.verified)}</span>` : `<span class="rp-wn">⚠ belum</span>`}</button>
      <button class="edit-btn rp-primary" data-a="save" title="Simpan sebagai salinan _edit.rpt (nama unik pada simpan pertama; simpan berikutnya menimpa hasil simpan dokumen ini)">Simpan salinan</button>` : ""}`;
    if (fk && fk.startsWith("#rp-bar") && (!document.activeElement || document.activeElement === document.body)) { const n = $(fk); if (n && !n.disabled) n.focus(); } // elemen yang fokus hilang karena render ulang
  }
  const focusKey = el => { // selector lengkap (bar atas atau strip Alat) untuk memulihkan fokus setelah render ulang
    if (!el || !el.closest) return null; const c = el.closest("#rp-bar") ? "#rp-bar" : el.closest("#rp-tools") ? "#rp-tools" : null; if (!c) return null;
    const k = el.id ? "#" + el.id : el.dataset.a ? `[data-a="${el.dataset.a}"]` : el.dataset.z ? `[data-z="${el.dataset.z}"]` : el.dataset.ai !== undefined ? "[data-ai]" : null; return k ? c + " " + k : null;
  };
  // ---------- toolbox "Alat": IDLE (st.tool=null) -> ARMED (st.tool, tanpa pl) -> PLACING (st.tool.pl) -> kembali IDLE/ARMED setelah menaruh ----------
  const ICONS = {
    select: '<path d="M4 2l8 6-3.6.9L10.2 13 8.6 13.8 6.8 9.5 4 11.6z"/>', text: '<path d="M3 3h10M8 3v10M6 13h4"/>', field: '<path d="M5.5 2.5H5A1.5 1.5 0 0 0 3.5 4v2.2L2 8l1.5 1.8V12A1.5 1.5 0 0 0 5 13.5h.5M10.5 2.5h.5A1.5 1.5 0 0 1 12.5 4v2.2L14 8l-1.5 1.8V12a1.5 1.5 0 0 1-1.5 1.5h-.5"/>',
    box: '<rect x="2.5" y="4" width="11" height="8" rx="1"/>', line: '<path d="M2.5 13.5l11-11"/>', eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>', eyex: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/><path d="M2.5 13.5l11-11"/>'
  };
  const icon = k => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;
  const live = m => { const n = $("#rp-live"); if (n) n.textContent = m; };
  const ptOf = (svg, ev) => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  const toolEdges = d => { if (!st.te || st.te.id !== d.docId) st.te = { id: d.docId, E: edges(d, []) }; return st.te.E; };
  function toolMsg() {
    const t = st.tool; if (!t) return "";
    if (t.k === "field" && !t.src) return "Tool: Field — pilih field di panel kiri, lalu klik di kanvas · Esc batal";
    return `Tool: ${TOOL_NAME[t.k]}${t.k === "field" && t.label ? " (" + t.label + ")" : ""} — klik untuk taruh, seret untuk ukuran, Esc batal${t.stay ? " · tetap aktif" : ""}`;
  }
  function toolUi() { renderTools(); renderStatus(); const c = $("#rp-canvas"); if (c) c.classList.toggle("rp-armed", !!st.tool); updGhost(); }
  function armTool(k, stay) {
    const d = doc(); if (!d || st.modalOpen) return;
    if (k === "select") return disarm("Mode pilih");
    if (st.tool && st.tool.k === k) { if (stay) { st.tool.stay = true; toolUi(); } return; } // klik ulang pada alat yang sama: tetap aktif, tidak mati
    st.tool = { k, stay: !!stay, src: null, type: 0, sp: false, label: "", pl: null }; st.gp = null;
    if (k === "field") { st.leftOpen = true; st.leftTab = "fields"; renderLeft(); }
    toolUi(); live(k === "field" ? "Pilih field di panel kiri, lalu klik di kanvas." : `Alat ${TOOL_NAME[k]} aktif: klik atau seret di kanvas, Esc untuk batal.`);
  }
  function disarm(msg) { if (!st.tool) return; st.tool = null; st.gp = null; toolUi(); if (msg) live(msg); }
  function pickToolField(f) { const t = st.tool; t.src = f.dataset.src; t.type = Number(f.dataset.type); t.sp = !!f.dataset.sp; t.label = f.querySelector("span")?.textContent || t.src; toolUi(); live(`Field ${t.label} dipilih: klik di kanvas untuk menaruh.`); }
  function clientOf(d, x, y) { const svg = $(".rp-paper"); if (!svg) return { x: 0, y: 0 }; const r = svg.getBoundingClientRect(), s = scale(d); return { x: r.left + x * s, y: r.top + y * s }; }
  // gambar ulang hantu (di dalam #ovl, jadi harus digambar lagi tiap renderOverlay) + chip ukuran + sorot section di bawah kursor
  function updGhost() {
    const o = $("#ovl"), chip = $("#rp-tchip"), d = doc(), t = st.tool; const old = o && o.querySelector("#tg"); if (old) old.remove();
    if (!o || !d || !t || !st.gp || (t.k === "field" && !t.src)) { if (chip) chip.hidden = true; return; }
    const s = scale(d), a = t.pl ? t.pl.a : st.gp, r = toolRect(d, toolEdges(d), t.k, a, st.gp, { alt: st.alt, thr: 6 / s, axis: t.pl && t.pl.axis, center: false });
    if (!r) { if (chip) chip.hidden = true; return; }
    const lab = t.k === "field" ? t.label : t.k === "text" ? "Teks" : "";
    const shape = t.k === "line" ? `<line class="tgh" x1="${r.x}" y1="${r.y}" x2="${r.x + r.w}" y2="${r.y + r.h}"/>` : `<rect class="tgh" x="${r.x}" y="${r.y}" width="${Math.max(r.w, 10)}" height="${Math.max(r.h, 10)}"/>${lab ? `<text class="tgt" x="${r.x + 30}" y="${r.y + Math.min(r.h, 300) * .75}" font-size="${Math.min(160, Math.max(r.h * .6, 60))}">${esc(lab)}</text>` : ""}`;
    o.insertAdjacentHTML("beforeend", `<g id="tg" pointer-events="none"><rect class="tsec" x="0" y="${r.secTop}" width="${d.pageW}" height="${r.secH}"/>${shape}</g>`);
    if (chip) { const i = d.sections.findIndex(x => x.name === r.sec), c = st.cx == null ? clientOf(d, st.gp.x, st.gp.y) : { x: st.cx, y: st.cy }; chip.hidden = false; chip.textContent = `${cm(r.w)} × ${cm(r.h)} cm · ${sectionLabels(d.sections)[i] || r.sec}`; chip.style.left = (c.x + 14) + "px"; chip.style.top = (c.y + 18) + "px"; }
  }
  function placeTool(r) {
    const d = doc(), t = st.tool; if (!r || !d || !t) return; const base = { section: r.sec, l: r.l, t: r.t, w: r.w, h: r.h };
    const op = t.k === "text" ? { op: "addText", ...base, text: "Teks" } : t.k === "box" ? { op: "addBox", ...base } : t.k === "line" ? { op: "addLine", ...base } : { op: "addField", ...base, source: t.src, type: t.type, ...(t.sp ? { special: true } : {}) };
    const nm = TOOL_NAME[t.k]; if (!t.stay) { st.tool = null; st.gp = null; }
    run(() => ops([op]).then(() => live(`${nm} ditaruh di section ${r.sec}.`)));
  }
  // jalur lama (addAt): dipakai bila belum ada posisi kursor (keyboard saja): objek ditaruh di (200,200) section bawaan
  function placeFallback() {
    const d = doc(), t = st.tool; if (!d || !t) return; if (t.k === "field" && !t.src) { live("Pilih field di panel kiri dulu."); return; }
    const ex = { text: { w: 2000, h: 300, text: "Teks" }, box: { w: 2000, h: 500 }, line: { w: 2000, h: 0 }, field: { w: 1800, h: 300, source: t.src, type: t.type, ...(t.sp ? { special: true } : {}) } }[t.k];
    const nm = { text: "addText", box: "addBox", line: "addLine", field: "addField" }[t.k]; if (!t.stay) { st.tool = null; st.gp = null; }
    run(() => addAt(d, nm, ex).then(() => live("Ditaruh di posisi bawaan (kiri atas section); gerakkan kursor atau panah dulu bila ingin posisi lain.")));
  }
  function toolStep(dx, dy, step) { // panah menggeser hantu (1 mm, Shift = 1 cm); posisi awal = kiri atas section bawaan
    const d = doc(), t = st.tool; if (!d || !t || (t.k === "field" && !t.src)) return;
    if (!st.gp) { const sc = secMap(d)[defSection(d)]; st.gp = { x: 4 * GRID, y: sc.top + 2 * GRID }; }
    const total = d.sections.reduce((a, x) => a + x.h, 0); st.gp = { x: Math.max(0, Math.min(d.pageW, st.gp.x + dx * step)), y: Math.max(0, Math.min(total, st.gp.y + dy * step)) }; st.cx = null; updGhost();
  }
  function toolEnter() {
    const d = doc(), t = st.tool; if (!d || !t) return; if (!st.gp) return placeFallback();
    if (t.k === "field" && !t.src) return live("Pilih field di panel kiri dulu.");
    placeTool(toolRect(d, toolEdges(d), t.k, st.gp, st.gp, { alt: st.alt, thr: 6 / scale(d) }));
  }
  function toolDown(e, svg, pt) { // cabang pertama pointerDown, hanya hidup saat st.tool
    const d = doc(), t = st.tool;
    if (t.k === "field" && !t.src) { st.msg = "Pilih field di panel kiri dulu, lalu klik di kanvas."; renderMsg(); live(st.msg); return; }
    const touch = e.pointerType === "touch", a = pt(e), E = toolEdges(d), thr = 6 / scale(d), far = p => Math.abs(p.x - a.x) + Math.abs(p.y - a.y) >= 30;
    st.ptype = e.pointerType || st.ptype; t.pl = { a, axis: null }; st.gp = a; st.cx = e.clientX; st.cy = e.clientY; st.alt = e.altKey; updGhost();
    const mv = ev => { const p = pt(ev); st.gp = p; st.cx = ev.clientX; st.cy = ev.clientY; st.alt = ev.altKey; if (ev.shiftKey && far(p)) { if (!t.pl.axis) t.pl.axis = Math.abs(p.x - a.x) >= Math.abs(p.y - a.y) ? "h" : "v"; } else t.pl.axis = null; updGhost(); };
    const end = () => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); window.removeEventListener("keydown", kd, true); };
    const cancel = () => { end(); if (st.tool === t) { t.pl = null; if (touch) st.gp = null; updGhost(); } };
    const kd = ev => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); cancel(); live("Dibatalkan."); } }; // Esc saat menaruh: batal menaruh saja (alat tetap aktif)
    const up = ev => { end(); if (st.tool !== t) return; const p = pt(ev), tap = !far(p); const r = toolRect(d, E, t.k, a, p, { alt: ev.altKey, thr, axis: t.pl && t.pl.axis, center: touch && tap }); t.pl = null; if (touch) st.gp = null; placeTool(r); };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel); window.addEventListener("keydown", kd, true);
  }
  function renderTools() {
    const d = doc(), el = $("#rp-tools"); if (!el) return; if (!d) { el.innerHTML = ""; el.hidden = true; return; } el.hidden = false;
    const fk = focusKey(document.activeElement), has = d.sel.length, T = st.tool;
    const tb = (k, label, ttl) => `<button class="edit-btn rp-tl" type="button" data-rv="${k}" data-a="${k}" aria-pressed="${k === "select" ? !T : !!(T && T.k === k)}" title="${esc(ttl)}">${icon(k)}<span>${label}</span></button>`;
    const b = (a, t, dis, ttl, lbl) => `<button class="edit-btn" type="button" data-rv="${a}" data-a="${a}" ${dis ? "disabled" : ""} ${ttl ? `title="${esc(ttl)}"` : ""} ${lbl ? `aria-label="${esc(lbl)}"` : ""}>${t}</button>`;
    const hint = " — klik alat, lalu klik atau seret di kanvas. Shift+klik atau klik ganda = tetap aktif";
    const anySup = d.objects.some(o => o.sup && o.sup !== "no") || d.sections.some(s => (s.sup && s.sup !== "no") || s.supBlank);
    el.innerHTML = `<span class="rp-note rp-tlab">Alat</span>${tb("select", "Pilih", "Pilih dan pindah objek (Esc)")}${tb("text", "Teks", "Teks" + hint)}${tb("field", "Field", "Field: pilih field di panel kiri" + hint)}${tb("box", "Kotak", "Kotak" + hint)}${tb("line", "Garis", "Garis (seret mendatar atau tegak; Shift mengunci sumbu)" + hint)}
      <span class="rp-sep"></span>${b("undo", "↶", !d.canUndo, "Urungkan (Ctrl+Z)", "Urungkan")}${b("redo", "↷", !d.canRedo, "Ulangi (Ctrl+Y)", "Ulangi")}
      <span class="rp-sep"></span>${b("copy", "Salin", !has, "Ctrl+C")}${b("paste", "Tempel", !st.clip, st.clip ? (st.clipCount > 1 ? st.clipCount + " objek: " : "") + st.clip : "Ctrl+V")}${b("clone", "Gandakan", !has, "Ctrl+D")}${b("del", "Hapus", !has, "Delete")}
      <span class="rp-sep"></span><button class="edit-btn" type="button" data-rv="z-" data-z="-" title="Perkecil" aria-label="Perkecil">−</button><span class="rp-zoom">${Math.round(d.zoom * 100)}%</span><button class="edit-btn" type="button" data-rv="z+" data-z="+" title="Perbesar" aria-label="Perbesar">+</button><button class="edit-btn" type="button" data-rv="zf" data-z="fit">Pas</button>
      ${anySup ? `<span class="rp-sep"></span><button class="edit-btn" type="button" data-rv="togsup" data-a="togsup" aria-pressed="${st.showSup}" title="Tampilkan objek yang disembunyikan (Suppress) di kanvas, diredupkan">${icon("eye")}<span>Tersembunyi</span></button>` : ""}
      <span style="flex:1"></span><span class="rp-aiw"><button class="edit-btn" type="button" data-rv="ai" data-ai aria-disabled="true" aria-expanded="${st.aiPop}" title="Asisten AI (belum tersedia)">✦ Asisten AI</button>${st.aiPop ? `<div class="rp-pop" role="status">Asisten AI memakai Claude CLI di PC Anda… Belum tersedia.</div>` : ""}</span>`;
    const bs = [...el.querySelectorAll("button")], cur = bs.find(x => x.dataset.rv === st.rov && !x.disabled) || bs.find(x => !x.disabled); bs.forEach(x => { x.tabIndex = x === cur ? 0 : -1; });
    if (fk && (!document.activeElement || document.activeElement === document.body)) { const n = $(fk); if (n && !n.disabled) n.focus(); }
  }
  function renderFmt() {
    const d = doc(), el = $("#rp-fmt"); if (!d || !d.sel.length) { el.innerHTML = d ? `<span class="rp-note">Pilih objek untuk memformat. Shift/Ctrl+klik atau seret area kosong untuk memilih beberapa.</span>` : ""; return; }
    const so = selObjs(d), p = so[0], f = Object.assign({}, DEF_FONT, p.font || {}), isTxt = so.some(o => o.kind === "Text" || o.kind === "Field"), isLn = so.some(o => o.kind === "Box" || o.kind === "Line");
    const tg = (k, t, on, ttl) => `<button class="rp-tg" data-fmt="${k}" aria-pressed="${!!on}" title="${ttl}" aria-label="${ttl}" ${isTxt ? "" : "disabled"}>${t}</button>`;
    const fonts = [...new Set([f.n, ...FONTS])].map(n => `<option ${n === f.n ? "selected" : ""}>${esc(n)}</option>`).join(""), sizes = [...new Set([f.s, ...SIZES])].sort((a, b) => a - b).map(n => `<option ${n === f.s ? "selected" : ""}>${n}</option>`).join("");
    const bd = p.bd || {};
    const ref = so.length > 1 ? so[0].name : "", n2 = so.length > 1, n3 = so.length > 2;
    const ic = (k, ttl, paths, on) => `<button class="rp-tg rp-al" data-al="${k}" title="${esc(ttl + (n2 ? " (acuan: " + ref + ")" : " (pilih minimal " + (k.startsWith("d") ? 3 : 2) + " objek)"))}" aria-label="${esc(ttl)}" ${on ? "" : "disabled"}><svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">${paths}</svg></button>`;
    const alg = `<span class="rp-sep"></span><span class="rp-note" style="margin:0">Align</span>` +
      ic("l", "Rata kiri", '<path d="M2 1v14"/><rect x="4" y="3" width="9" height="3.5"/><rect x="4" y="9.5" width="5" height="3.5"/>', n2) + ic("ch", "Rata tengah horizontal", '<path d="M8 1v14"/><rect x="3" y="3" width="10" height="3.5"/><rect x="5" y="9.5" width="6" height="3.5"/>', n2) + ic("r", "Rata kanan", '<path d="M14 1v14"/><rect x="3" y="3" width="9" height="3.5"/><rect x="7" y="9.5" width="5" height="3.5"/>', n2) +
      ic("t", "Rata atas", '<path d="M1 2h14"/><rect x="3" y="4" width="3.5" height="9"/><rect x="9.5" y="4" width="3.5" height="5"/>', n2) + ic("cv", "Rata tengah vertikal", '<path d="M1 8h14"/><rect x="3" y="3" width="3.5" height="10"/><rect x="9.5" y="5" width="3.5" height="6"/>', n2) + ic("b", "Rata bawah", '<path d="M1 14h14"/><rect x="3" y="3" width="3.5" height="9"/><rect x="9.5" y="7" width="3.5" height="5"/>', n2) +
      `<span class="rp-sep"></span><span class="rp-note" style="margin:0">Ukuran</span>` +
      ic("sw", "Samakan lebar", '<path d="M2 3v10M14 3v10M2 8h12"/>', n2) + ic("sh", "Samakan tinggi", '<path d="M3 2h10M3 14h10M8 2v12"/>', n2) + ic("sb", "Samakan lebar dan tinggi", '<rect x="2" y="2" width="12" height="12"/><path d="M5 11l6-6M8 5h3v3"/>', n2) +
      ic("dh", "Sebar horizontal (spasi sama)", '<path d="M2 2v12M14 2v12"/><rect x="6.5" y="4" width="3" height="8"/>', n3) + ic("dv", "Sebar vertikal (spasi sama)", '<path d="M2 2h12M2 14h12"/><rect x="4" y="6.5" width="8" height="3"/>', n3);
    el.innerHTML = `<select data-fmt="fn" ${isTxt ? "" : "disabled"} aria-label="Font">${fonts}</select><select data-fmt="fs" ${isTxt ? "" : "disabled"} aria-label="Ukuran">${sizes}</select>
      ${tg("b", "<b>B</b>", f.b, "Tebal (Ctrl+B)")}${tg("i", "<i>I</i>", f.i, "Miring (Ctrl+I)")}${tg("u", "<u>U</u>", f.u, "Garis bawah (Ctrl+U)")}
      <span class="rp-sep"></span>${tg("ha-l", "≡", effHa(p) === "l" || !effHa(p), "Rata kiri")}${tg("ha-c", "☰", effHa(p) === "c", "Rata tengah")}${tg("ha-r", "≣", effHa(p) === "r", "Rata kanan")}
      <span class="rp-sep"></span><label class="rp-cl" title="Warna teks">A<input type="color" data-fmt="fc" value="${tcol(p.fc)}" ${isTxt ? "" : "disabled"}></label>
      <label class="rp-cl" title="Warna isi / latar">▣<input type="color" data-fmt="${isLn && p.kind === "Box" ? "fill" : "bg"}" value="${tcol(p.kind === "Box" ? p.fill : p.bg) === "#000000" && !(p.kind === "Box" ? p.fill : p.bg) ? "#ffffff" : tcol(p.kind === "Box" ? p.fill : p.bg)}"></label>
      <button class="rp-tg" data-fmt="nofill" title="Tanpa isi" aria-label="Tanpa isi">∅</button>
      <span class="rp-sep"></span><span class="rp-note" style="margin:0">Border</span>
      <button class="rp-tg" data-fmt="bd-all" title="Border semua sisi" aria-label="Border semua sisi" ${isTxt ? "" : "disabled"}>▢</button><button class="rp-tg" data-fmt="bd-none" title="Tanpa border" aria-label="Tanpa border" ${isTxt ? "" : "disabled"}>▫</button>
      <button class="rp-tg" data-fmt="bd-t" aria-pressed="${!!bd.t}" title="Atas" aria-label="Border atas" ${isTxt ? "" : "disabled"}>▔</button><button class="rp-tg" data-fmt="bd-b" aria-pressed="${!!bd.b}" title="Bawah" aria-label="Border bawah" ${isTxt ? "" : "disabled"}>▁</button>
      <span class="rp-sep"></span><label class="rp-cl" title="Tebal garis (twips)">Garis<input type="number" min="10" max="100" step="5" data-fmt="lt" value="${p.lt || 20}" style="width:56px" ${isLn ? "" : "disabled"}></label>
      <label class="rp-cl" title="Warna garis">▬<input type="color" data-fmt="lc" value="${tcol(p.lc)}" ${isLn ? "" : "disabled"}></label>` + alg;
  }
  function renderLeft() {
    const el = $("#rp-left"), d = doc(); $("#rp-grid").style.gridTemplateColumns = `${st.leftOpen ? "240px " : ""}minmax(0,1fr) 260px`;
    if (!st.leftOpen) { el.style.display = "none"; return; } el.style.display = "";
    const tabs = `<div class="rp-ltabs">${[["files", "Layout"], ["struct", "Struktur"], ["fields", "Field"]].map(([k, t]) => `<button data-lt="${k}" aria-selected="${st.leftTab === k}">${t}</button>`).join("")}</div>`;
    let body = "";
    if (st.leftTab === "files") body = `${st.recent.length ? `<div class="rp-files rp-rc" style="max-height:150px"><span class="rp-note">Terakhir</span>${st.recent.map(p => `<button data-rc="${esc(p)}" title="${esc(p)}">${esc(p.split(/[\\/]/).filter(Boolean).slice(-2).join("\\"))}</button>`).join("")}</div>` : ""}<div class="rp-files">${st.files.map(f => `<button data-f="${esc(f.path)}" data-nm="${esc(f.name)}" title="${f.kb} KB">${esc(f.name)}</button>`).join("") || `<p class="rp-note" style="padding:0 12px">Pilih folder berisi .rpt.</p>`}</div>`;
    if (st.leftTab === "struct") {
      if (!d) body = `<p class="rp-note" style="padding:0 12px">Buka layout dulu.</p>`;
      else { const labels = sectionLabels(d.sections); body = `<div class="rp-files">${d.sections.map((s, i) => `<div class="rp-sh"><span class="${s.sup && s.sup !== "no" ? "rp-sup" : ""}">${esc(labels[i])}</span><span class="rp-sha">${s.sup !== undefined && !st.agentOld ? `<button class="rp-eye" type="button" data-sec="${esc(s.name)}" aria-pressed="${s.sup !== "no"}" title="Sembunyikan section ini (Suppress)" aria-label="Sembunyikan section ${esc(labels[i])}">${icon(s.sup !== "no" ? "eyex" : "eye")}</button><label title="Sembunyikan section ini bila kosong (bawaan Crystal)"><input type="checkbox" data-sb="${esc(s.name)}" ${s.supBlank ? "checked" : ""}> kosong</label>` : ""}<label title="Tinggi section (cm)"><input type="number" step="0.1" min="0" data-sh="${esc(s.name)}" value="${cm(s.h)}"> cm</label></span></div>` +
        d.objects.filter(o => o.section === s.name).map(o => `<button class="rp-so${d.sel.includes(o.name) ? " on" : ""}${o.sup && o.sup !== "no" ? " rp-sup" : ""}" data-s="${esc(o.name)}"><i class="rp-k rp-k-${o.kind}"></i><span class="rp-nm">${esc(o.name)}</span>${o.sup && o.sup !== "no" ? `<span class="rp-eic" title="Disembunyikan (Suppress)">${icon("eyex")}</span>` : ""}<small>${esc(shown(o.kind, o.text).slice(0, 18))}</small></button>`).join("")).join("")}</div>`; }
    }
    if (st.leftTab === "fields") {
      if (!d) body = `<p class="rp-note" style="padding:0 12px">Buka layout dulu.</p>`;
      else if (!d.fields) { body = `<p class="rp-note" style="padding:0 12px">Membaca daftar field…</p>`; loadFields(d); }
      else {
        const flt = st.ffilter.toLowerCase(), nm = s => String(s).replace(/^\{(?:[^.}]+\.)?/, "").replace(/\}$/, ""), src = (t, f) => String(f.name).startsWith("{") ? f.name : `{${t.name}.${f.name}}`;
        const row = (label, source, type, sp) => `<div class="rp-fld" draggable="true" data-src="${esc(source)}" data-type="${type}" ${sp ? 'data-sp="1"' : ""} title="Seret ke kanvas, atau klik dua kali untuk menambah"><span>${esc(label)}</span><small>${type == 6 ? "angka" : type == 15 ? "tanggal" : "teks"}</small></div>`;
        body = `<input class="rp-fs" data-ff placeholder="Cari field…" value="${esc(st.ffilter)}"><div class="rp-files">` +
          d.fields.tables.map(t => `<details open><summary>${esc(t.name)} (${t.fields.length})</summary>${t.fields.filter(f => nm(f.name).toLowerCase().includes(flt)).map(f => row(nm(f.name), src(t, f), f.type)).join("")}</details>`).join("") +
          ((d.fields.special || []).length ? `<details open><summary>Special Field (${d.fields.special.length})</summary>${d.fields.special.filter(f => String(f.label).toLowerCase().includes(flt)).map(f => row(f.label, f.source, f.type, true)).join("")}</details>` : "") +
          `<details><summary>Formula (${d.fields.formulas.length})</summary>${d.fields.formulas.map(f => String(f.name || f)).filter(n => n.toLowerCase().includes(flt)).map(n => row("@" + n.replace(/^@/, ""), "{@" + n.replace(/^@/, "") + "}", 11)).join("")}</details>` +
          `<details><summary>Parameter (${d.fields.params.length})</summary>${d.fields.params.map(String).filter(n => n.toLowerCase().includes(flt)).map(n => row("?" + n.replace(/^\?/, ""), "{?" + n.replace(/^\?/, "") + "}", 11)).join("")}</details></div>`;
      }
    }
    el.innerHTML = tabs + body;
  }
  async function loadFields(d) {
    try { d.fields = await ag("/rpt/fields", { docId: d.docId }); } catch (e) { d.fields = { tables: [], formulas: [], params: [], special: [] }; st.err = "Daftar field gagal dibaca: " + e.message; renderMsg(); }
    if (st.leftTab === "fields") renderLeft();
  }
  function renderTabs() {
    const d = doc();
    $("#rp-tabs").innerHTML = st.docs.map(x => `<div class="rp-tabw" role="presentation"><button class="rp-tab" role="tab" aria-selected="${x.docId === st.cur}" data-t="${x.docId}" title="${esc(x.path)}">${x.dirty ? `<span class="dot">●</span>` : ""}${esc(x.name)}</button><button class="rp-x" type="button" data-x="${x.docId}" title="Tutup" aria-label="Tutup ${esc(x.name)}">×</button></div>`).join("");
    $("#rp-tabs").style.display = d ? "" : "none";
  }

  // ---------- kanvas ----------
  function renderCanvas() {
    const el = $("#rp-canvas"), d = doc(), keep = [el.scrollLeft, el.scrollTop]; st.te = null;
    if (!d) { el.innerHTML = `<div class="placeholder" style="margin:12px">Klik file di panel Layout untuk membuka (bisa beberapa tab).</div>`; $("#rp-status").textContent = ""; return; }
    const s = scale(d), secs = d.sections, map = secMap(d), total = secs.reduce((a, x) => a + x.h, 0), W = d.pageW * s, H = total * s, labels = sectionLabels(secs);
    let rul = "";
    for (let c = 0; c * PX_PER_CM * d.zoom <= W; c++) {
      const x = c * PX_PER_CM * d.zoom;
      rul += `<line x1="${x}" y1="10" x2="${x}" y2="20" stroke="currentColor"/><text x="${x + 3}" y="11" font-size="9" fill="currentColor">${c}</text>`;
      if (d.zoom > .5) rul += `<line x1="${x + PX_PER_CM * d.zoom / 2}" y1="15" x2="${x + PX_PER_CM * d.zoom / 2}" y2="20" stroke="currentColor"/>`;
    }
    const gut = secs.map((x, i) => x.h < 120 ? "" : `<div class="rp-gl${x.sup && x.sup !== "no" ? " rp-supsec" : ""}" style="top:${x.top * s}px;height:${x.h * s}px"><span>${esc(labels[i])}</span>${x.supBlank ? `<small class="rp-note" style="display:block;margin:2px 0 0">kosong disembunyikan</small>` : ""}${x.sup !== undefined && !st.agentOld ? `<button class="rp-eye" type="button" data-sec="${esc(x.name)}" aria-pressed="${x.sup !== "no"}" title="Sembunyikan / tampilkan section ini (Suppress)" aria-label="Sembunyikan section ${esc(labels[i])}">${icon(x.sup !== "no" ? "eyex" : "eye")}</button>` : ""}</div>`).join("");
    let body = "", defs = "", n = 0, marks = "";
    secs.forEach(sc => { if (sc.h > 0) body += `<line x1="0" y1="${sc.top + sc.h}" x2="${d.pageW}" y2="${sc.top + sc.h}" stroke="#9aa7ad" stroke-dasharray="6 5" stroke-width="1" vector-effect="non-scaling-stroke"/>`; });
    secs.forEach(sc => { if (sc.h > 0 && sc.sup && sc.sup !== "no") body += `<rect class="supsec" x="0" y="${sc.top}" width="${d.pageW}" height="${sc.h}"/>`; });
    d.objects.forEach(o => {
      const { x, y, w, h } = geom(d, o, map); let g = "";
      if (o.kind === "Line" || o.kind === "Box") {
        const col = o.lc || "#000", lt = Math.max(o.lt || 20, 12);
        if (o.kind === "Box") g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${(o.rx || 0) / 2}" fill="${o.fill || "none"}" ${o.ls === false ? "" : `stroke="${col}" stroke-width="${lt}"`}/>`;
        else if (o.ls !== false) g += `<line x1="${x}" y1="${y}" x2="${x + w}" y2="${y + h}" stroke="${col}" stroke-width="${lt}"/>`;
        const pad = Math.max(40, 6 / s); g += `<rect class="hit" x="${x - pad}" y="${y - pad}" width="${w + pad * 2}" height="${h + pad * 2}" fill="transparent"/>`;
      } else {
        if (o.bg) g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${o.bg}"/>`;
        const bd = o.bd || {}, bc = o.bdc || "#000", L = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${bc}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
        if (bd.l) g += L(x, y, x, y + h); if (bd.r) g += L(x + w, y, x + w, y + h); if (bd.t) g += L(x, y, x + w, y); if (bd.b) g += L(x, y + h, x + w, y + h);
        const nha = effHa(o), pad = 30;
        const para = (o.lines && o.lines.length ? o.lines : [{ t: o.text }]).map(l => ({ t: shown(o.kind, l.t), f: l.font || o.font, fc: l.fc || o.fc, ha: l.ha || nha }));
        if (para.some(l => l.t && l.f)) {
          // bungkus per kata; berhenti bila sudah melewati tinggi objek (sisanya terpotong clipPath)
          const lines = []; let used = pad;
          for (const l of para) {
            const fs = (l.f ? l.f.s || 10 : 10) * 20, lh = fs * 1.2, f = l.f || DEF_FONT;
            const room = Math.max(1, Math.floor((h - used - pad) / lh + .15));
            const parts = l.t ? wrapText(l.t, f, fs, w - pad * 2, room) : [""];
            for (const t of parts) { if (lines.length && used + lh > h) break; lines.push({ ...l, t }); used += lh; }
          }
          const id = "c" + (n++), fsz = l => (l.f ? l.f.s || 10 : 10) * 20, tot = lines.reduce((a, l) => a + fsz(l) * 1.2, 0);
          defs += `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${Math.max(w, 10)}" height="${Math.max(h, 10)}"/></clipPath>`;
          let cy = o.va === "c" ? y + (h - tot) / 2 : o.va === "b" ? y + h - pad - tot : y + pad;
          lines.forEach(l => {
            const fs = fsz(l), f = l.f || DEF_FONT; cy += fs * 1.2; if (!l.t) return;
            const anchor = l.ha === "c" ? "middle" : l.ha === "r" ? "end" : "start", tx = l.ha === "c" ? x + w / 2 : l.ha === "r" ? x + w - pad : x + pad;
            g += `<text x="${tx}" y="${cy - fs * .3}" text-anchor="${anchor}" font-family="${esc(f.n)}, Arial, sans-serif" font-size="${fs}" font-weight="${f.b ? 700 : 400}" font-style="${f.i ? "italic" : "normal"}" text-decoration="${[f.u ? "underline" : "", f.x ? "line-through" : ""].join(" ").trim() || "none"}" fill="${l.fc || "#000"}" clip-path="url(#${id})" style="pointer-events:none">${esc(l.t)}</text>`;
          });
        } else if (!["Text", "Field"].includes(o.kind)) {
          g += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(120,140,150,.12)" stroke="#8a9aa0" stroke-dasharray="40 30" stroke-width="1" vector-effect="non-scaling-stroke"/><text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" font-size="160" fill="#6b7a80" style="pointer-events:none">${esc(o.kind)}</text>`;
        }
        g += `<rect class="hit" x="${x}" y="${y}" width="${Math.max(w, 30)}" height="${Math.max(h, 30)}" fill="transparent"/>`;
      }
      const sp = o.sup && o.sup !== "no"; if (sp && !st.showSup) return; // Suppress: diredupkan + garis putus + ikon mata coret + lencana (tetap/bersyarat); tetap bisa dipilih
      body += `<g class="ob${sp ? " ob-sup" : ""}" data-n="${esc(o.name)}">${g}</g>`;
      if (sp) { const u = 14 / s, hh = Math.max(h, 30), ww = Math.max(w, 30); marks += `<g class="supm" pointer-events="none"><rect class="supo" x="${x}" y="${y}" width="${ww}" height="${hh}"/><g class="supi" transform="translate(${x + ww - u * 1.15} ${y}) scale(${u / 16})">${ICONS.eyex}</g><text class="supb" x="${x + 20}" y="${y + hh + 11 / s}" font-size="${10 / s}">${o.sup === "always" ? "tetap" : "bersyarat"}</text></g>`; }
    });
    body += marks;
    el.innerHTML = `<div class="rp-stage" style="width:${W + 96}px"><div class="rp-rrow"><div class="rp-corner"></div><svg width="${W}" height="20" class="rp-ruler">${rul}</svg></div>
      <div class="rp-body"><div class="rp-gutter" style="height:${H}px">${gut}</div>
      <svg class="rp-paper" width="${W}" height="${H}" viewBox="0 0 ${d.pageW} ${total}"><defs>${defs}</defs>${body}<g id="ovl"></g></svg></div></div>`;
    el.scrollLeft = keep[0]; el.scrollTop = keep[1]; el.classList.toggle("rp-armed", !!st.tool);
    renderOverlay(); renderStatus();
  }
  // outline seleksi + 8 handle (hanya jika satu objek terpilih)
  function renderOverlay() {
    const d = doc(), o = $("#ovl"); if (!d || !o) return; const s = scale(d), map = secMap(d), hs = (st.ptype === "touch" ? 16 : 8) / s; let h = "";
    selObjs(d).forEach(ob => { const q = geom(d, ob, map); h += `<rect class="selbox" x="${q.x}" y="${q.y}" width="${Math.max(q.w, 30)}" height="${Math.max(q.h, 30)}"/>`; });
    if (d.sel.length > 1) {
      const so = selObjs(d), gs = so.map(ob => geom(d, ob, map)), x0 = Math.min(...gs.map(q => q.x)), y0 = Math.min(...gs.map(q => q.y)), x1 = Math.max(...gs.map(q => q.x + Math.max(q.w, 30))), y1 = Math.max(...gs.map(q => q.y + Math.max(q.h, 30)));
      h += `<rect class="grpbox" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>`;
      const rf = so[0], q = rf && geom(d, rf, map); if (rf) h += `<rect class="refbox" x="${q.x}" y="${q.y}" width="${Math.max(q.w, 30)}" height="${Math.max(q.h, 30)}"><title>Objek acuan: ${esc(rf.name)}</title></rect>`;
    }
    if (d.sel.length === 1) {
      const ob = selObjs(d)[0]; if (ob) {
        const q = geom(d, ob, map), W = Math.max(q.w, 30), Hh = Math.max(q.h, 30), xs = { w: q.x, c: q.x + W / 2, e: q.x + W }, ys = { n: q.y, m: q.y + Hh / 2, s: q.y + Hh };
        const hdl = [["nw", xs.w, ys.n], ["n", xs.c, ys.n], ["ne", xs.e, ys.n], ["e", xs.e, ys.m], ["se", xs.e, ys.s], ["s", xs.c, ys.s], ["sw", xs.w, ys.s], ["w", xs.w, ys.m]];
        // tampilan handle 12px (touch 18px); area klik tak terlihat 2x lebih lebar, dibatasi 1/3 sisi terpendek objek agar objek kecil tetap bisa digeser; sudut digambar terakhir supaya menang atas sisi
        const vs = (st.ptype === "touch" ? 18 : 12) / s, hit = Math.min(vs * 2, Math.max(vs, Math.min(W, Hh) / 3));
        hdl.sort((a, b) => a[0].length - b[0].length).reverse();
        hdl.forEach(([k, hx, hy]) => { if ((q.w === 0 && /e|w/.test(k)) || (q.h === 0 && /[ns]/.test(k))) return;
          h += `<rect class="hdl" data-h="${k}" x="${hx - hit / 2}" y="${hy - hit / 2}" width="${hit}" height="${hit}"/><rect class="hdv" x="${hx - vs / 2}" y="${hy - vs / 2}" width="${vs}" height="${vs}"/>`; });
      }
    }
    o.innerHTML = h; updGhost();
  }
  function renderStatus() {
    const d = doc(), el = $("#rp-status"); if (!d) return; const so = selObjs(d);
    el.dataset.base = st.tool ? toolMsg() : so.length === 1 ? `${so[0].name} · x ${cm(so[0].l)} cm · y ${cm(so[0].t)} cm · ${cm(so[0].w)}×${cm(so[0].h)} cm` : so.length ? `${so.length} objek dipilih · acuan align: ${so[0].name}` : `${d.objects.length} objek`;
    el.textContent = el.dataset.base + ` · ${Math.round(d.zoom * 100)}%`;
  }
  // ---------- Suppress (kartu "Tampilan"): BELUM terbukti di SDK nyata. Rumus Crystal disusun AGEN dari struktur syarat; UI hanya menampilkan ----------
  const supOk = o => !st.agentOld && o && o.sup !== undefined; // agen lama / SDK menolak membaca Format -> kartu disembunyikan
  const fieldChoices = d => { const f = d.fields; if (!f) return []; const nm = (t, x) => String(x.name).startsWith("{") ? x.name : `{${t.name}.${x.name}}`; return [...f.tables.flatMap(t => t.fields.map(x => nm(t, x))), ...(f.formulas || []).map(x => "{@" + String(x.name || x).replace(/^@/, "") + "}")]; };
  function initSup(o) {
    const s = { name: o.name, sig: o.sup + "|" + (o.supf || ""), mode: o.sup === "always" ? "always" : o.sup === "if" ? "if" : "show", conds: [{ field: "", op: "zero", value: "" }], join: "and", raw: "", rawOn: false, custom: false, ow: false, chk: null, err: "" };
    if (o.sup === "if") { const p = o.supk === "pattern" ? parseCond(o.supf) : null; if (p) { s.conds = p.conds; s.join = p.join; } else { s.custom = true; s.raw = o.supf || ""; } }
    return s;
  }
  function supCard(o, d) {
    if (!supOk(o)) return "";
    if (!st.sup || st.sup.name !== o.name || st.sup.sig !== o.sup + "|" + (o.supf || "")) st.sup = initSup(o);
    const s = st.sup, rd = (v, t) => `<label class="rp-rd"><input type="radio" name="sup-m" data-sm="${v}" ${s.mode === v ? "checked" : ""}> ${t}</label>`;
    if (!d.fields && !d.loadingF) { d.loadingF = true; loadFields(d).then(() => { d.loadingF = false; renderSide(); }); }
    let body = "";
    if (s.mode === "if") {
      if (s.custom && !s.rawOn) body = `<p class="rp-note">Rumus kustom (hanya teks), tidak dikenali sebagai syarat sederhana:</p><code class="rp-code">${esc(o.supf || s.raw)}</code><label class="rp-bck"><input type="checkbox" data-sow ${s.ow ? "checked" : ""}> Saya mengerti: timpa rumus kustom ini bila saya menerapkan perubahan</label>`;
      else if (s.rawOn) body = `${s.custom ? `<label class="rp-bck"><input type="checkbox" data-sow ${s.ow ? "checked" : ""}> Saya mengerti: timpa rumus kustom yang ada</label>` : ""}<label class="rp-col1">Rumus Crystal (sintaks Crystal, maks 500 karakter)<textarea data-sraw rows="4" maxlength="500" spellcheck="false">${esc(s.raw)}</textarea></label><button class="edit-btn" type="button" data-a="sup-chk" ${s.chk && s.chk.busy ? "disabled" : ""}>Periksa rumus</button>${s.chk ? `<p class="rp-note ${s.chk.ok ? "rp-ok" : "rp-er"}" role="status">${s.chk.busy ? "Memeriksa…" : s.chk.ok ? "Sintaks rumus OK." : "Ditolak: " + esc(s.chk.msg)}</p>` : ""}<button class="edit-btn" type="button" data-a="sup-rawoff">Kembali ke syarat sederhana</button>`;
      else body = `<datalist id="sup-fl">${fieldChoices(d).map(x => `<option value="${esc(x)}">`).join("")}</datalist>` +
        s.conds.map((c, i) => `<div class="rp-cr"><input data-sc="${i}:field" list="sup-fl" value="${esc(c.field)}" placeholder="{Command.Kolom}" aria-label="Kolom syarat ${i + 1}"><select data-sc="${i}:op" aria-label="Operator ${i + 1}">${SUP_OPS.map(([v, t]) => `<option value="${v}" ${c.op === v ? "selected" : ""}>${t}</option>`).join("")}</select>${NOVAL(c.op) ? "" : `<input data-sc="${i}:value" value="${esc(c.value)}" placeholder="nilai" aria-label="Nilai ${i + 1}">`}<button class="edit-btn" type="button" data-sdel="${i}" aria-label="Hapus syarat ${i + 1}" ${s.conds.length < 2 ? "disabled" : ""}>×</button></div>`).join("") +
        `${s.conds.length > 1 ? `<label class="rp-col1">Gabungkan syarat<select data-sj><option value="and" ${s.join === "and" ? "selected" : ""}>Semua syarat terpenuhi (AND)</option><option value="or" ${s.join === "or" ? "selected" : ""}>Salah satu terpenuhi (OR)</option></select></label>` : ""}<button class="edit-btn" type="button" data-sadd ${s.conds.length >= 8 ? "disabled" : ""}>+ syarat</button> <button class="edit-btn" type="button" data-a="sup-rawon">Rumus Crystal (lanjutan)</button>` +
        `<p class="rp-note" id="sup-sum">${condErr(s) ? "" : esc(condSummary(o.name, s))}</p>`;
    }
    return `<div class="rp-card" id="rp-sup"><b>Tampilan</b>${rd("show", "Tampilkan")}${rd("always", "Sembunyikan selalu")}${rd("if", "Sembunyikan jika…")}${body}
      ${o.supf && !(s.custom && !s.rawOn) ? `<p class="rp-note">Rumus tersimpan: <code class="rp-code">${esc(o.supf)}</code></p>` : ""}
      <button class="edit-btn rp-primary" type="button" data-a="sup-apply">Terapkan</button>${s.err ? `<p class="rp-er" role="alert">${esc(s.err)}</p>` : ""}
      <p class="rp-note">Objek tersembunyi tetap dihitung di total (mis. Sum). Hasil sebenarnya dilihat di Preview. Fitur ini belum terbukti di SDK: periksa hasilnya di Preview dan di Crystal sebelum dipakai.</p></div>`;
  }
  async function supCheck() {
    const d = doc(), s = st.sup; if (!s) return; const text = s.raw.trim(); s.chk = { text, ok: false, msg: "", busy: true }; renderSide();
    try { const r = await ag("/rpt/checkFormula", { docId: d.docId, text }); s.chk = { text, ok: !!r.ok, msg: r.error || "", busy: false }; } catch (e) { s.chk = { text, ok: false, msg: e.message, busy: false }; }
    renderSide();
  }
  function supApply() {
    const d = doc(), s = st.sup, o = s && d.objects.find(x => x.name === s.name); if (!o) return; s.err = "";
    const op = { op: "setProps", name: o.name };
    if (s.mode === "show") op.sup = "no"; else if (s.mode === "always") op.sup = "always";
    else if (s.rawOn) { if (!s.chk || !s.chk.ok || s.chk.text !== s.raw.trim()) { s.err = "Periksa rumus dulu (tombol Periksa rumus) dan pastikan lolos."; return renderSide(); } op.sup = "if"; op.raw = s.raw.trim(); }
    else if (s.custom) { if (!s.ow) { s.err = "Rumus kustom tidak diubah. Centang konfirmasi timpa atau pilih mode lain."; return renderSide(); } const e = condErr(s); if (e) { s.err = e; return renderSide(); } op.sup = "if"; op.cond = { conds: s.conds.map(c => ({ field: c.field.trim(), op: c.op, value: NOVAL(c.op) ? "" : c.value })), join: s.join }; }
    else { const e = condErr(s); if (e) { s.err = e; return renderSide(); } op.sup = "if"; op.cond = { conds: s.conds.map(c => ({ field: c.field.trim(), op: c.op, value: NOVAL(c.op) ? "" : c.value })), join: s.join }; }
    if (s.ow) op.overwriteCustom = true;
    run(async () => { await ops([op]); st.msg = "Tampilan diterapkan (" + (op.sup === "no" ? "tampilkan" : op.sup === "always" ? "sembunyikan selalu" : "sembunyikan bersyarat") + "). Cek di Preview."; });
  }
  const secSup = (name, patch) => run(async () => { await ops([{ op: "setSectionProps", name, ...patch }]); });
  const renderSupSum = () => { const s = st.sup, n = $("#sup-sum"); if (n && s) n.textContent = condErr(s) ? "" : condSummary(s.name, s); };
  function renderSide() {
    const d = doc(), el = $("#rp-side"); const so = d ? selObjs(d) : [];
    let h = `<h3>Properti</h3><div class="rp-props">`;
    if (!so.length) h += `<p class="rp-note">Klik objek di kanvas. Seret untuk memindah, tarik kotak kecil di sudut untuk mengubah ukuran. Shift/Ctrl+klik menambah pilihan.</p>`;
    else if (so.length > 1) h += `<b>${so.length} objek dipilih</b><p class="rp-note">Seret untuk memindah bersama. Panah = geser 1 mm (Shift = 1 cm). Format di bar atas berlaku untuk semua.</p>`;
    else {
      const o = so[0];
      h += `<b>${esc(o.name)}</b> <span class="rp-note">${o.kind} · ${esc(o.section)}</span>` +
        ["l", "t", "w", "h"].map(k => `<label>${{ l: "Kiri", t: "Atas", w: "Lebar", h: "Tinggi" }[k]}<input type="number" data-k="${k}" value="${o[k]}"><small>${cm(o[k])} cm</small></label>`).join("") +
        (o.kind === "Text" && (!o.lines || o.lines.length <= 1) ? `<label>Teks<input type="text" data-k="text" value="${esc(o.text || "")}"></label>` : o.kind === "Text" ? `<p class="rp-note">Teks beberapa baris: ubah isi di Crystal.</p>` : "") +
        (o.kind === "Field" ? `<p class="rp-note">Sumber: ${esc(o.text || "")}</p>` : "") +
        `<p class="rp-note">Satuan twips (1 cm = 567). Tersimpan ke dokumen saat Enter atau pindah kolom; klik Simpan salinan untuk menulis file.</p>` + supCard(o, d);
    }
    el.innerHTML = h + `</div>`;
  }
  function renderModal() { // fokus: simpan pemicu saat dialog dibuka, pulihkan saat ditutup
    const was = st.modalOpen, pre = document.activeElement; renderModalBody();
    const now = !!(st.batch || st.prev || st.verify); st.modalOpen = now;
    if (now && !was) { st.trig = pre; st.trigKey = focusKey(pre); const m = $("#rp-modal"); if (m && !m.contains(document.activeElement)) m.querySelector("input:not(:disabled), button:not(:disabled)")?.focus(); }
    else if (!now && was) { const n = st.trigKey && $(st.trigKey), t = st.trig; st.trig = null; st.trigKey = null; if (n && !n.disabled) n.focus(); else if (t && t.isConnected && t.focus) t.focus(); }
  }
  function renderModalBody() {
    if (st.batch) return renderBatch();
    if (st.prev) return renderPrev();
    const el = $("#rp-modal"), v = st.verify; if (!v) { el.innerHTML = ""; return; }
    const d = doc(), ps = (d.fields && d.fields.params) || [];
    el.innerHTML = `<div class="rp-ov"><div class="rp-dlg" role="dialog" aria-modal="true" aria-label="Verify Database">
      <h3>Verify Database</h3><p class="rp-note">Mendaftarkan kolom terbaru dari database ke layout ini. Kredensial hanya dikirim ke agen di PC ini dan tidak disimpan.</p>
      ${d.canUndo || d.canRedo ? `<div class="callout" role="status"><span>Riwayat undo/redo akan direset setelah Verify (perubahan pada layout tetap ada).</span></div>` : ""}
      <label>Server<input id="v-server" value="${esc(v.server)}" placeholder="hanappmkqa:30015"></label>
      <label>User<input id="v-user" value="${esc(v.user)}" autocomplete="off"></label>
      <label>Password<input id="v-pass" type="password" autocomplete="off"></label>
      ${ps.map(p => `<label>${esc(p)}<input data-vp="${esc(p)}" value="${esc(v.params[p] ?? (/DocKey/i.test(p) ? "1" : ""))}"></label>`).join("")}
      ${v.result ? `<div class="${v.result.ok ? "callout" : "error"}" role="${v.result.ok ? "status" : "alert"}"><span>${esc(v.result.message)}</span></div>` : ""}
      ${v.busy ? `<p class="rp-note">Menghubungi server… (bisa sampai 30 detik)</p>` : ""}
      <div class="row"><button class="edit-btn" data-a="vcancel">Tutup</button><button class="edit-btn rp-primary" data-a="vrun" ${v.busy ? "disabled" : ""}>Verify</button></div></div></div>`;
  }

  // ---------- preview dengan data asli (PDF dari agen, hanya di memori browser) ----------
  function renderPrev() {
    const el = $("#rp-modal"), v = st.prev, d = doc(), ps = (d && d.fields && d.fields.params) || [];
    if (v.url) {
      el.innerHTML = `<div class="rp-ov"><div class="rp-dlg rp-view" role="dialog" aria-modal="true" aria-label="Preview dengan data">
        <div class="row" style="margin:0 0 8px;justify-content:space-between;align-items:center"><b>Preview dengan data${v.pages ? ` · ${esc(v.pages)} halaman` : ""}</b><span><button class="edit-btn" data-a="popen">Buka di tab baru</button> <button class="edit-btn rp-primary" id="p-close" data-a="pclose">Tutup</button></span></div>
        <iframe class="rp-pdf" src="${esc(v.url)}" title="Preview PDF"></iframe></div></div>`;
      const b = $("#p-close"); if (b) b.focus(); return;
    }
    el.innerHTML = `<div class="rp-ov"><div class="rp-dlg" role="dialog" aria-modal="true" aria-label="Preview dengan data">
      <h3>Preview dengan data</h3><p class="rp-note">Menjalankan layout (termasuk perubahan yang belum disimpan) ke database lalu menampilkan hasilnya sebagai PDF. Kredensial hanya dikirim ke agen di PC ini dan tidak disimpan; PDF tidak ditulis ke disk.</p>
      <label>Server<input id="p-server" value="${esc(v.server)}" placeholder="hanappmkqa:30015"></label>
      <label>User<input id="p-user" value="${esc(v.user)}" autocomplete="off"></label>
      <label>Password<input id="p-pass" type="password" autocomplete="off"></label>
      ${ps.map(p => `<label>${esc(p)}<input data-vp="${esc(p)}" value="${esc(v.params[p] ?? (/DocKey/i.test(p) ? "1" : ""))}"></label>`).join("")}
      ${v.error ? `<div class="error" role="alert"><span>${esc(v.error)}</span></div>` : ""}
      ${v.busy ? `<p class="rp-note" role="status">Menjalankan laporan… (maksimal 60 detik)</p>` : ""}
      <div class="row"><button class="edit-btn" id="p-cancel" data-a="${v.busy ? "pabort" : "pcancel"}">${v.busy ? "Batal" : "Tutup"}</button><button class="edit-btn rp-primary" data-a="prun" ${v.busy ? "disabled" : ""}>Preview</button></div></div></div>`;
    const f = $(v.server ? (v.user ? "#p-pass" : "#p-user") : "#p-server"); if (f && !v.busy) f.focus(); else if (v.busy) $("#p-cancel")?.focus();
  }
  function prevClose() { const v = st.prev; if (!v) return; if (v.ctrl) v.ctrl.abort(); if (v.url) URL.revokeObjectURL(v.url); st.prev = null; renderModal(); $("[data-a=preview]")?.focus(); }
  async function prevRun() {
    const v = st.prev, d = doc(), pass = $("#p-pass").value; v.server = $("#p-server").value.trim(); v.user = $("#p-user").value.trim();
    v.params = {}; art.querySelectorAll("[data-vp]").forEach(i => v.params[i.dataset.vp] = i.value);
    lsSet("rpt.vserver", v.server); lsSet("rpt.vuser", v.user); lsSet("rpt.vparams", JSON.stringify(v.params));
    if (!v.server || !v.user) { v.error = !v.server ? "Server wajib diisi." : "User wajib diisi."; return renderModal(); }
    const ctrl = new AbortController(); v.ctrl = ctrl; v.busy = true; v.error = ""; renderModal();
    try {
      const r = await fetch(AG + "/rpt/preview", { method: "POST", signal: ctrl.signal, headers: { "Content-Type": "application/json", Authorization: "Bearer " + token }, body: JSON.stringify({ docId: d.docId, server: v.server, user: v.user, password: pass, params: v.params }) });
      if (st.prev !== v) return;
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(r.status === 404 ? (st.agentMsg || "Agen belum mendukung Preview. Keluar dari tray lalu jalankan StemRptAgent.exe terbaru.") : (j.error || "HTTP " + r.status));
      }
      const blob = await r.blob(); if (st.prev !== v) return;
      v.pages = r.headers.get("X-Rpt-Pages") || ""; v.url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
    } catch (e) {
      if (st.prev !== v) return;
      v.error = e.name === "AbortError" ? "Dibatalkan." : (e instanceof TypeError ? "Agen tidak terjangkau di 127.0.0.1:47831." : e.message);
    }
    v.busy = false; v.ctrl = null; renderModal();
  }

  // ---------- Batch (wizard 5 langkah): mesin tetap (dry-run wajib, kunci stale batchSig, hasil _edit_N); bahasa awam di UI ----------
  const GOALS = [
    { k: "clone", t: "Tambah baris dari yang lama (gandakan)", ex: "Contoh: baris Email digandakan jadi baris Branch tepat di bawahnya." },
    { k: "replace", t: "Ganti teks atau kolom di tempat", ex: "Contoh: tulisan Email menjadi Branch, kolom E_Mail menjadi BranchName." },
    { k: "props", t: "Ubah tampilan (font, rata, warna)", ex: "Contoh: semua tulisan di bagian Page Header dibuat tebal dan rata tengah." },
    { k: "sup", t: "Sembunyikan (Suppress)", ex: "Contoh: sembunyikan baris Diskon bila nilainya nol. Belum terbukti di SDK: coba di 1 file dulu." }
  ];
  const STEPS = ["Tujuan", "Layout", "Objek yang dicari", "Perubahan", "Periksa dan simpan"];
  const newBatch = () => ({ step: 1, goal: "", paths: [], q: "", find: { sec: "", kind: "Text", text: "", all: true }, ch: { place: "below", gap: "0", tr: [{ from: "", to: "" }], fr: [{ from: "", to: "" }], fn: "", fs: "", b: "", ha: "", fc: "", supm: "always", join: "and", conds: [{ field: "", op: "zero", value: "" }] }, probe: null, dry: null, sig: null, trial: null, fin: null, busy: "", err: "" });
  const setP = (o, p, v) => { const ks = p.split("."), l = ks.pop(); ks.reduce((a, k) => a[k], o)[l] = v; };
  const kindTxt = { Text: "teks", Field: "field", Box: "kotak", Line: "garis", "": "objek apa pun" };
  function findOf(b) { const f = b.find, find = {}; if (f.kind) find.kind = f.kind; if (f.text.trim()) find[f.kind === "Field" ? "sourceContains" : "textContains"] = f.text.trim(); if (f.sec.trim()) find.section = f.sec.trim(); if (f.all) find.all = true; return find; }
  function batchOps(b) { // isian wizard -> {ops} atau {error}
    const find = findOf(b), c = b.ch; if (!find.kind && !find.textContains && !find.sourceContains && !find.section) return { error: "Isi pencarian: jenis objek, isi, atau nama bagian." };
    const pr = a => a.filter(x => x.from.trim()).map(x => ({ from: x.from.trim(), to: x.to.trim() }));
    if (b.goal === "clone" || b.goal === "replace") {
      const tr = pr(c.tr), fr = pr(c.fr); let op;
      if (b.goal === "replace") { if (!tr.length && !fr.length) return { error: "Isi minimal satu pasangan: tulisan lama dan baru, atau kolom lama dan baru." }; op = { op: "replace", find }; }
      else { const gap = Number(c.gap); if (!isFinite(gap) || gap < 0 || gap > 100) return { error: "Jarak harus angka 0 sampai 100 mm." }; op = { op: "cloneTo", find, place: c.place, gap: Math.round(gap * 56.7) }; }
      if (tr.length) op.textReplace = tr; if (fr.length) op.fieldReplace = fr; return { ops: [op] };
    }
    if (b.goal === "props") {
      const font = {}; if (c.fn) font.n = c.fn; if (c.fs) font.s = Number(c.fs); if (c.b) font.b = c.b === "1";
      const op = { op: "setProps", find }; if (Object.keys(font).length) op.font = font; if (c.fc) op.fc = c.fc; if (c.ha) op.ha = c.ha;
      return Object.keys(op).length === 2 ? { error: "Pilih minimal satu hal yang diubah (font, ukuran, tebal, rata, atau warna)." } : { ops: [op] };
    }
    if (b.goal === "sup") {
      if (c.supm === "always") return { ops: [{ op: "setProps", find, sup: "always" }] };
      const e = condErr({ conds: c.conds }); if (e) return { error: e };
      return { ops: [{ op: "setProps", find, sup: "if", cond: { conds: c.conds.map(x => ({ field: x.field.trim(), op: x.op, value: NOVAL(x.op) ? "" : x.value })), join: c.join } }] };
    }
    return { error: "Pilih dulu apa yang mau dilakukan." };
  }
  const batchSig = b => { const r = batchOps(b); return JSON.stringify({ p: [...b.paths].sort(), o: r.ops || r.error }); };
  const batchFiles = b => st.files.filter(f => f.name.toLowerCase().includes(b.q.toLowerCase()));
  const okPaths = b => ((b.dry && b.dry.results) || []).filter(r => r.status === "ok").map(r => r.path);
  const bnm = p => String(p || "").split(/[\\/]/).pop();
  const findTxt = b => { const f = b.find; return `${kindTxt[f.kind] || "objek"}${f.sec.trim() ? ` di bagian "${f.sec.trim()}"` : ""}${f.text.trim() ? ` berisi "${f.text.trim()}"` : ""}${f.all ? "" : " (hanya jika tepat satu)"}`; };
  const changeTxt = b => { const c = b.ch, pr = a => a.filter(x => x.from.trim()).map(x => `${x.from.trim()} → ${x.to.trim() || "(kosong)"}`);
    if (b.goal === "clone") return `Salinan di ${c.place === "below" ? "bawah" : "kanan"} (jarak ${c.gap || 0} mm)${[...pr(c.tr), ...pr(c.fr)].length ? "; ganti " + [...pr(c.tr), ...pr(c.fr)].join(", ") : ""}`;
    if (b.goal === "replace") return "Ganti " + ([...pr(c.tr), ...pr(c.fr)].join(", ") || "(belum diisi)");
    if (b.goal === "props") { const l = []; if (c.fn) l.push(c.fn); if (c.fs) l.push(c.fs + " pt"); if (c.b) l.push(c.b === "1" ? "tebal" : "tidak tebal"); if (c.ha) l.push("rata " + { l: "kiri", c: "tengah", r: "kanan" }[c.ha]); if (c.fc) l.push("warna " + c.fc); return l.join(", ") || "(belum diisi)"; }
    if (b.goal === "sup") return c.supm === "always" ? "Sembunyikan selalu" : condErr({ conds: c.conds }) ? "Sembunyikan jika (belum lengkap)" : "Sembunyikan jika " + c.conds.map(condLabel).join(c.join === "and" ? " DAN " : " ATAU "); return ""; };
  const stepOk = b => b.step === 1 ? !!b.goal : b.step === 2 ? b.paths.length > 0 : b.step === 3 ? !(!findOf(b).kind && !findOf(b).textContains && !findOf(b).sourceContains && !findOf(b).section) : b.step === 4 ? !batchOps(b).error : false;
  const stale = b => !!b.dry && b.sig !== batchSig(b);
  function renderBatchList() {
    const b = st.batch, el = $("#bt-list"); if (!b || !el) return; const fl = batchFiles(b);
    el.innerHTML = fl.map(f => `<label class="rp-bf"><input type="checkbox" data-bf="${esc(f.path)}" ${b.paths.includes(f.path) ? "checked" : ""}><span>${esc(f.name)}</span></label>`).join("") || `<p class="rp-note" style="padding:6px 8px">Tidak ada file.</p>`;
    const c = $("#bt-count"); if (c) c.textContent = `${b.paths.length} dari ${st.files.length} dipilih`;
    const all = $("#bt-all"); if (all) all.checked = fl.length > 0 && fl.every(f => b.paths.includes(f.path));
  }
  function renderBatchBtns() { // tombol Lanjut/Simpan + pesan + ringkasan; dipanggil tiap ketikan (tanpa render ulang isi)
    const b = st.batch; if (!b || !$("#bt-side")) return; const err = b.step === 4 ? batchOps(b).error : "", ok = stepOk(b), sl = stale(b);
    const nx = $("#bt-next"); if (nx) nx.disabled = !ok || !!b.busy; const e = $("#bt-err"); if (e) e.textContent = b.err || (b.step === 4 ? err || "" : "");
    const run_ = $("#bt-run"); if (run_) run_.disabled = !(b.dry && !sl && !b.busy && okPaths(b).length && !(b.trial && b.fin));
    const sn = $("#bt-stale"); if (sn) sn.hidden = !sl;
    const sd = $("#bt-side"); sd.innerHTML = wizSide(b);
  }
  function wizSide(b) {
    const g = GOALS.find(x => x.k === b.goal), d = b.dry && b.dry.results || [], n = k => d.filter(r => r.status === k).length;
    return `<h4>Ringkasan</h4><dl class="rp-sum"><dt>Tujuan</dt><dd>${g ? esc(g.t) : "belum dipilih"}</dd><dt>Layout</dt><dd>${b.paths.length} dipilih</dd><dt>Dicari</dt><dd>${b.goal ? esc(findTxt(b)) : "-"}</dd><dt>Diubah</dt><dd>${b.goal ? esc(changeTxt(b)) : "-"}</dd><dt>Pemeriksaan</dt><dd>${!b.dry ? "belum" : stale(b) ? "usang: isian berubah" : `Siap ${n("ok")} · Dilewati ${n("skip")} · Gagal ${n("error")}`}</dd></dl>`;
  }
  const stLabel = (s, done) => ({ ok: done ? "Selesai" : "Siap", skip: "Dilewati", error: "Gagal" }[s] || s);
  function resTable(rs, done, ops) {
    const cls = { ok: "rp-ok", skip: "rp-wn", error: "rp-er" }, vf = needsVerify(ops);
    const cell = x => `<span title="${esc(x || "")}">${esc(x ? (x.length > 60 ? x.slice(0, 57) + "…" : x) : "(kosong)")}</span>`;
    const chg = r => { const l = (r.matches || []).flatMap(m => typeof m === "string" ? [] : (m.changes || []).map(c => ({ ...c, kind: m.kind }))); return l.length ? `<tr class="rp-bch"><td colspan="4"><details><summary>Rincian sebelum dan sesudah (${l.length})</summary><ul>${l.map(c => `<li><b>${esc(c.name)}</b> <small>${esc(c.kind)}</small> · sebelum: ${cell(c.before)} · sesudah: ${cell(c.after)}</li>`).join("")}</ul></details></td></tr>` : ""; };
    return `<div class="rp-btw"><table class="rp-bt"><thead><tr><th>File</th><th>Status</th><th>Keterangan</th><th>${done ? "Hasil dan Verify" : "Verify Database"}</th></tr></thead><tbody>` +
      rs.map(r => `<tr><td title="${esc(r.path || "")}">${esc(r.name || bnm(r.path))}</td><td class="${cls[r.status] || ""}">${esc(stLabel(r.status, done))}</td><td>${esc(r.message || "")}</td><td>${r.status === "ok" ? `${done ? esc(r.savedName || bnm(r.saved)) + " · " : ""}${vf ? `<span class="rp-wn">Perlu Verify di Crystal</span>` : "Tidak perlu"}` : ""}</td></tr>${chg(r)}`).join("") + `</tbody></table></div>`;
  }
  function stepBody(b) {
    const c = b.ch, f = b.find, sel = (k, v, opts, re) => `<select data-b="${k}" ${re ? 'data-re="1"' : ""} aria-label="${esc(k)}">${opts.map(([val, t]) => `<option value="${esc(val)}" ${String(v) === val ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
    if (b.step === 1) return `<p class="rp-note">Satu perubahan dikerjakan sama ke banyak layout .rpt sekaligus. File asli tidak diubah: hasilnya disimpan sebagai salinan baru (_edit).</p><div role="radiogroup" aria-label="Apa yang mau dilakukan">${GOALS.map(g => { const dis = g.k === "sup" && st.agentOld; return `<label class="rp-goal ${b.goal === g.k ? "on" : ""}"><input type="radio" name="goal" data-b="goal" data-re="1" value="${g.k}" ${b.goal === g.k ? "checked" : ""} ${dis ? "disabled" : ""}><span><b>${esc(g.t)}</b><br><small>${esc(g.ex)}${dis ? " (butuh agen versi 0.7)" : ""}</small></span></label>`; }).join("")}</div>
      <div class="callout"><span><b>Soal Verify Database:</b> perubahan yang MENAMBAH kolom/field baru ke layout hanya bisa jalan bila kolom itu sudah terdaftar di tiap file (buka file di Crystal lalu Verify Database). Perubahan kosmetik (font, rata, warna, sembunyikan) tidak perlu Verify.</span></div>`;
    if (b.step === 2) return `<input class="rp-fs" id="bt-q" placeholder="Cari nama file…" value="${esc(b.q)}" aria-label="Cari file" style="width:100%;margin:0 0 6px"><label class="rp-bf"><input type="checkbox" id="bt-all"><b>Pilih semua (hasil pencarian)</b></label><div class="rp-files rp-blist" id="bt-list"></div><p class="rp-note" id="bt-count"></p><p class="rp-note">Daftar ini dari folder aktif (${esc(st.root || "belum ada folder")}). Ganti folder lewat tombol Pilih folder.</p>`;
    if (b.step === 3) { const pr = b.probe, ps = pr && pr.res && pr.res.results || [], found = ps.filter(r => r.status === "ok"), first = found[0], ch = first ? (first.matches || []).flatMap(m => typeof m === "string" ? [] : m.changes || []) : [];
      return `<label class="rp-col1">Bagian (section) <small>kosongkan = semua bagian</small><input data-b="find.sec" value="${esc(f.sec)}" placeholder="mis. Details atau Page Header" aria-label="Bagian"></label>
        <p class="rp-note" style="margin-top:0">Nama bagian dicocokkan persis lebih dulu; kalau tidak ada yang persis, dianggap awalan (mis. "Detail" cocok dengan "Details" dan "Detail Section1").</p>
        <label class="rp-col1">Jenis objek${sel("find.kind", f.kind, [["Text", "Teks"], ["Field", "Field (kolom data)"], ["Box", "Kotak"], ["Line", "Garis"], ["", "Semua jenis"]], true)}</label>
        <label class="rp-col1">${f.kind === "Field" ? "Nama kolom mengandung" : "Isi teks mengandung"}<input data-b="find.text" value="${esc(f.text)}" placeholder="${f.kind === "Field" ? "mis. VatSum" : "mis. Email"}" aria-label="Isi yang dicari"></label>
        <label class="rp-bck"><input type="checkbox" data-b="find.all" ${f.all ? "checked" : ""}> Ambil semua yang cocok. Bila dimatikan, layout yang punya lebih dari satu objek cocok dilewati.</label>
        <button class="edit-btn" type="button" data-a="bt-probe" ${b.busy || !b.paths.length || !stepOk(b) || st.agentOld ? "disabled" : ""}>Cek pencarian di ${b.paths.length} layout</button> <span class="rp-note">${st.agentOld ? "butuh agen versi 0.7" : "Membuka tiap file, bisa beberapa detik per file. Tidak mengubah apa pun."}</span>
        ${pr ? `<div class="callout" role="status"><span><b>Ditemukan di ${found.length} dari ${ps.length} layout</b> (pratinjau dari file pertama yang cocok${first ? ": " + esc(first.name) : ""}). Layout yang strukturnya berbeda memang bisa tidak cocok; itu wajar dan akan dilewati.${ch.length ? `<br>Objek cocok: ${ch.slice(0, 8).map(x => `<b>${esc(x.name)}</b> (${esc(String(x.before).slice(0, 30))})`).join(", ")}${ch.length > 8 ? " …" : ""}` : ""}${found.length < ps.length ? `<br>Tidak cocok: ${ps.filter(r => r.status !== "ok").slice(0, 6).map(r => esc(r.name)).join(", ")}${ps.length - found.length > 6 ? " …" : ""}` : ""}</span></div>` : ""}`; }
    if (b.step === 4) {
      const rows = (k, a, l1, l2, p1, p2) => `<div class="rp-pairs"><b>${l1}</b>${a.map((x, i) => `<div><input data-b="ch.${k}.${i}.from" value="${esc(x.from)}" placeholder="${p1}" aria-label="${esc(l1)} lama ${i + 1}"> → <input data-b="ch.${k}.${i}.to" value="${esc(x.to)}" placeholder="${p2}" aria-label="${esc(l1)} baru ${i + 1}"></div>`).join("")}<button class="edit-btn" type="button" data-a="bt-add-${k}">+ tambah baris</button></div>`;
      const pairs = rows("tr", c.tr, "Ganti tulisan (lama → baru)", "", "tulisan lama (mis. Email)", "tulisan baru (mis. Branch)") + rows("fr", c.fr, "Ganti kolom (lama → baru)", "", "kolom lama (mis. E_Mail)", "kolom baru (mis. BranchName)") + `<p class="rp-note">Tanda pemisah (tab, titik dua) dan format tetap. Kolom baru harus sudah terdaftar di layout (Verify Database dulu); layout yang belum punya kolom itu dilewati dengan keterangan.</p>`;
      if (b.goal === "clone") return `<div class="rp-brow" style="margin-left:0"><span>Salinan ditaruh</span>${sel("ch.place", c.place, [["below", "di bawah objek asal"], ["right", "di kanan objek asal"]], true)}<label>jarak <input type="number" min="0" max="100" step="0.5" data-b="ch.gap" value="${esc(c.gap)}" style="width:70px" aria-label="Jarak mm"> mm</label></div>${pairs}<p class="rp-note">Bila bagian (section) kurang tinggi untuk salinannya, layout itu akan gagal dengan keterangan: naikkan tinggi section di Crystal.</p>`;
      if (b.goal === "replace") return pairs;
      if (b.goal === "props") return `<p class="rp-note">Biarkan "tetap" bila tidak ingin mengubah.</p><div class="rp-brow" style="margin-left:0">${sel("ch.fn", c.fn, [["", "Font: tetap"], ...FONTS.map(x => [x, x])])}${sel("ch.fs", c.fs, [["", "Ukuran: tetap"], ...SIZES.map(x => [String(x), String(x)])])}${sel("ch.b", c.b, [["", "Tebal: tetap"], ["1", "Tebal"], ["0", "Tidak tebal"]])}${sel("ch.ha", c.ha, [["", "Rata: tetap"], ["l", "Kiri"], ["c", "Tengah"], ["r", "Kanan"]])}<label>Warna<input type="color" data-b="ch.fc" data-re="1" value="${tcol(c.fc)}"></label><button class="edit-btn" type="button" data-a="bt-nofc" title="Jangan ubah warna">${c.fc ? "warna " + esc(c.fc) + " ✕" : "warna tetap"}</button></div>`;
      return `<div role="radiogroup" aria-label="Kapan disembunyikan"><label class="rp-bck"><input type="radio" name="supm" data-b="ch.supm" data-re="1" value="always" ${c.supm === "always" ? "checked" : ""}> Sembunyikan selalu</label><label class="rp-bck"><input type="radio" name="supm" data-b="ch.supm" data-re="1" value="if" ${c.supm === "if" ? "checked" : ""}> Sembunyikan jika…</label></div>` +
        (c.supm === "if" ? c.conds.map((x, i) => `<div class="rp-cr"><input data-b="ch.conds.${i}.field" value="${esc(x.field)}" placeholder="{Command.Kolom}" aria-label="Kolom syarat ${i + 1}">${sel(`ch.conds.${i}.op`, x.op, SUP_OPS, true)}${NOVAL(x.op) ? "" : `<input data-b="ch.conds.${i}.value" value="${esc(x.value)}" placeholder="nilai" aria-label="Nilai ${i + 1}">`}<button class="edit-btn" type="button" data-a="bt-del-cond" data-i="${i}" aria-label="Hapus syarat ${i + 1}" ${c.conds.length < 2 ? "disabled" : ""}>×</button></div>`).join("") + (c.conds.length > 1 ? `<label class="rp-col1">Gabungkan syarat${sel("ch.join", c.join, [["and", "Semua syarat terpenuhi (AND)"], ["or", "Salah satu terpenuhi (OR)"]], true)}</label>` : "") + `<button class="edit-btn" type="button" data-a="bt-add-cond" ${c.conds.length >= 8 ? "disabled" : ""}>+ syarat</button><p class="rp-note">Kolom ditulis seperti di Crystal, mis. {Command.Diskon}. Layout yang tidak punya kolom itu dilewati. Objek tersembunyi tetap dihitung di total; lihat hasilnya di Preview.</p>` : "");
    }
    // langkah 5
    const sl = stale(b), d = b.dry, ds = d && d.results || [], nk = okPaths(b).length, ops = batchOps(b).ops;
    let h = b.busy ? `<p class="rp-note" role="status">${esc(b.busy)}</p>` : "";
    if (b.fin) { const rs = b.fin.results, sv = rs.filter(r => r.saved);
      return h + `<h4>Hasil</h4><p><b class="rp-ok">${b.fin.ok} selesai</b> · <b class="rp-wn">${b.fin.skip} dilewati</b> · <b class="rp-er">${b.fin.error} gagal</b></p>${resTable(rs, true, ops)}<p class="rp-note">Salinan dibuat dengan nama baru di folder yang sama; file asli tidak diubah.${needsVerify(ops) ? " Untuk perubahan yang menambah kolom, buka tiap salinan di Crystal lalu Verify Database." : ""}</p><div class="rp-brow" style="margin-left:0"><button class="edit-btn" type="button" data-a="bt-reveal" ${sv.length ? "" : "disabled"}>Buka folder hasil</button><button class="edit-btn" type="button" data-a="bt-log">Unduh log perubahan (CSV)</button><button class="edit-btn" type="button" data-a="bt-new">Mulai perubahan baru</button></div>`; }
    if (d) h += `<p id="bt-stale" class="rp-wn" ${sl ? "" : "hidden"}>Isian berubah setelah pemeriksaan: pemeriksaan ulang diperlukan (kembali ke langkah 5).</p><p><b class="rp-ok">${ds.filter(r => r.status === "ok").length} siap</b> · <b class="rp-wn">${ds.filter(r => r.status === "skip").length} dilewati</b> · <b class="rp-er">${ds.filter(r => r.status === "error").length} gagal</b></p>${resTable(ds, false, ops)}`;
    if (b.trial) h += `<div class="callout" role="status"><span><b>Percobaan selesai:</b> ${esc(b.trial.savedName || bnm(b.trial.saved))}. Periksa hasilnya di editor, lalu terapkan ke sisa file bila sudah sesuai.</span></div><div class="rp-brow" style="margin-left:0"><button class="edit-btn" type="button" data-a="bt-reveal">Buka folder hasil</button><button class="edit-btn" type="button" data-a="bt-edit">Buka di editor</button>${nk > 1 ? `<button class="edit-btn rp-primary" type="button" data-a="bt-rest" ${sl || b.busy ? "disabled" : ""}>Terapkan ke sisa ${nk - 1} file</button>` : `<button class="edit-btn" type="button" data-a="bt-done1">Selesai (hanya 1 file)</button>`}</div>`;
    else if (d && nk) h += `<div class="rp-brow" style="margin-left:0"><button class="edit-btn" type="button" data-a="bt-trial" ${sl || b.busy ? "disabled" : ""}>Coba di 1 file dulu</button><span class="rp-note">Menyimpan satu salinan (${esc(bnm(okPaths(b)[0]))}) supaya bisa dilihat di editor sebelum yang lain.</span></div>`;
    return h || `<p class="rp-note">Memeriksa…</p>`;
  }
  function renderBatch(focus) {
    const b = st.batch, el = $("#rp-modal"), last = b.step === 5;
    el.innerHTML = `<div class="rp-ov"><div class="rp-dlg rp-dlg-wide rp-wiz" role="dialog" aria-modal="true" aria-labelledby="bt-h" ${b.busy ? 'aria-busy="true"' : ""}>
      <h3 id="bt-h">Ubah banyak layout sekaligus</h3>
      <ol class="rp-steps" aria-label="Langkah">${STEPS.map((t, i) => `<li ${i + 1 === b.step ? 'aria-current="step"' : ""} class="${i + 1 < b.step ? "done" : ""}"><span>${i + 1}</span> ${esc(t)}</li>`).join("")}</ol>
      <div class="rp-wgrid"><div class="rp-wmain"><h4 id="bt-sh" tabindex="-1">Langkah ${b.step} dari 5: ${esc(["Apa yang mau dilakukan?", "Layout mana?", "Objek yang dicari", "Perubahan", "Periksa dan simpan"][b.step - 1])}</h4>${stepBody(b)}</div><aside class="rp-wside" id="bt-side" aria-label="Ringkasan"></aside></div>
      <p class="rp-er" id="bt-err" role="alert"></p>
      <div class="row"><button class="edit-btn" data-a="bt-close" type="button">Tutup</button><button class="edit-btn" data-a="bt-back" type="button" ${b.step === 1 || b.busy ? "disabled" : ""}>Kembali</button>${last ? (b.fin ? "" : `<button class="edit-btn rp-primary" id="bt-run" data-a="bt-run" type="button">${b.trial ? "Simpan semua sisanya" : "Simpan " + okPaths(b).length + " salinan"}</button>`) : `<button class="edit-btn rp-primary" id="bt-next" data-a="bt-next" type="button">Lanjut</button>`}</div></div></div>`;
    if (b.step === 2) renderBatchList(); renderBatchBtns();
    if (focus === "step") $("#bt-sh")?.focus(); else if (focus) { const n = $(`[data-b="${focus}"]`); if (n) n.focus(); }
  }
  async function batchGo(mode) { // "dry" (periksa semua), "trial" (simpan 1 file), "all" (simpan semua yang siap, kecuali yang sudah dicoba)
    const b = st.batch, r = batchOps(b); if (r.error) { b.err = r.error; return renderBatchBtns(); }
    const sig = batchSig(b); let paths = mode === "dry" ? [...b.paths] : okPaths(b);
    if (mode === "trial") paths = paths.slice(0, 1); if (mode === "all" && b.trial) paths = paths.filter(p => p !== b.trial.path);
    if (!paths.length) return; if (mode !== "dry" && b.sig !== sig) { b.err = "Isian berubah: periksa ulang dulu."; return renderBatch(); }
    b.err = ""; b.busy = mode === "dry" ? `Memeriksa ${paths.length} file…` : `Menyimpan ${paths.length} file… (bisa lama)`; renderBatch();
    try {
      const x = await ag("/rpt/batch", { paths, ops: r.ops, dry: mode === "dry" });
      if (mode === "dry") { b.dry = x; b.sig = sig; b.trial = null; b.fin = null; }
      else if (mode === "trial") { const y = (x.results || [])[0]; if (y && y.status === "ok" && y.saved) b.trial = y; else b.err = "Percobaan gagal: " + ((y && y.message) || "tanpa keterangan"); }
      else { const rs = [...(b.trial ? [b.trial] : []), ...(x.results || [])]; b.fin = { results: rs, ok: rs.filter(z => z.status === "ok").length, skip: rs.filter(z => z.status === "skip").length, error: rs.filter(z => z.status === "error").length }; }
    } catch (e) { b.err = "Batch gagal: " + e.message; }
    b.busy = ""; renderBatch(); const f = $(mode === "dry" ? "[data-a=bt-trial]" : "[data-a=bt-reveal]"); if (f && !f.disabled) f.focus();
  }
  function batchStep(n) { const b = st.batch; b.step = n; b.err = ""; renderBatch("step"); if (n === 5 && (!b.dry || stale(b)) && !b.busy) batchGo("dry"); }
  function batchChange(t) {
    const b = st.batch;
    if (t.matches("#bt-all")) { const fl = batchFiles(b).map(f => f.path); b.paths = t.checked ? [...new Set([...b.paths, ...fl])] : b.paths.filter(x => !fl.includes(x)); renderBatchList(); return renderBatchBtns(); }
    if (t.matches("[data-bf]")) { const p = t.dataset.bf; b.paths = t.checked ? [...b.paths, p] : b.paths.filter(x => x !== p); renderBatchList(); return renderBatchBtns(); }
    if (t.matches("[data-b]")) { const k = t.dataset.b; setP(b, k, t.type === "checkbox" ? t.checked : t.value); b.err = ""; if (t.dataset.re) renderBatch(k); else renderBatchBtns(); }
  }
  const dlText = (name, text) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  function batchAction(a, t) { // true = ditangani
    const b = st.batch; if (!b) return false;
    if (a === "bt-close") { st.batchSaved = b.trial && !b.fin ? b : null; st.batch = null; renderModal(); $("#batch")?.focus(); return true; }
    if (a === "bt-next") { if (stepOk(b)) batchStep(b.step + 1); return true; }
    if (a === "bt-back") { if (b.step > 1) batchStep(b.step - 1); return true; }
    if (a === "bt-run") { batchGo(b.trial ? "all" : (okPaths(b).length ? "all" : "dry")); return true; }
    if (a === "bt-trial") { batchGo("trial"); return true; }
    if (a === "bt-rest") { batchGo("all"); return true; }
    if (a === "bt-done1") { const rs = [b.trial]; b.fin = { results: rs, ok: 1, skip: 0, error: 0 }; renderBatch("step"); return true; }
    if (a === "bt-new") { st.batch = newBatch(); renderBatch("step"); return true; }
    if (a === "bt-nofc") { b.ch.fc = ""; renderBatch(); return true; }
    if (a === "bt-add-tr") { b.ch.tr.push({ from: "", to: "" }); renderBatch(); return true; }
    if (a === "bt-add-fr") { b.ch.fr.push({ from: "", to: "" }); renderBatch(); return true; }
    if (a === "bt-add-cond") { if (b.ch.conds.length < 8) b.ch.conds.push({ field: "", op: "zero", value: "" }); renderBatch(); return true; }
    if (a === "bt-del-cond") { if (b.ch.conds.length > 1) b.ch.conds.splice(Number(t.dataset.i), 1); renderBatch(); return true; }
    if (a === "bt-probe") { (async () => { const find = findOf(b); b.busy = "Mencari di " + b.paths.length + " layout…"; renderBatch(); try { b.probe = { res: await ag("/rpt/batch", { paths: [...b.paths], ops: [{ op: "find", find }], dry: true }) }; } catch (e) { b.err = "Pencarian gagal: " + e.message; } b.busy = ""; renderBatch(); })(); return true; }
    if (a === "bt-reveal") { const p = (b.fin ? b.fin.results.find(r => r.saved) : b.trial) || {}; if (p.saved) ag("/fs/reveal", { saved: p.saved }).catch(e => { b.err = "Folder tidak bisa dibuka: " + e.message; renderBatch(); }); return true; }
    if (a === "bt-edit") { const p = b.trial; if (!p || !p.saved) return true; st.batchSaved = b; st.batch = null; renderModal(); run(() => open(p.saved, bnm(p.saved))); return true; }
    if (a === "bt-log") { const o = batchOps(b).ops; dlText("log-perubahan-rpt.csv", batchCsv(b.fin ? b.fin.results : (b.dry && b.dry.results) || [], o)); return true; }
    return false;
  }

  // ---------- aksi ----------
  const nm = () => doc().sel;
  async function fmt(patch) { const d = doc(); await ops(selObjs(d).map(o => ({ op: "setProps", name: o.name, ...patch(o) }))); }
  function addAt(d, op, extra = {}) { return ops([{ op, section: defSection(d), l: 200, t: 200, ...extra }]); }
  function action(a, ev, el) {
    if (a.startsWith("bt-")) return batchAction(a, el);
    const d = doc(); if (!d && a !== "verify") return;
    if (a === "undo") run(() => history("undo")); if (a === "redo") run(() => history("redo"));
    if (a === "copy") run(() => ops([{ op: "copy", names: nm().slice() }]));
    if (a === "paste") run(() => ops([{ op: "paste" }])); // agen menempel di section asal, geser 200 twips dari posisi asal (section/posisi bisa diisi eksplisit)
    if (a === "clone") run(() => ops(nm().map(n => ({ op: "clone", name: n }))));
    if (a === "del") { if (nm().length && confirm(`Hapus ${nm().length > 1 ? nm().length + " objek" : "objek " + nm()[0]}?`)) run(() => ops(nm().map(n => ({ op: "delete", name: n }))).then(() => { d.sel = []; })); }
    if (a === "select" || a === "text" || a === "box" || a === "line" || a === "field") return armTool(a, !!(ev && ev.shiftKey)); // jalur addAt lama tetap ada sebagai fallback (placeFallback)
    if (a === "togsup") { st.showSup = !st.showSup; renderTools(); return renderCanvas(); }
    if (a === "sup-apply") return supApply(); if (a === "sup-chk") return supCheck();
    if (a === "sup-rawon") { const o = selObjs(d)[0]; if (st.sup) { st.sup.rawOn = true; if (!st.sup.raw && o && o.supf) st.sup.raw = o.supf; st.sup.chk = null; } return renderSide(); }
    if (a === "sup-rawoff") { if (st.sup) st.sup.rawOn = false; return renderSide(); }
    if (a === "save") run(async () => { const x = await ag("/rpt/saveAs", { docId: d.docId, outPath: d.outPath || null }); d.outPath = x.saved; d.dirty = false; st.msg = "Tersimpan sebagai " + (x.name || x.saved) + (x.overwrote ? " (menimpa hasil simpan sebelumnya dari dokumen ini)" : " (nama unik; file lain tidak ditimpa)"); });
    if (a === "verify") { if (!d) return; disarm(); st.verify = { server: lsGet("rpt.vserver"), user: lsGet("rpt.vuser"), params: JSON.parse(lsGet("rpt.vparams") || "{}"), result: null, busy: false }; if (!d.fields) loadFields(d).then(renderModal); renderModal(); }
    if (a === "preview") { if (!d || !token) return; disarm(); st.prev = { server: lsGet("rpt.vserver"), user: lsGet("rpt.vuser"), params: JSON.parse(lsGet("rpt.vparams") || "{}"), error: "", busy: false, url: "", pages: "", ctrl: null }; if (!d.fields) loadFields(d).then(() => st.prev && !st.prev.busy && !st.prev.url && renderModal()); renderModal(); }
    if (a === "pcancel" || a === "pclose") prevClose();
    if (a === "pabort") { if (st.prev && st.prev.ctrl) st.prev.ctrl.abort(); }
    if (a === "prun") prevRun();
    if (a === "popen") { if (st.prev && st.prev.url) window.open(st.prev.url, "_blank", "noopener"); }
    if (a === "vcancel") { st.verify = null; renderModal(); }
    if (a === "vrun") verifyRun();
  }
  async function verifyRun() {
    const v = st.verify, d = doc(), pass = $("#v-pass").value; if ((d.canUndo || d.canRedo) && !confirm("Undo akan direset setelah Verify; lanjutkan?")) return; v.server = $("#v-server").value.trim(); v.user = $("#v-user").value.trim();
    v.params = {}; art.querySelectorAll("[data-vp]").forEach(i => v.params[i.dataset.vp] = i.value);
    lsSet("rpt.vserver", v.server); lsSet("rpt.vuser", v.user); lsSet("rpt.vparams", JSON.stringify(v.params));
    v.busy = true; v.result = null; renderModal();
    try {
      const r = await ag("/rpt/verify", { docId: d.docId, server: v.server, user: v.user, password: pass, params: v.params });
      v.result = r; const g = await ag("/rpt/get", { docId: d.docId }); applyDump(d, g); if (r.ok) { d.verified = new Date().toTimeString().slice(0, 5); d.fields = null; d.dirty = true; } renderBar(); renderCanvas(); // agen mengosongkan riwayat undo setelah Verify (berhasil atau gagal)
    } catch (e) { v.result = { ok: false, message: e.message }; }
    v.busy = false; renderModal(); if ($("#v-pass")) $("#v-pass").value = "";
  }
  function select(names) { const d = doc(); d.sel = names; renderBar(); renderTools(); renderFmt(); if (st.leftTab === "struct") renderLeft(); renderOverlay(); renderSide(); renderStatus(); }

  // ---------- pointer: pilih / pindah / ubah ukuran / kotak seleksi ----------
  function edges(d, skip) {
    const map = secMap(d), xs = [0, d.pageW], ys = d.sections.map(s => s.top); d.sections.forEach(s => ys.push(s.top + s.h));
    d.objects.forEach(o => { if (skip.includes(o.name)) return; const g = geom(d, o, map); xs.push(g.x, g.x + g.w); ys.push(g.y, g.y + g.h); }); return { xs, ys };
  }
  // kotak seleksi/Ctrl+A tidak punya urutan klik: urutkan kiri-atas dulu (objek pertama = acuan align)
  const byPos = (d, map, names) => names.map(n => d.objects.find(o => o.name === n)).filter(Boolean).map(o => [o.name, geom(d, o, map)]).sort((a, b) => a[1].x - b[1].x || a[1].y - b[1].y).map(a => a[0]);
  function pointerDown(e) {
    const svg = e.target.closest(".rp-paper"); if (!svg || e.button !== 0) return; const d = doc(), s = scale(d), map = secMap(d);
    const pt = ev => { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
    const p0 = pt(e), hd = e.target.closest("[data-h]"), g = e.target.closest(".ob"), multi = e.shiftKey || e.ctrlKey || e.metaKey, thr = 6 / s;
    const finish = (mv, up) => { window.addEventListener("pointermove", mv); const u = ev => { window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", u); window.removeEventListener("pointercancel", u); if (ev.type === "pointercancel") return renderCanvas(); up(ev); }; window.addEventListener("pointerup", u); window.addEventListener("pointercancel", u); }; // pointercancel = batalkan (tanpa op), gambar ulang kanvas
    e.preventDefault(); st.ptype = e.pointerType || st.ptype;
    if (st.tool) return toolDown(e, svg, pt); // cabang alat: hanya hidup saat st.tool, perilaku lama tanpa alat tidak berubah
    if (hd) { // ubah ukuran
      const o = selObjs(d)[0], q = geom(d, o, map), k = hd.dataset.h, E = edges(d, [o.name]); let nb = { ...q };
      const ghost = document.createElementNS("http://www.w3.org/2000/svg", "rect"); ghost.setAttribute("class", "ghost"); $("#ovl").appendChild(ghost);
      const calc = ev => {
        const p = pt(ev); let { x, y, w, h } = q, dx = p.x - p0.x, dy = p.y - p0.y;
        const sx = v => ev.altKey ? Math.round(v) : (E.xs.find(c => Math.abs(c - v) < thr) ?? Math.round(v / GRID) * GRID), sy = v => ev.altKey ? Math.round(v) : (E.ys.find(c => Math.abs(c - v) < thr) ?? Math.round(v / GRID) * GRID);
        if (k.includes("e")) w = Math.max(0, sx(q.x + q.w + dx) - q.x); if (k.includes("s")) h = Math.max(0, sy(q.y + q.h + dy) - q.y);
        if (k.includes("w")) { const nx = Math.min(sx(q.x + dx), q.x + q.w); w = q.x + q.w - nx; x = nx; } if (k.includes("n")) { const ny = Math.min(sy(q.y + dy), q.y + q.h); h = q.y + q.h - ny; y = ny; }
        // ukuran minimum 0,3 cm untuk sisi yang aslinya > 0 (kotak/teks tidak boleh menyusut jadi garis berlebar 0); garis (sisi 0) tetap boleh
        const MIN = 170; if (q.w > 0 && w < MIN) { if (k.includes("w")) x = q.x + q.w - MIN; w = MIN; } if (q.h > 0 && h < MIN) { if (k.includes("n")) y = q.y + q.h - MIN; h = MIN; }
        nb = { x, y, w, h }; ghost.setAttribute("x", x); ghost.setAttribute("y", y); ghost.setAttribute("width", Math.max(w, 10)); ghost.setAttribute("height", Math.max(h, 10));
      };
      finish(calc, () => { ghost.remove(); if (nb.x === q.x && nb.y === q.y && nb.w === q.w && nb.h === q.h) return; const sec = map[o.section];
        run(() => ops([{ op: "set", name: o.name, l: Math.max(0, Math.round(nb.x)), t: Math.max(0, Math.round(nb.y - sec.top)), w: Math.round(nb.w), h: Math.round(nb.h) }])); });
      return;
    }
    if (g) { // pilih / pindah
      const n = g.dataset.n;
      const was = d.sel.includes(n);
      if (multi && !was) select([...d.sel, n]); else if (!multi && !was) select([n]);
      const sel = selObjs(d), boxes = sel.map(o => geom(d, o, map)), gx = Math.min(...boxes.map(b => b.x)), gy = Math.min(...boxes.map(b => b.y));
      const b0 = { x: gx, y: gy, w: Math.max(...boxes.map(b => b.x + b.w)) - gx, h: Math.max(...boxes.map(b => b.y + b.h)) - gy };
      const E = edges(d, d.sel); let ddx = 0, ddy = 0, moved = false;
      const mv = ev => {
        const p = pt(ev); let dx = p.x - p0.x, dy = p.y - p0.y; if (!moved && Math.abs(dx) + Math.abs(dy) < 30) return; moved = true;
        ddx = snapAxis(b0.x, b0.w, dx, E.xs, thr, ev.altKey); ddy = snapAxis(b0.y, b0.h, dy, E.ys, thr, ev.altKey);
        ddx = Math.max(ddx, -Math.min(...sel.map(o => o.l))); ddy = Math.max(ddy, -Math.min(...sel.map(o => o.t)));
        // jangan melewati bawah section pemilik: Crystal diam-diam MELEBARKAN section (menggeser section di bawahnya dan mengubah tinggi Box/Line lintas-section)
        sel.forEach(o => { const sc = map[o.section]; if (sc.h > 0) ddy = Math.min(ddy, sc.h - o.t - (o.kind === "Box" || o.kind === "Line" ? 0 : o.h)); });
        d.sel.forEach(nn => svg.querySelector(`.ob[data-n="${CSS.escape(nn)}"]`)?.setAttribute("transform", `translate(${ddx} ${ddy})`)); $("#ovl").setAttribute("transform", `translate(${ddx} ${ddy})`);
      };
      finish(mv, () => {
        if (!moved || (!ddx && !ddy)) { if (multi && was) select(d.sel.filter(x => x !== n)); else if (!multi && was && d.sel.length > 1) select([n]); return; } // klik tanpa geser pada objek terpilih + Shift/Ctrl = lepas dari pilihan
        run(() => ops(sel.map(o => ({ op: "set", name: o.name, l: Math.max(0, Math.round(o.l + ddx)), t: Math.max(0, Math.round(o.t + ddy)) }))));
      });
      return;
    }
    // kotak seleksi (area kosong)
    const band = document.createElementNS("http://www.w3.org/2000/svg", "rect"); band.setAttribute("class", "band"); svg.appendChild(band); let moved = false, r = null;
    const mv = ev => { const p = pt(ev); r = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) }; if (r.w + r.h > 60) moved = true; band.setAttribute("x", r.x); band.setAttribute("y", r.y); band.setAttribute("width", r.w); band.setAttribute("height", r.h); };
    finish(mv, () => {
      band.remove(); if (!moved) { if (d.sel.length && !multi) select([]); return; }
      const hit = d.objects.filter(o => { const q = geom(d, o, map); return q.x <= r.x + r.w && q.x + q.w >= r.x && q.y <= r.y + r.h && q.y + q.h >= r.y; }).map(o => o.name);
      select(multi ? [...new Set([...d.sel, ...hit])] : byPos(d, map, hit));
    });
  }

  // ---------- event (delegasi, dipasang sekali) ----------
  art.addEventListener("pointerdown", pointerDown);
  art.addEventListener("pointermove", e => { // hantu alat mengikuti kursor (hanya memperbarui #tg, tanpa renderCanvas)
    st.ptype = e.pointerType || st.ptype; const t = st.tool; if (!t || t.pl || e.pointerType === "touch") return;
    const svg = e.target.closest?.(".rp-paper"), d = doc();
    if (!svg || !d) { if (st.gp) { st.gp = null; updGhost(); } return; }
    st.gp = ptOf(svg, e); st.cx = e.clientX; st.cy = e.clientY; st.alt = e.altKey; updGhost();
  });
  art.addEventListener("pointerleave", () => { if (st.tool && !st.tool.pl && st.gp) { st.gp = null; updGhost(); } });
  art.addEventListener("focusin", e => { const b = e.target.closest?.("#rp-tools button"); if (b) { st.rov = b.dataset.rv; art.querySelectorAll("#rp-tools button").forEach(x => { x.tabIndex = x === b ? 0 : -1; }); } });
  art.addEventListener("keydown", e => { // roving tabindex di strip Alat
    const tb = e.target.closest?.("#rp-tools"); if (!tb || !e.target.matches("button") || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const bs = [...tb.querySelectorAll("button:not(:disabled)")], i = bs.indexOf(e.target); if (!bs.length) return; e.preventDefault();
    bs[e.key === "Home" ? 0 : e.key === "End" ? bs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + bs.length) % bs.length].focus();
  });
  art.addEventListener("mousemove", e => { const svg = e.target.closest?.(".rp-paper"), d = doc(); if (!svg || !d) return; const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); const el = $("#rp-status"); el.textContent = `${el.dataset.base} · kursor ${cm(q.x)}, ${cm(q.y)} cm · ${Math.round(d.zoom * 100)}%`; });
  art.addEventListener("click", e => {
    const t = e.target, c = s => t.closest(s);
    if (st.aiPop && !c("[data-ai]") && !c(".rp-pop")) { st.aiPop = false; renderTools(); }
    if (c("[data-ai]")) { st.aiPop = !st.aiPop; return renderTools(); }
    { const fr = c(".rp-fld"); if (fr && st.tool && st.tool.k === "field") return pickToolField(fr); }
    if (c("#retry")) return connect(); if (c("#launch")) return launchAgent();
    if (c("#pickfront")) return ag("/fs/pick/front", {}).then(x => { st.msg = x.open ? "" : "Tidak ada dialog yang terbuka."; renderMsg(); }).catch(e => { st.err = e.message; renderMsg(); });
    if (c("#pick")) { if (st.picking) return; st.picking = true; st.err = ""; st.msg = ""; renderBar(); return (async () => { try { const x = await ag("/fs/pick", {}); if (x.busy) st.msg = "Dialog folder masih terbuka di PC Anda."; else if (x.cancelled) st.msg = "Pemilihan folder dibatalkan."; else { st.root = x.root; if (st.root) await list(); await loadRecent(); } } catch (e) { st.err = e.message; } st.picking = false; draw(); })(); }
    if (c("#batch")) { disarm(); st.batch = st.batchSaved || newBatch(); st.batchSaved = null; renderModal(); return ($("#bt-sh") || $("#bt-q"))?.focus(); }
    if (c("#lt")) { st.leftOpen = !st.leftOpen; const d = doc(); if (d) d.zoom = fit(d); return draw(); }
    let b;
    if ((b = c("[data-sec]"))) { const d = doc(), sc = d && d.sections.find(x => x.name === b.dataset.sec); if (sc) return secSup(sc.name, { sup: sc.sup === "no" ? "always" : "no" }); }
    if ((b = c("[data-sadd]"))) { if (st.sup && st.sup.conds.length < 8) st.sup.conds.push({ field: "", op: "zero", value: "" }); return renderSide(); }
    if ((b = c("[data-sdel]"))) { if (st.sup && st.sup.conds.length > 1) st.sup.conds.splice(Number(b.dataset.sdel), 1); return renderSide(); }
    if ((b = c("[data-lt]"))) { st.leftTab = b.dataset.lt; return renderLeft(); }
    if ((b = c("[data-x]")) && (st.tool = st.gp = null, true)) return run(async () => { const id = b.dataset.x; await ag("/rpt/close", { docId: id }); st.docs = st.docs.filter(x => x.docId !== id); if (st.cur === id) st.cur = st.docs[0]?.docId || null; });
    if ((b = c("[data-t]"))) { st.tool = st.gp = null; st.cur = b.dataset.t; return draw(); }
    if ((b = c("[data-rc]"))) return run(async () => { const x = await ag("/fs/root", { path: b.dataset.rc }); st.root = x.root; await list(); await loadRecent(); });
    if ((b = c("[data-f]"))) return run(() => open(b.dataset.f, b.dataset.nm));
    if ((b = c("[data-s]"))) { const d = doc(), n = b.dataset.s; return select(e.shiftKey || e.ctrlKey ? (d.sel.includes(n) ? d.sel.filter(x => x !== n) : [...d.sel, n]) : [n]); }
    if ((b = c("[data-z]"))) { const d = doc(), z = b.dataset.z; d.zoom = z === "fit" ? fit(d) : Math.min(3, Math.max(.25, d.zoom * (z === "+" ? 1.25 : .8))); renderBar(); renderTools(); return renderCanvas(); }
    if ((b = c("[data-al]"))) return alignGo(b.dataset.al);
    if ((b = c("[data-a]"))) return action(b.dataset.a, e, b);
    if ((b = c("button[data-fmt]"))) return fmtClick(b.dataset.fmt);
  });
  art.addEventListener("dblclick", e => {
    const tb = e.target.closest?.("#rp-tools [data-a]"); if (tb && st.tool && st.tool.k === tb.dataset.a) { st.tool.stay = true; toolUi(); live("Alat tetap aktif sampai Esc."); return; } // klik ganda pada alat = tetap aktif
    const f = e.target.closest(".rp-fld"), d = doc(); if (f && d && !st.tool) run(() => addAt(d, "addField", { w: 1800, h: 300, source: f.dataset.src, type: Number(f.dataset.type), ...(f.dataset.sp ? { special: true } : {}) })); });
  // ---------- align / samakan ukuran / sebar (acuan = objek pertama di d.sel); hitung di koordinat kertas, kirim satu batch 'set' ----------
  function alignGo(k) {
    const d = doc(); if (!d) return; const so = selObjs(d); if (so.length < 2 || (k.startsWith("d") && so.length < 3)) return;
    const map = secMap(d), g = so.map(o => ({ o, ...geom(d, o, map), sc: map[o.section] })), ref = g[0], skip = [];
    const lineLike = o => o.kind === "Line" || o.kind === "Box";
    const tgt = new Map(g.map(a => [a.o.name, { x: a.x, y: a.y, w: a.w, h: a.h }]));
    const sizeOp = k === "sw" || k === "sh" || k === "sb";
    if (k === "sw" || k === "sb") { if (ref.w === 0) { st.msg = "Lebar acuan 0: tidak ada yang diubah."; return draw(); } g.slice(1).forEach(a => { if (a.w > 0 || a.o.kind !== "Line") tgt.get(a.o.name).w = ref.w; }); }
    if (k === "sh" || k === "sb") { if (ref.h === 0) { st.msg = "Tinggi acuan 0: tidak ada yang diubah."; return draw(); } g.slice(1).forEach(a => { if (a.h > 0 || a.o.kind !== "Line") tgt.get(a.o.name).h = ref.h; }); }
    if (k === "l") g.slice(1).forEach(a => tgt.get(a.o.name).x = ref.x);
    if (k === "r") g.slice(1).forEach(a => tgt.get(a.o.name).x = ref.x + ref.w - a.w);
    if (k === "ch") g.slice(1).forEach(a => tgt.get(a.o.name).x = ref.x + ref.w / 2 - a.w / 2);
    if (k === "t") g.slice(1).forEach(a => tgt.get(a.o.name).y = ref.y);
    if (k === "b") g.slice(1).forEach(a => tgt.get(a.o.name).y = ref.y + ref.h - a.h);
    if (k === "cv") g.slice(1).forEach(a => tgt.get(a.o.name).y = ref.y + ref.h / 2 - a.h / 2);
    if (k === "dh" || k === "dv") { // spasi sama; dua objek di ujung tetap di tempat
      const hz = k === "dh", P = hz ? "x" : "y", S = hz ? "w" : "h", ord = [...g].sort((a, b) => a[P] - b[P]);
      const lo = ord[0][P], hi = Math.max(...ord.map(a => a[P] + a[S])), gap = (hi - lo - ord.reduce((t, a) => t + a[S], 0)) / (ord.length - 1);
      if (gap < 0) { st.msg = "Objek saling tumpang tindih: tidak bisa disebar dengan spasi sama."; return draw(); }
      let cur = lo; ord.forEach(a => { tgt.get(a.o.name)[P] = cur; cur += a[S] + gap; });
    }
    const vertical = ["t", "b", "cv", "dv", "sh", "sb"].includes(k), lst = [];
    g.forEach(a => {
      const t = tgt.get(a.o.name), x = Math.max(0, Math.round(t.x)), w = Math.round(t.w), h = Math.round(t.h), y = Math.round(t.y), tr = y - a.sc.top;
      if (vertical && (tr < 0 || (a.sc.h > 0 && (lineLike(a.o) ? tr > a.sc.h : y + h > a.sc.top + a.sc.h)))) { skip.push(a.o.name); return; }
      const op = { op: "set", name: a.o.name, l: x, t: Math.max(0, tr) };
      if (k === "sw" || k === "sb") op.w = w; if (k === "sh" || k === "sb") op.h = h;
      const same = x === Math.round(a.x) && Math.max(0, tr) === Math.round(a.y - a.sc.top) && (op.w === undefined || op.w === a.w) && (op.h === undefined || op.h === a.h);
      if (!same) lst.push(op);
    });
    const note = skip.length ? ` · dilewati (hasil keluar dari section): ${skip.join(", ")}` : "";
    if (!lst.length) { st.msg = "Tidak ada yang berubah" + note; return draw(); }
    run(async () => { await ops(lst); st.msg = `Align ${k}: ${lst.length} objek, acuan ${ref.o.name}` + note; });
  }
  function fmtClick(k) {
    const d = doc(), p = selObjs(d)[0]; if (!p) return; const f = Object.assign({}, DEF_FONT, p.font || {});
    if (k === "b" || k === "i" || k === "u") return run(() => fmt(o => ({ font: Object.assign({}, DEF_FONT, o.font || {}, { [k]: !f[k] }) })));
    if (k.startsWith("ha-")) return run(() => fmt(() => ({ ha: k.slice(3) })));
    if (k === "nofill") return run(() => fmt(o => o.kind === "Box" ? { fill: null } : { bg: null }));
    if (k === "bd-all") return run(() => fmt(() => ({ bd: { l: true, r: true, t: true, b: true } })));
    if (k === "bd-none") return run(() => fmt(() => ({ bd: { l: false, r: false, t: false, b: false } })));
    if (k === "bd-t" || k === "bd-b") { const s = k.slice(3); return run(() => fmt(o => ({ bd: Object.assign({ l: false, r: false, t: false, b: false }, o.bd || {}, { [s]: !(o.bd || {})[s] }) }))); }
  }
  art.addEventListener("change", e => {
    const t = e.target; if (st.batch && t.closest("#rp-modal")) return batchChange(t);
    const d = doc(); if (!d) return;
    if (t.matches("[data-sm]") && st.sup) { st.sup.mode = t.dataset.sm; st.sup.err = ""; return renderSide(); }
    if (t.matches("[data-sc]") && st.sup) { const [i, k] = t.dataset.sc.split(":"); st.sup.conds[Number(i)][k] = t.value; st.sup.err = ""; return k === "op" ? renderSide() : renderSupSum(); }
    if (t.matches("[data-sj]") && st.sup) { st.sup.join = t.value; return renderSide(); }
    if (t.matches("[data-sow]") && st.sup) { st.sup.ow = t.checked; return; }
    if (t.matches("[data-sraw]") && st.sup) { st.sup.raw = t.value; return; }
    if (t.matches("[data-sb]")) return secSup(t.dataset.sb, { supBlank: t.checked });
    if (t.matches("[data-k]")) { const n = d.sel[0], k = t.dataset.k; return run(() => k === "text" ? ops([{ op: "setText", name: n, text: t.value }]) : ops([{ op: "set", name: n, [k]: Number(t.value) }])); }
    if (t.matches("[data-sh]")) return run(() => ops([{ op: "setSectionHeight", name: t.dataset.sh, h: Math.round(Number(t.value) * TW_PER_CM) }]));
    if (t.matches("[data-fmt]")) {
      const k = t.dataset.fmt, v = t.value;
      if (k === "fn" || k === "fs") return run(() => fmt(o => ({ font: Object.assign({}, DEF_FONT, o.font || {}, k === "fn" ? { n: v } : { s: Number(v) }) })));
      if (k === "fc" || k === "bg" || k === "fill" || k === "lc") return run(() => fmt(() => ({ [k]: v })));
      if (k === "lt") return run(() => fmt(() => ({ lt: Number(v) })));
    }
  });
  art.addEventListener("input", e => {
    if (e.target.matches("[data-sc]") && st.sup) { const [i, k] = e.target.dataset.sc.split(":"); st.sup.conds[Number(i)][k] = e.target.value; return renderSupSum(); }
    if (e.target.matches("[data-sraw]") && st.sup) { st.sup.raw = e.target.value; st.sup.chk = null; return; }
    if (st.batch && e.target.matches("#bt-q")) { st.batch.q = e.target.value; return renderBatchList(); }
    if (st.batch && e.target.matches("input[data-b]:not([type=checkbox]):not([type=color])")) { setP(st.batch, e.target.dataset.b, e.target.value); st.batch.err = ""; return renderBatchBtns(); }
    if (e.target.matches("[data-ff]")) { st.ffilter = e.target.value; const pos = e.target.selectionStart; renderLeft(); const i = $("[data-ff]"); i.focus(); i.setSelectionRange(pos, pos); } });
  // dialog modal (batch/Verify/Preview): Esc menutup, Tab berputar di dalam dialog
  art.addEventListener("keydown", e => {
    if (st.prev && e.key === "Escape") { e.preventDefault(); return st.prev.busy ? action("pabort") : prevClose(); }
    if (!(st.batch || st.verify || st.prev)) return;
    if (e.key === "Escape") { e.preventDefault(); if (st.batch) return action("bt-close"); if (st.verify && !st.verify.busy) return action("vcancel"); return; }
    if (e.key === "Tab") { const q = [...art.querySelectorAll("#rp-modal input:not(:disabled), #rp-modal select:not(:disabled), #rp-modal button:not(:disabled)")].filter(x => x.offsetParent); if (!q.length) return; const i = q.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); q[q.length - 1].focus(); } else if (!e.shiftKey && i === q.length - 1) { e.preventDefault(); q[0].focus(); } }
  });
  // seret field dari Field Explorer ke kanvas
  art.addEventListener("dragstart", e => { const f = e.target.closest?.(".rp-fld"); if (f) { e.dataTransfer.setData("text/plain", JSON.stringify({ src: f.dataset.src, type: Number(f.dataset.type), special: !!f.dataset.sp })); e.dataTransfer.effectAllowed = "copy"; } });
  art.addEventListener("dragover", e => { if (e.target.closest?.(".rp-paper")) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; } });
  art.addEventListener("drop", e => {
    const svg = e.target.closest?.(".rp-paper"), d = doc(); if (!svg || !d) return; e.preventDefault();
    let data; try { data = JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return; }
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse());
    const sec = secAtPure(d, q.y);
    run(() => ops([{ op: "addField", section: sec.name, l: Math.max(0, Math.round(q.x / GRID) * GRID), t: Math.max(0, Math.min(sec.h - 1, Math.round((q.y - sec.top) / GRID) * GRID)), w: 1800, h: 300, source: data.src, type: data.type, ...(data.special ? { special: true } : {}) }]));
  });
  art.addEventListener("wheel", e => { if (!e.ctrlKey || !e.target.closest?.(".rp-scroll")) return; const d = doc(); if (!d) return; e.preventDefault(); d.zoom = Math.min(3, Math.max(.25, d.zoom * (e.deltaY < 0 ? 1.1 : .9))); renderBar(); renderCanvas(); }, { passive: false });

  // pintasan keyboard + geser dengan panah (digabung agar satu op per ~300 ms)
  let nudge = null;
  const toolKey = e => { // Esc membatalkan alat SEBELUM cabang "Esc mengosongkan pilihan"; panah menggeser hantu; Enter menaruh
    const d = doc(); if (!st.tool || !d || !token || st.verify || st.prev || st.batch) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); return disarm("Alat dibatalkan."); }
    if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "")) return;
    const inTools = !!e.target.closest?.("#rp-tools"), dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (dir && !inTools) { e.preventDefault(); e.stopImmediatePropagation(); return toolStep(dir[0], dir[1], e.shiftKey ? 567 : GRID); }
    if (e.key === "Enter" && !e.target.closest?.("button, a, summary")) { e.preventDefault(); e.stopImmediatePropagation(); st.alt = e.altKey; return toolEnter(); }
  };
  window.addEventListener("keydown", toolKey);
  window.addEventListener("keydown", e => {
    const d = doc(); if (!d || !token || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || "") || st.verify || st.prev || st.batch) return;
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.key === "Escape" && d.sel.length) return select([]);
    if (e.key === "Delete") return action("del");
    if (ctrl && k === "z") { e.preventDefault(); return d.canUndo && action("undo"); }
    if (ctrl && k === "y") { e.preventDefault(); return d.canRedo && action("redo"); }
    if (ctrl && k === "c" && d.sel.length) { e.preventDefault(); return action("copy"); }
    if (ctrl && k === "v" && st.clip) { e.preventDefault(); return action("paste"); }
    if (ctrl && k === "d" && d.sel.length) { e.preventDefault(); return action("clone"); }
    if (ctrl && k === "a") { e.preventDefault(); return select(byPos(d, secMap(d), d.objects.map(o => o.name))); }
    if (ctrl && k === "s") { e.preventDefault(); return action("save"); }
    if (ctrl && ["b", "i", "u"].includes(k) && d.sel.length) { e.preventDefault(); return fmtClick(k); }
    const dir = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
    if (dir && d.sel.length && !e.target.closest?.("#rp-tools")) {
      e.preventDefault(); const step = e.shiftKey ? 567 : GRID; nudge = nudge || { x: 0, y: 0, t: null }; nudge.x += dir[0] * step; nudge.y += dir[1] * step; clearTimeout(nudge.t);
      nudge.t = setTimeout(() => { const n = nudge; nudge = null; const sel = selObjs(d); run(() => ops(sel.map(o => ({ op: "set", name: o.name, l: Math.max(0, o.l + n.x), t: Math.max(0, o.t + n.y) })))); }, 300);
    }
  });
  let wasNarrow = window.innerWidth < 700; window.addEventListener("resize", () => { const n = window.innerWidth < 700; if (n !== wasNarrow) { wasNarrow = n; draw(); } });
  window.addEventListener("beforeunload", e => { if (st.docs.some(d => d.dirty)) { e.preventDefault(); e.returnValue = ""; } });

  draw();
  // Browser tidak boleh menjalankan program diam-diam, jadi satu-satunya cara "otomatis" adalah protokol stemrpt://.
  // Hanya dicoba sekali per pembukaan halaman, dan hanya setelah user pernah berhasil menjalankannya lewat tombol
  // (kalau protokol belum terdaftar, Windows menampilkan dialog toko aplikasi yang mengganggu).
  connect().then(() => {
    let ok = false; try { ok = localStorage.getItem("rptAutoLaunch") === "1"; } catch { }
    if (!token && ok) launchAgent();
  });
  retryTimer = setInterval(() => { if (!token) connect(true); }, 5000);
}
