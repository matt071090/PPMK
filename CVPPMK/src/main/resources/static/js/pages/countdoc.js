// Count Document: hitung aktivitas PEMBUATAN dokumen SAP per dokumen/user/tanggal. Bukan alat BI dan bukan ukuran kinerja.
// Backend: CountDocController (/api/countdoc/companies|meta|data), hanya SELECT. Semua agregasi/filter/samarkan nama di klien (countdoc-engine.js).
// Redesain 2026-10-21: kelompok jadi kolom sendiri berwarna (warna = kelompok, intensitas = besar angka), strip KPI di atas tab, kontrol satu baris,
// chip kelompok = legenda + filter, drawer rincian, PDF slide 16:9 berwarna, nama user asli secara bawaan (saklar "Samarkan nama" opsional).
import { esc } from "../ui.js";
import * as E from "./countdoc-engine.js";
import { xlsxBlob, download } from "../xlsx.js";
import * as RP from "./countdoc-report.js";

const API = "api/countdoc";
const NOTE = "Jumlah dokumen bukan ukuran kinerja.";
const STATUS = { O: "Open", C: "Closed" };
const fmt = n => Number(n).toLocaleString("id-ID");
const DAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const DAY3 = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const VIEW_KEY = "cd-view", DENS_KEY = "cd-dens", MASK_KEY = "cd-mask", TPL_KEY = "cd-tpl", VERSION = "Count Document, versi 2026-10-21";
const TEMPLATES = [["png", "Laporan PNG (bebas ukuran, tinggi mengikuti isi)"], ["share", "Laporan slide 16:9 (untuk dibagikan)"], ["matrix", "Matriks untuk dibagikan - A4 landscape"], ["internal", "Matriks internal (tabel penuh) - A4 landscape"]];
const stLabel = s => s === "" ? "-" : STATUS[s] || s;
const HEAT_PRINT = [0, 6, 16, 28, 42, 58];

async function api(path) {
  const r = await fetch(`${API}/${path}`, { headers: { Accept: "application/json" } });
  const ct = r.headers.get("content-type") || "";
  const d = ct.includes("json") ? await r.json().catch(() => ({})) : {};
  if (!r.ok) {
    const e = new Error((d && d.message) || (r.status === 403 ? "Akses ditolak. Buka kunci Setup dulu." : `Gagal memuat (HTTP ${r.status}).`));
    e.code = d && d.code; e.status = r.status; throw e;
  }
  return d;
}

const isKey = key => /^\d{4}-\d{2}-\d{2}/.test(key);
const dayIdx = key => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10))).getUTCDay();
const dayName = key => DAYS[dayIdx(key)];
const isWeekend = (key, bucket) => bucket === "day" && isKey(key) && (dayIdx(key) === 0 || dayIdx(key) === 6);
const colFull = (key, bucket) => bucket === "day" && isKey(key) ? `${key} (${dayName(key)})` : bucket === "week" && isKey(key) ? `minggu mulai ${key}` : key;
const colHead = (key, bucket) => {
  if (key === E.NO_DATE) return ["tanpa", "tgl"];
  if (bucket === "day" && isKey(key)) return [DAY3[dayIdx(key)], `${key.slice(8, 10)}-${key.slice(5, 7)}`];
  if (bucket === "week" && isKey(key)) return ["mgg", `${key.slice(8, 10)}-${key.slice(5, 7)}`];
  return [key, ""];
};
const rd = (k, ok) => { try { const v = localStorage.getItem(k); return ok.includes(v) ? v : null; } catch { return null; } };
const wr = (k, v) => { try { localStorage.setItem(k, v); } catch { /* abaikan */ } };
const ssGet = k => { try { return sessionStorage.getItem(k); } catch { return null; } };
const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* abaikan */ } };
const badge = name => { const g = E.groupInfo(name); return `<span class="cd-bd" data-g="${g.code}"><i class="dot"></i>${g.code}<em>${esc(g.name)}</em></span>`; };

export function countdocPage(root, printEl) {
  const st = {
    meta: { objects: [] }, companies: [], resp: null, data: null, loading: false, taken: null,
    f: { groups: [], q: "", status: "", system: false, approval: false },
    mask: ssGet(MASK_KEY) === "1", template: TEMPLATES.some(t => t[0] === ssGet(TPL_KEY)) ? ssGet(TPL_KEY) : "png",
    view: rd(VIEW_KEY, ["date", "doc", "user", "summary", "table"]) || "doc", dense: rd(DENS_KEY, ["dense", "comfy"]) || "dense",
    page: 0, help: false, sort: { key: null, dir: null }, collapsed: new Set(), edit: false, detail: null
  };
  root.classList.add("cd-app");
  const $ = s => root.querySelector(s);
  const today = E.preset("month");
  root.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><span>Tools</span><span>Audit SAP</span></nav>
    <h1>Count Document</h1>
    <section class="cd-card" id="cd-src" aria-label="Sumber">
      <h2>Sumber</h2>
      <div class="cd-grid">
        <label class="cd-f"><span>Company</span><select id="cd-co"></select></label>
        <label class="cd-f"><span>Dari tanggal</span><input id="cd-from" type="date" value="${esc(today.from)}"></label>
        <label class="cd-f"><span>Sampai tanggal</span><input id="cd-to" type="date" value="${esc(today.to)}"></label>
        <div class="cd-f"><span>&nbsp;</span><button class="cbtn primary" id="cd-go" type="button" style="min-height:38px;justify-content:center">Hitung</button></div>
      </div>
      <div class="chips" style="margin:10px 0 0" aria-label="Rentang cepat">
        <button type="button" class="chip" data-p="today">Hari ini</button><button type="button" class="chip" data-p="7d">7 hari</button>
        <button type="button" class="chip" data-p="month">Bulan ini</button><button type="button" class="chip" data-p="lastmonth">Bulan lalu</button>
      </div>
      <p class="cd-status" id="cd-status" role="status" aria-live="polite">Pilih company dan rentang tanggal (maks 400 hari), lalu klik Hitung. Filter lain bekerja langsung tanpa memuat ulang.</p>
    </section>
    <div id="cd-result"></div>`;
  const result = $("#cd-result"), status = $("#cd-status"), src = $("#cd-src");
  const syncSrc = () => { src.hidden = !!(st.data && !st.edit); };
  const setStatus = (t, err) => { status.textContent = t; status.classList.toggle("err", !!err); };
  const isMobile = () => { try { return !!(window.matchMedia && window.matchMedia("(max-width: 640px)").matches); } catch { return false; } };

  // ---------- turunan data ----------
  function derive(label = "User") {
    const d = st.data, f = st.f;
    const base = E.filterRows(d.rows, { includeSystem: f.system, includeApproval: f.approval, statuses: f.status === "" ? [] : [f.status === "-" ? "" : f.status] });
    const users = E.displayUsers(base, d.users, st.mask, label);
    const names = new Map([...users].map(([i, u]) => [i, u.name]));
    const noGroup = E.searchRows(base, f.q, users);
    const rows = f.groups.length ? E.filterRows(noGroup, { groups: f.groups, includeSystem: f.system, includeApproval: f.approval }) : noGroup;
    const from = st.resp.from, to = st.resp.to;
    return { rows, noGroup, base, users, names, from, to, bucket: E.bucketFor(from, to), order: d.objects.map(o => o.id) };
  }
  const byOf = () => (st.view === "user" ? "user" : "date");
  const pivotOf = (dv, by = byOf()) => E.pivot(dv.rows, { by, from: dv.from, to: dv.to, bucket: dv.bucket, names: dv.users, objectOrder: dv.order });
  const activeList = () => {
    const f = st.f, out = [];
    if (f.groups.length) out.push(`kelompok ${f.groups.join(", ")}`);
    if (f.q.trim()) out.push(`pencarian "${f.q.trim()}"`);
    if (f.status !== "") out.push(`status ${f.status === "-" ? "(tanpa status)" : stLabel(f.status)}`);
    if (f.system) out.push("termasuk user manager dan INTERFACE");
    if (f.approval) out.push("termasuk persetujuan");
    return out;
  };

  // ---------- potongan tampilan ----------
  function ctxHtml() {
    const r = st.resp, co = r.companyName || r.company || "";
    const hint = `Cara menyimpan PDF: klik <b>PDF (cetak)</b>, lalu di dialog cetak pilih Tujuan = <b>Simpan sebagai PDF</b>, Skala = <b>100%</b>, dan matikan <b>Header dan footer</b>. Biarkan Ukuran kertas = <b>Default</b> supaya ukuran slide 16:9 dari laporan dipakai. Untuk WhatsApp: kirim berkas PDF-nya; halaman pertama jadi pratinjau.`;
    return `<div class="cd-ctx"><span class="t"><b>${esc(co)}</b> &middot; ${esc(E.fmtPeriod(r.from, r.to))} &middot; Diambil pada ${esc(E.fmtTime(st.taken))}</span>
      <button type="button" class="cbtn" data-act="edit" aria-expanded="${st.edit}" aria-controls="cd-src">${st.edit ? "Tutup" : "Ubah"}</button>
      <details class="cd-pop" id="cd-exp"><summary>Ekspor &#9662;</summary><div class="cd-pop-b">
        <label class="cd-f"><span>Template PDF</span><select data-f="tpl" aria-label="Template PDF">${TEMPLATES.map(([v, l]) => `<option value="${v}"${st.template === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <div class="exp-row"><button class="cbtn primary" type="button" data-x="png">Unduh PNG</button><button class="cbtn" type="button" data-x="pdf">PDF (cetak)</button><button class="cbtn" type="button" data-x="csv">CSV</button><button class="cbtn" type="button" data-x="xlsx">Excel</button></div>
        <p class="cd-note" id="cd-pdf-hint" style="margin:0">${hint}</p></div></details></div>`;
  }
  function controlsHtml() {
    const d = st.data, f = st.f;
    const statuses = [...new Set(d.rows.map(r => r.status === "" ? "-" : r.status))].sort();
    return `<div class="cd-tabs" role="tablist" aria-label="Tampilan">${TABS.map(([id, l]) => `<button type="button" role="tab" id="cd-tab-${id}" aria-selected="${st.view === id}" aria-controls="cd-panel" tabindex="${st.view === id ? 0 : -1}" data-v="${id}">${l}</button>`).join("")}</div>
      <div class="cd-ctl"><input class="cd-q" id="cd-q" type="search" placeholder="Cari dokumen, kelompok, atau user" aria-label="Cari dokumen, kelompok, atau user" value="${esc(f.q)}" autocomplete="off">
        <span class="cd-seg" role="group" aria-label="Kepadatan tabel"><button type="button" data-dens="dense" aria-pressed="${st.dense === "dense"}">Padat</button><button type="button" data-dens="comfy" aria-pressed="${st.dense === "comfy"}">Nyaman</button></span>
        <label class="cd-sw"><input type="checkbox" data-f="mask"${st.mask ? " checked" : ""}> Samarkan nama</label>
        <details class="cd-pop l" id="cd-more"><summary>Filter lain &#9662;</summary><div class="cd-pop-b">
          <label class="cd-f"><span>Status dokumen</span><select id="cd-f-status" data-f="status"><option value="">Semua</option>${statuses.map(s => `<option value="${esc(s)}"${f.status === s ? " selected" : ""}>${esc(s === "-" ? "(tanpa status)" : stLabel(s))}</option>`).join("")}</select></label>
          <label class="cd-sw"><input type="checkbox" data-f="system"${f.system ? " checked" : ""}> Sertakan user manager &amp; INTERFACE</label>
          <label class="cd-sw"><input type="checkbox" data-f="approval"${f.approval ? " checked" : ""}> Sertakan persetujuan <span class="badge warn">belum terverifikasi</span></label>
        </div></details>
        <span class="cd-live" id="cd-live" role="status" aria-live="polite"></span></div>`;
  }
  function kpiHtml(rows) {
    const k = E.kpis(rows);
    return [["Jumlah dokumen", k.documents, " hero"], ["User aktif", k.activeUsers, ""], ["Jenis dokumen terpakai", k.objectsUsed, ""], ["Hari aktif", k.activeDays, ""]]
      .map(([l, v, c]) => `<div class="cd-kpi${c}"><b>${fmt(v)}</b><span>${esc(l)}</span></div>`).join("");
  }
  function calloutHtml() {
    const r = st.resp, items = [], errs = r.errors || [];
    if (errs.length) items.push(`Sebagian dokumen gagal atau melewati batas waktu, jadi angkanya belum lengkap: ${errs.map(e => esc(e.object || e.id || e) + (e.reason ? ` (${esc(e.reason)})` : "")).join(", ")}.`);
    if (r.truncated) items.push("Data terlalu banyak dan dipotong di batas baris. Persempit rentang tanggal supaya angkanya lengkap.");
    if (st.f.approval) items.push("Hitungan persetujuan memakai pola penyetuju, bukan pembuat, dan belum terverifikasi. Jangan dijumlahkan dengan dokumen yang dibuat.");
    if (!items.length) return "";
    return `<details class="cd-warn" open><summary><span class="ci" aria-hidden="true">!</span><b>Perlu dicek</b> (${items.length})</summary><ul>${items.map(t => `<li>${t}</li>`).join("")}</ul></details>`;
  }
  function chipsHtml(dv) {
    const tot = new Map(); for (const r of dv.noGroup) tot.set(r.group, (tot.get(r.group) || 0) + r.counted);
    const groups = [...new Set(st.data.objects.map(o => o.group))].sort((a, b) => a.localeCompare(b));
    return `<div class="cd-chips" role="group" aria-label="Kelompok dokumen (legenda dan filter; klik memilih hanya kelompok itu, Ctrl atau Shift menambah)">${groups.map(g => {
      const i = E.groupInfo(g), on = st.f.groups.includes(g);
      return `<button type="button" class="cd-chip" data-g="${i.code}" data-gn="${esc(g)}" aria-pressed="${on}"><i class="dot"></i><span>${esc(g)}</span><b>${fmt(tot.get(g) || 0)}</b><span class="ck" aria-hidden="true">&#10003;</span></button>`;
    }).join("")}</div>`;
  }
  const activeHtml = () => { const a = activeList(); return a.length ? `<div class="cd-active"><span>Filter aktif: ${esc(a.join("; "))}</span><button type="button" class="cbtn" data-act="reset">Reset</button></div>` : ""; };
  const emptyHtml = () => { const a = activeList(); return `<div class="cd-empty"><p style="margin:0">Tidak ada dokumen untuk filter ini.</p>${a.length ? `<p style="margin:6px 0 0">Filter aktif: ${esc(a.join("; "))}.</p><button type="button" class="cbtn" data-act="reset">Reset filter</button>` : ""}</div>`; };

  // ---------- grafik ----------
  function stackSvg(sk, print) {
    const pts = sk.points, n = pts.length, max = Math.max(1, ...pts.map(p => p.total));
    const W = 720, H = 200, L = 34, R = 8, T = 18, B = 26, ph = H - T - B, slot = (W - L - R) / Math.max(1, n), bw = Math.min(slot * .62, 34);
    const step = Math.ceil(n / 14), showNum = n <= 31, yv = v => T + ph - v / max * ph;
    const fs = print ? 13 : 11, ta = print ? ` font-family="system-ui, 'Segoe UI', Arial, sans-serif" font-size="${fs}" fill="#222"` : "";
    const gl = print ? ' stroke="#ccc" stroke-dasharray="2 3"' : ' class="gl"', ax = print ? ' stroke="#888"' : "";
    const grid = [max, max / 2, 0].map(v => `<line${gl} x1="${L}" x2="${W - R}" y1="${yv(v).toFixed(1)}" y2="${yv(v).toFixed(1)}"></line><text${ta} x="${L - 5}" y="${(yv(v) + 3.5).toFixed(1)}" text-anchor="end">${fmt(Math.round(v))}</text>`).join("");
    const bars = pts.map((p, i) => {
      const x = L + i * slot + (slot - bw) / 2, cx = x + bw / 2;
      let y = T + ph; const segs = sk.groups.filter(g => p.segs[g]), parts = [];
      segs.forEach((g, si) => {
        const h = p.segs[g] / max * ph, gi = E.groupInfo(g), top = si === segs.length - 1, r = Math.min(2, h);
        y -= h;
        const at = print ? ` fill="${gi.bar}" stroke="#fff" stroke-width="1"` : ` data-g="${gi.code}"`;
        parts.push(top ? `<path${at} d="M${x.toFixed(1)} ${(y + h).toFixed(1)}V${(y + r).toFixed(1)}Q${x.toFixed(1)} ${y.toFixed(1)} ${(x + r).toFixed(1)} ${y.toFixed(1)}H${(x + bw - r).toFixed(1)}Q${(x + bw).toFixed(1)} ${y.toFixed(1)} ${(x + bw).toFixed(1)} ${(y + r).toFixed(1)}V${(y + h).toFixed(1)}Z"></path>`
          : `<rect${at} x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"></rect>`);
      });
      const tip = sk.groups.filter(g => p.segs[g]).map(g => `${g}: ${p.segs[g]}`).join(", ");
      const lab = sk.bucket === "day" && isKey(p.key) ? `${+p.key.slice(8)}/${+p.key.slice(5, 7)}` : sk.bucket === "week" && isKey(p.key) ? `mgg ${+p.key.slice(8)}/${+p.key.slice(5, 7)}` : p.key;
      return `<g><title>${esc(p.key)}: ${p.total}${tip ? " (" + esc(tip) + ")" : ""}</title>${parts.join("")}` +
        (p.total && (showNum || p.total === max) ? `<text${ta} x="${cx.toFixed(1)}" y="${(T + ph - p.total / max * ph - 4).toFixed(1)}" text-anchor="middle">${fmt(p.total)}</text>` : "") +
        (!p.total && showNum ? `<text${print ? ta.replace("#222", "#666") : ' class="z"'} x="${cx.toFixed(1)}" y="${(T + ph - 4).toFixed(1)}" text-anchor="middle">0</text>` : "") +
        (i % step === 0 ? `<text${ta} x="${cx.toFixed(1)}" y="${H - 9}" text-anchor="middle">${esc(lab)}</text>` : "") + `</g>`;
    }).join("");
    const unit = sk.bucket === "day" ? "hari" : sk.bucket === "week" ? "minggu" : "bulan";
    return `<svg${print ? "" : ' class="cd-svg"'} viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik batang bertumpuk jumlah dokumen per ${unit} menurut kelompok, sumbu mulai dari nol">${grid}<line${ax} x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}"></line>${bars}</svg>`;
  }
  const legendHtml = sk => `<div class="cd-leg">${sk.totals.map(t => { const g = E.groupInfo(t.group); return `<span data-g="${g.code}"><i class="dot"></i>${g.code} ${esc(g.name)} <b>${fmt(t.n)}</b></span>`; }).join("")}</div>`;
  function groupBarsHtml(dv) {
    const gs = E.groupStats(dv.rows); if (!gs.length) return `<p class="cd-empty">Tidak ada data.</p>`;
    return gs.map(g => `<div class="cd-gb" data-g="${E.groupInfo(g.group).code}">${badge(g.group)}<span class="tr"><i style="width:${(g.documents / gs[0].documents * 100).toFixed(1)}%"></i></span><span class="v">${fmt(g.documents)}<small>${g.pct.toFixed(1).replace(".", ",")}%</small></span></div>`).join("");
  }
  function topCardsHtml(dv) {
    const us = E.userStats(dv.rows, dv.names).slice(0, 8), os = E.topObjects(dv.rows, 10);
    const row = (g, n, v, max) => `<div class="cd-gb"${g ? ` data-g="${E.groupInfo(g).code}"` : ""}><span title="${esc(n)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n)}</span><span class="tr"><i style="width:${(v / max * 100).toFixed(1)}%${g ? "" : ";background:var(--accent)"}"></i></span><span class="v">${fmt(v)}</span></div>`;
    return `<div class="cd-two" style="grid-template-columns:1fr 1fr;margin-top:12px"><div class="cd-card"><h2>Pengguna teratas</h2>${us.map(u => row("", u.name, u.counted, us[0].counted)).join("")}<p class="cd-note">${esc(NOTE)}</p></div>
      <div class="cd-card"><h2>Dokumen terbanyak</h2>${os.map(o => row(o.group, o.id, o.counted, os[0].counted)).join("")}</div></div>`;
  }
  function summaryHtml(dv) {
    if (!dv.rows.some(r => r.counted)) return emptyHtml();
    const sk = E.stackedTrend(dv.rows, dv.from, dv.to), unit = sk.bucket === "day" ? "hari" : sk.bucket === "week" ? "minggu" : "bulan";
    return `<div class="cd-two"><div class="cd-card"><h2>Dokumen dibuat per ${unit}</h2>${stackSvg(sk, false)}${legendHtml(sk)}<p class="cd-note">Hari tanpa data tampil 0. Baris tanpa tanggal tidak ikut grafik. Kelompok di luar 8 teratas digabung ke Lainnya.</p></div>
      <div class="cd-card"><h2>Dokumen per kelompok</h2>${groupBarsHtml(dv)}</div></div>` + topCardsHtml(dv);
  }

  // ---------- matriks ----------
  function userCardsHtml(dv) {
    const cards = E.userCards(dv.rows, dv.users); if (!cards.length) return "";
    return `<h2 style="font-size:15px;margin:16px 0 0">Per user</h2><div class="cd-ucs">${cards.map(u => `<article class="cd-uc"><h3>${esc(u.name)}${u.code ? ` <small>${esc(u.code)}</small>` : ""}</h3>
      <div class="m">${fmt(u.counted)} dokumen &middot; ${fmt(u.activeDays)} hari aktif</div>
      <div class="cd-stk" role="img" aria-label="Komposisi kelompok">${u.segments.map(s => `<i data-g="${E.groupInfo(s.group).code}" style="width:${s.px.toFixed(1)}px" title="${esc(s.group)}: ${fmt(s.n)}"></i>`).join("")}</div>
      <ul>${u.objects.slice(0, 5).map(o => `<li><span title="${esc(o.id)}">${esc(o.id)}</span><span>${fmt(o.n)}</span></li>`).join("")}${u.objects.length > 5 ? `<li><span>+${u.objects.length - 5} jenis lainnya</span><span></span></li>` : ""}</ul></article>`).join("")}</div>`;
  }
  function pivotHtml(dv, by, num = false) {
    const p = E.sortPivot(pivotOf(dv, by), st.sort.key, st.sort.dir);
    if (!p.groups.length) return emptyHtml();
    const meta = new Map(st.data.objects.map(o => [o.id, o]));
    let max = 1, maxObj = 1, maxSub = 1;
    for (const g of p.groups) { maxSub = Math.max(maxSub, g.subtotal.total); for (const o of g.objects) { maxObj = Math.max(maxObj, o.total); for (const k in o.cells) max = Math.max(max, o.cells[k]); } }
    const gt = E.grandTotal(p), what = by === "date" ? "tanggal" : "user", noTh = num ? `<th scope="col" class="no">No</th>` : "", noTd = num ? `<td class="no"></td>` : "";
    let seq = 0;
    const colName = c => by === "date" ? colFull(c.key, dv.bucket) : c.label + (c.code ? ` (${c.code})` : "");
    const sortAttr = key => st.sort.key === key && st.sort.dir ? ` aria-sort="${st.sort.dir === "asc" ? "ascending" : "descending"}"` : "";
    const sh = (key, inner) => `<button type="button" class="cd-sh" data-sk="${esc(key)}">${inner}</button>`;
    const head = `<tr><th scope="col" class="k">Kelompok</th>${noTh}<th scope="col" class="d"${sortAttr("doc")}>${sh("doc", "<span>Dokumen</span>")}</th>${p.cols.map(c => {
      const h = by === "date" ? colHead(c.key, dv.bucket) : null;
      const inner = by === "date" ? `<span class="d1">${esc(h[0])}</span><span class="d2">${esc(h[1])}</span>` : `<span class="u1">${esc(c.label)}</span>${c.code ? `<span class="u2">${esc(c.code)}</span>` : ""}`;
      return `<th scope="col" class="c${by === "date" && isWeekend(c.key, dv.bucket) ? " we" : ""}" title="${esc(colName(c))}"${sortAttr(c.key)}>${sh(c.key, inner)}</th>`;
    }).join("")}<th scope="col" class="tt"${sortAttr("total")}>${sh("total", `<span>${num ? "Grand Total" : "Total"}</span>`)}</th></tr>`;
    let first = true;
    const td = (v, o, c) => {
      if (!v) return `<td class="n e"></td>`;
      const ti = first ? 0 : -1; first = false;
      return `<td class="n h${E.heatBucket(v, max)}" tabindex="${ti}" data-o="${esc(o.id)}" data-c="${esc(c.key)}" title="${esc(`${o.id} · ${colName(c)}: ${fmt(v)} dokumen`)}">${fmt(v)}</td>`;
    };
    const body = p.groups.map(g => {
      const gi = E.groupInfo(g.group), col = st.collapsed.has(g.group);
      const sub = `<tr class="sub" data-g="${gi.code}"><td class="k" data-g="${gi.code}">${badge(g.group)}</td>${noTd}<th scope="row" class="d"><button type="button" class="cd-tg" data-tg="${esc(g.group)}" aria-expanded="${!col}" aria-label="${col ? "Buka" : "Ciutkan"} ${esc(g.group)}"></button><span class="cd-b2">${gi.code.slice(0, 2)}</span>Total ${esc(g.group)}</th>` +
        p.cols.map(c => `<td class="n">${g.subtotal.cells[c.key] ? fmt(g.subtotal.cells[c.key]) : ""}</td>`).join("") + `<td class="tt" style="--p:${(g.subtotal.total / maxSub).toFixed(3)}">${fmt(g.subtotal.total)}</td></tr>`;
      const rows = g.objects.map(o => {
        const m = meta.get(o.id) || {}, tags = [m.role && m.role !== "Pembuat" ? m.role : "", m.dateKind && m.dateKind !== "Tgl buat" ? m.dateKind : ""].filter(Boolean);
        const tip = `${o.id}${m.role ? " · peran: " + m.role : ""}${m.dateKind ? " · tanggal: " + m.dateKind : ""}`;
        return `<tr class="o" data-g="${gi.code}"><td class="k" data-g="${gi.code}"><span class="cd-sr">${esc(g.group)}</span></td>${num ? `<td class="no">${++seq}</td>` : ""}<th scope="row" class="d" title="${esc(tip)}"><span class="cd-b2">${gi.code.slice(0, 2)}</span>${esc(o.id)}${tags.map(t => ` <small class="cd-tag">${esc(t)}</small>`).join("")}</th>${p.cols.map(c => td(o.cells[c.key], o, c)).join("")}<td class="tt" style="--p:${(o.total / maxObj).toFixed(3)}">${fmt(o.total)}</td></tr>`;
      }).join("");
      return `<tbody data-gk="${esc(g.group)}"${col ? ' class="cd-col"' : ""}>${sub}${rows}</tbody>`;
    }).join("");
    const foot = `<tfoot><tr class="all"><td class="k" style="border-left-color:transparent"></td>${noTd}<th scope="row" class="d">${num ? "Total keseluruhan" : "Total semua"}</th>${p.cols.map(c => `<td class="n">${gt.cells[c.key] ? fmt(gt.cells[c.key]) : ""}</td>`).join("")}<td class="tt" style="--p:1">${fmt(gt.total)}</td></tr></tfoot>`;
    const bn = by === "date" && dv.bucket !== "day" ? ` Kolom tanggal dikelompokkan per ${dv.bucket === "week" ? "minggu (mulai Senin)" : "bulan"} karena rentang lebih dari 31 hari.` : "";
    return `<div class="cd-pivot" tabindex="0" role="region" aria-label="Matriks per ${what}, gulir untuk melihat kolom lain"><table class="cd-m${num ? " has-no" : ""}"><caption class="cd-sr">Jumlah dokumen per kelompok, dokumen, dan ${what}, dengan total keseluruhan</caption><thead>${head}</thead>${body}${foot}</table></div>
      <p class="cd-note">${esc(NOTE)}${bn}</p>` + (by === "user" ? userCardsHtml(dv) : "");
  }

  function detailHtml(dv) {
    const d = st.detail; if (!d) return "";
    const by = byOf(), m = new Map();
    for (const r of dv.rows) {
      if (!r.counted || r.objId !== d.o) continue;
      if (by === "date" ? E.bucketKey(r.date, dv.bucket) !== d.c : String(r.user) !== d.c) continue;
      const k = by === "date" ? dv.names.get(r.user) : (r.date || E.NO_DATE);
      m.set(k, (m.get(k) || 0) + r.counted);
    }
    const list = [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
    const total = list.reduce((t, x) => t + x[1], 0), colName = by === "date" ? colFull(d.c, dv.bucket) : (dv.names.get(+d.c) || "");
    return `<div class="hd"><div><h2>Rincian: ${esc(d.o)}</h2><p class="sub">${esc(colName)}</p></div><button type="button" class="cbtn" data-act="close-detail" aria-label="Tutup rincian">Tutup</button></div>
      <table class="cd-t"><thead><tr><th scope="col" class="l">${by === "date" ? "User" : "Tanggal"}</th><th scope="col">Dokumen</th></tr></thead><tbody>${list.map(([k, n]) => `<tr><td class="l">${esc(k)}</td><td>${fmt(n)}</td></tr>`).join("")}<tr class="sub"><td class="l">Total</td><td>${fmt(total)}</td></tr></tbody></table>`;
  }
  function openDetail(td) {
    st.detail = { o: td.dataset.o, c: td.dataset.c };
    const el = $("#cd-detail"); el.innerHTML = detailHtml(derive()); el.hidden = false; $("#cd-scrim").hidden = false;
    const b = el.querySelector("button"); if (b) b.focus();
  }
  function closeDetail() {
    const d = st.detail; st.detail = null;
    const el = $("#cd-detail"); if (!el) return; el.innerHTML = ""; el.hidden = true; $("#cd-scrim").hidden = true;
    if (d) { const t = [...root.querySelectorAll("td.n[data-o]")].find(x => x.dataset.o === d.o && x.dataset.c === d.c); if (t) t.focus(); }
  }

  const PAGE = 100;
  function tableHtml(dv) {
    const all = E.tableRows(dv.rows, dv.names);
    if (!all.length) return emptyHtml();
    const pages = Math.ceil(all.length / PAGE);
    st.page = Math.min(st.page, pages - 1);
    const slice = all.slice(st.page * PAGE, st.page * PAGE + PAGE);
    const H = ["Kelompok", "Dokumen", "Peran", "Jenis tanggal", "Tanggal", "User", "Status", "Jumlah"];
    return `<div class="table-wrap"><table class="cd-t cd-flat"><thead><tr>${H.map((h, i) => `<th scope="col"${i < 7 ? ' class="l"' : ""}>${h}</th>`).join("")}</tr></thead><tbody>${slice.map(r =>
      `<tr><td class="l" data-l="Kelompok">${esc(r.group)}</td><td class="l" data-l="Dokumen">${esc(r.objId)}</td><td class="l" data-l="Peran">${esc(r.role)}</td><td class="l" data-l="Jenis tanggal">${esc(r.dateKind)}</td>` +
      `<td class="l" data-l="Tanggal">${esc(r.date)}</td><td class="l" data-l="User">${esc(r.user)}</td><td class="l" data-l="Status">${esc(stLabel(r.status))}</td><td data-l="Jumlah">${fmt(r.counted)}</td></tr>`).join("")}</tbody></table></div>
      <div class="cd-pg"><span>${fmt(all.length)} baris, halaman ${st.page + 1} dari ${pages}</span><button class="cbtn" type="button" data-pg="-1"${st.page ? "" : " disabled"}>Sebelumnya</button><button class="cbtn" type="button" data-pg="1"${st.page < pages - 1 ? "" : " disabled"}>Berikutnya</button></div>`;
  }

  const TABS = [["doc", "Dokumen per hari"], ["date", "Per tanggal"], ["user", "Per user"], ["summary", "Ringkasan"], ["table", "Data"]];
  const helpHtml = () => `<details class="cd-card cd-legend"${st.help ? " open" : ""} id="cd-help" style="margin-top:12px"><summary><b>Cara membaca angka</b></summary><dl>
    <dt>Warna</dt><dd>Warna menunjukkan kelompok dokumen; makin pekat latar sel, makin besar angkanya (relatif terhadap angka terbesar di matriks). Angka tetap tertulis.</dd>
    <dt>Peran</dt><dd>Pembuat = user yang membuat dokumen. Penyetuju/Pengubah/Penutup dipakai blok khusus (persetujuan, tutup PO, tutup order produksi).</dd>
    <dt>Jenis tanggal</dt><dd>Tgl buat (umumnya), Tgl diubah, Tgl tutup, atau Tgl jurnal. Tanggal kosong atau 1900 tampil "(tanpa tanggal)".</dd>
    <dt>Dokumen batal</dt><dd>Belum disaring; dokumen yang dibatalkan masih ikut terhitung selama tercatat.</dd>
    <dt>Status O / C</dt><dd>O = Open, C = Closed menurut status dokumen di SAP, bukan status persetujuan.</dd></dl></details>`;

  // ---------- render ----------
  const viewInner = dv => st.view === "summary" ? summaryHtml(dv) : st.view === "table" ? tableHtml(dv) : pivotHtml(dv, byOf(), st.view === "doc");
  function renderView(dv = derive()) {
    const ae = document.activeElement, keep = ae && ae.dataset && ae.dataset.sk;
    $("#cd-view").innerHTML = `<div id="cd-panel" role="tabpanel" aria-labelledby="cd-tab-${st.view}">${viewInner(dv)}</div>`;
    if (keep) { const b = [...root.querySelectorAll("[data-sk]")].find(x => x.dataset.sk === keep); if (b) b.focus(); }
  }
  function update() {
    if (!st.data) return;
    const dv = derive();
    $("#cd-kpi").innerHTML = kpiHtml(dv.rows); $("#cd-callout").innerHTML = calloutHtml();
    $("#cd-chips").innerHTML = chipsHtml(dv); $("#cd-active").innerHTML = activeHtml();
    $("#cd-live").textContent = `${fmt(E.sumCounted(dv.rows))} dokumen dari ${fmt(E.sumCounted(dv.base))}`;
    renderView(dv);
  }
  function paint() {
    if (!st.data) return;
    syncSrc();
    result.innerHTML = ctxHtml() + `<div class="cd-kpis" id="cd-kpi" aria-label="Ringkasan angka"></div><div id="cd-callout"></div>` + controlsHtml() +
      `<div id="cd-chips"></div><div id="cd-active"></div><div id="cd-view"></div>` + helpHtml() +
      `<div class="cd-scrim" id="cd-scrim" hidden></div><aside class="cd-dr" id="cd-detail" role="dialog" aria-modal="true" aria-label="Rincian sel" hidden></aside>`;
    root.classList.toggle("comfy", st.dense === "comfy");
    update();
  }
  const syncTabs = () => root.querySelectorAll('[role="tab"]').forEach(b => { const on = b.dataset.v === st.view; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
  const setView = v => { st.view = v; wr(VIEW_KEY, v); st.page = 0; st.sort = { key: null, dir: null }; closeDetail(); syncTabs(); renderView(); };

  // ---------- muat data ----------
  function validate() {
    const from = $("#cd-from").value, to = $("#cd-to").value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return "Isi tanggal dari dan sampai.";
    if (from > to) return "Tanggal awal harus sebelum atau sama dengan tanggal akhir.";
    if (E.daysBetween(from, to) + 1 > 400) return "Rentang maksimal 400 hari. Persempit rentang tanggal.";
    return null;
  }
  async function load() {
    if (st.loading) return;
    const bad = validate();
    if (bad) { setStatus(bad, true); return; }
    const co = $("#cd-co").value;
    if (!co) { setStatus("Company belum tersedia. Muat ulang halaman.", true); return; }
    st.loading = true; $("#cd-go").disabled = true;
    const t0 = Date.now();
    result.innerHTML = `<div class="cd-load" role="status"><div class="cd-skel" aria-hidden="true"><div class="kp"><i></i><i></i><i></i><i></i></div>${"<i class=\"row\"></i>".repeat(9)}</div><p><b>Menghitung dokumen…</b> <span id="cd-sec">Menghubungi server…</span></p></div>`;
    const iv = setInterval(() => { const m = $("#cd-sec"); if (m) m.textContent = `Query berjalan per dokumen, bisa beberapa menit untuk rentang panjang… ${Math.floor((Date.now() - t0) / 1000)} dtk`; }, 1000);
    setStatus("Memuat data…");
    try {
      const q = new URLSearchParams({ company: co, from: $("#cd-from").value, to: $("#cd-to").value });
      const d = await api(`data?${q}`);
      st.resp = d; st.data = E.normalize(d, st.meta);
      const gen = new Date(d.generatedAt || Date.now()); st.taken = isNaN(gen) ? new Date() : gen;
      st.f = { groups: [], q: "", status: "", system: false, approval: false }; st.page = 0; st.edit = false; st.detail = null; st.sort = { key: null, dir: null };
      st.collapsed = isMobile() ? new Set(st.data.objects.map(o => o.group)) : new Set();
      const n = E.sumCounted(st.data.rows);
      setStatus(`Selesai: ${fmt(n)} dokumen pada ${fmt(st.data.rows.length)} baris, diambil ${st.taken.toLocaleString("id-ID")}.`);
      paint();
    } catch (e) {
      st.data = null; result.innerHTML = ""; syncSrc();
      setStatus(`${e.message}${e.code ? ` (kode ${e.code})` : ""}`, true);
    } finally { clearInterval(iv); st.loading = false; $("#cd-go").disabled = false; }
  }

  // ---------- ekspor ----------
  function dataMatrix(dv) {
    return [["Kelompok", "Dokumen", "Peran", "Jenis tanggal", "Tanggal", "User", "Status", "Jumlah"],
      ...E.tableRows(dv.rows, dv.names).map(r => [r.group, r.objId, r.role, r.dateKind, r.date, r.user, stLabel(r.status), r.counted])];
  }
  const isPv = () => st.view === "date" || st.view === "user" || st.view === "doc";
  /** CSV: matriks pivot; kolom user berjudul USER_CODE (bila tidak disamarkan). */
  function matrixOf(dv, by) {
    const p = pivotOf(dv, by), m = E.pivotMatrix(p, ["Kelompok", "Dokumen"], { compact: true, grand: true });
    if (by === "user") m[0] = m[0].map((h, i) => i >= 2 && i <= p.cols.length + 1 ? (p.cols[i - 2].code || h) : h);
    return m;
  }
  /** Sheet Excel pivot: Kelompok terisi di tiap baris (tanpa sel gabung), sel nol kosong, subtotal tebal bertint, autofilter tanpa baris Total semua. */
  function pivotSheet(dv, by) {
    const p = pivotOf(dv, by), tint = g => E.groupInfo(g).tint.slice(1);
    const num = (v, s) => v ? { v, s: { num: true, ...s } } : (s && s.fill ? { v: "", s } : "");
    const head = ["Kelompok", "Dokumen", ...p.cols.map(c => by === "user" ? (c.code || c.label)
      : isWeekend(c.key, dv.bucket) ? { v: c.key, s: { b: true, color: "FFFFFF", fill: "6B7B83" } } : c.key), "Total"];
    const rows = [head];
    for (const g of p.groups) {
      const t = tint(g.group);
      for (const o of g.objects) rows.push([{ v: g.group, s: { fill: t } }, o.id, ...p.cols.map(c => num(o.cells[c.key])), num(o.total, { b: true })]);
      const sb = { b: true, fill: t };
      rows.push([{ v: g.group, s: sb }, { v: "Total " + g.group, s: sb }, ...p.cols.map(c => num(g.subtotal.cells[c.key], sb)), num(g.subtotal.total, sb)]);
    }
    const gt = E.grandTotal(p), gs = { b: true, fill: "DDE3E6" }, filterRows = rows.length;
    rows.push([{ v: "", s: gs }, { v: "Total semua", s: gs }, ...p.cols.map(c => num(gt.cells[c.key], gs)), num(gt.total, gs)]);
    return { name: by === "user" ? "Pivot per user" : "Pivot per tanggal", rows, filterRows };
  }
  /** Sheet Excel "Dokumen per hari": header baris 1 (freeze), Kelompok terisi tiap baris (tint), tanpa breakdown user; filter tidak mencakup Total keseluruhan. */
  function docSheet(dv) {
    const p = pivotOf(dv, "date"), m = E.docMatrix(p), tint = new Map(p.groups.map(g => [g.group, E.groupInfo(g.group).tint.slice(1)]));
    const rows = m.map((r, i) => {
      if (i === 0) return r.map((h, j) => j >= 3 && j < r.length - 1 && isWeekend(p.cols[j - 3].key, dv.bucket) ? { v: h, s: { b: true, color: "FFFFFF", fill: "6B7B83" } } : h);
      const last = i === m.length - 1, gs = { b: true, fill: "DDE3E6" };
      return r.map((v, j) => last ? (j === 0 ? { v: "", s: gs } : typeof v === "number" ? { v, s: { num: true, ...gs } } : { v, s: gs })
        : j === 0 ? { v, s: { fill: tint.get(v) } } : j === r.length - 1 ? { v, s: { num: true, b: true } } : typeof v === "number" && j >= 3 ? { v, s: { num: true } } : v);
    });
    return { name: "Dokumen per hari", rows, filterRows: rows.length - 1 };
  }
  const fname = ext => `count-document_${st.resp.from}_${st.resp.to}.${ext}`;
  function exportFile(kind) {
    const dv = derive();
    if (kind === "csv") {
      const m = st.view === "doc" ? E.docMatrix(pivotOf(dv, "date")) : isPv() ? matrixOf(dv, byOf()) : dataMatrix(dv);
      m.push([], [NOTE]);
      download(new Blob([E.toCsv(m)], { type: "text/csv;charset=utf-8" }), fname("csv"));
    } else {
      const notes = [["Catatan"], [NOTE], ["Periode", `${st.resp.from} s/d ${st.resp.to}`], ["Nama user disamarkan", st.mask ? "ya" : "tidak"], ["Kolom user", st.mask ? "User n" : "USER_CODE"], ["Total semua", "disertakan (lintas jenis dokumen, bukan ukuran kinerja)"]];
      const sheets = [];
      if (st.view === "doc") sheets.push(docSheet(dv)); else if (isPv()) sheets.push(pivotSheet(dv, st.view));
      sheets.push({ name: "Data", rows: dataMatrix(dv) });
      if (!isPv()) sheets.push(pivotSheet(dv, "date"));
      sheets.push({ name: "Catatan", rows: notes });
      download(xlsxBlob(sheets), fname("xlsx"));
    }
  }

  // ---------- cetak ----------
  /** Matriks A4: dipecah per blok kolom (dokumen diulang di tiap blok) supaya muat. */
  function printMatrix(dv, by) {
    const p = pivotOf(dv, by), per = by === "date" ? 31 : 20, gt = E.grandTotal(p);
    const blocks = []; for (let i = 0; i < p.cols.length; i += per) blocks.push(p.cols.slice(i, i + per));
    const v = n => (n ? fmt(n) : "");
    return blocks.map((cols, bi) => {
      const fs = cols.length > 24 ? 6.5 : cols.length > 16 ? 7.5 : 9;
      const head = `<tr><th class="l">Dokumen</th>${cols.map(c => `<th class="r">${esc(by === "date" ? colHead(c.key, dv.bucket).filter(Boolean).join(" ") : c.label)}</th>`).join("")}<th class="r">Total</th></tr>`;
      const body = p.groups.map(g => { const i = E.groupInfo(g.group);
        return `<tr class="pg"><th class="l" colspan="${cols.length + 2}" style="background:${i.tint};color:${i.ink};border-left:4pt solid ${i.bar}">${i.code} ${esc(g.group)}</th></tr>` +
        g.objects.map(o => `<tr><td class="pt">${esc(o.id)}</td>${cols.map(c => `<td class="r">${v(o.cells[c.key])}</td>`).join("")}<td class="r"><b>${fmt(o.total)}</b></td></tr>`).join("") +
        `<tr class="ps"><td style="background:${i.tint}">Total ${esc(g.group)}</td>${cols.map(c => `<td class="r" style="background:${i.tint}">${v(g.subtotal.cells[c.key])}</td>`).join("")}<td class="r" style="background:${i.tint}">${fmt(g.subtotal.total)}</td></tr>`; }).join("") +
        `<tr class="ps"><td>Total semua</td>${cols.map(c => `<td class="r">${v(gt.cells[c.key])}</td>`).join("")}<td class="r">${fmt(gt.total)}</td></tr>`;
      return `<table class="pm" style="font-size:${fs}px"><caption>Jumlah dokumen per dokumen dan ${by === "date" ? (dv.bucket === "day" ? "tanggal" : dv.bucket === "week" ? "minggu (mulai Senin)" : "bulan") : "pengguna"}${blocks.length > 1 ? ` (bagian ${bi + 1} dari ${blocks.length})` : ""}</caption><thead>${head}</thead><tbody>${body}</tbody></table>`;
    }).join("");
  }
  const filterText = () => { const a = activeList(); return a.length ? a.join("; ") : "tanpa filter tambahan"; };
  function notesHtml(dv, title = "Catatan", withNote = false) {
    const f = st.f, r = st.resp;
    const li = [
      `Sumber: SAP Business One, ${r.companyName || r.company || ""}. Diambil pada ${st.taken.toLocaleString("id-ID")}.`,
      "Yang dihitung: dokumen SAP yang dibuat pada periode ini, menurut tanggal buat.",
      f.approval ? "Hitungan persetujuan/penutupan ikut disertakan, memakai pola penyetuju (belum terverifikasi); jangan dijumlahkan dengan dokumen yang dibuat." : "Persetujuan dan penutupan tidak disertakan (dihitung terpisah bila diaktifkan).",
      f.system ? "User manager dan INTERFACE (integrasi) disertakan." : "User manager dan INTERFACE (integrasi) dikecualikan.",
      "Dokumen yang dibatalkan belum disaring; selama masih tercatat di SAP tetap terhitung.",
      ...(withNote ? [`${NOTE} Angka hanya menunjukkan aktivitas pencatatan.`] : []),
      `Filter aktif: ${filterText()}. Nama pengguna ${st.mask ? "disamarkan" : "ditampilkan apa adanya"}.`
    ];
    return `<div class="p-note"><b>${esc(title)}</b><ul>${li.map(t => `<li>${esc(t)}</li>`).join("")}</ul><p class="p-ver">${esc(VERSION)} &middot; dicetak ${esc(new Date().toLocaleString("id-ID"))}</p></div>`;
  }
  function kopHtml(title, slide) {
    const r = st.resp, co = esc(r.companyName || r.company || "");
    if (slide) return `<h1>${esc(title)}</h1><p class="p-meta">${co} &middot; Periode ${esc(E.fmtPeriod(r.from, r.to))} &middot; Diambil pada ${esc(E.fmtTime(st.taken))}</p>`;
    return `<h1>${esc(title)}</h1><p class="p-meta">${co} &middot; Periode ${esc(E.fmtPeriod(r.from, r.to))} (${esc(r.from)} s/d ${esc(r.to)}) &middot; Dibuat pada ${esc(new Date().toLocaleString("id-ID"))} &middot; Sumber: SAP Business One</p>`;
  }
  // ---------- PDF eksekutif (slide 16:9) ----------
  // Palet PDF terpisah dari GROUPS web: satu aksen teal + netral. Warna mengikuti PERINGKAT total periode (bukan nama kelompok); peringkat >= 4 digabung "Lainnya".
  const PDF = { ink: "#1B2428", sub: "#4B5860", line: "#D5DBDF", panel: "#F2F6F6", accent: "#0A6B5C", day: "#B7C4C9", rank: ["#0A4F47", "#2F9486", "#9AD3C9"], other: "#E3E7EA", otherLine: "#8E9AA2", heat: ["#E6F1EF", "#BFE0DA", "#7CBFB3", "#2F9486"] };
  const FF = "system-ui, 'Segoe UI', Arial, sans-serif";
  const nf = E.fmtNum, pct0 = p => `${Math.round(p)}%`, pct1 = p => p.toFixed(1).replace(".", ",") + "%";
  /** Heat 4 tingkat (0 = kosong): t = sqrt(nilai/maks) dalam empat kelas sama lebar. */
  const pdfHeat = (v, max) => (!v || !max ? 0 : Math.min(4, Math.floor(Math.min(1, Math.sqrt(v / max)) * 4) + 1));
  /** Peringkat kelompok dihitung SEKALI dari groupStats: 3 teratas (tanpa kelompok Lainnya) bernada, sisanya digabung "Lainnya". */
  function pdfRanks(gs) {
    const top = gs.filter(g => g.group !== E.OTHER_GROUP.name).slice(0, 3), rest = gs.filter(g => !top.includes(g));
    return { top, rest, restDocs: rest.reduce((t, g) => t + g.documents, 0), restPct: rest.reduce((t, g) => t + g.pct, 0) };
  }
  const periodShort = (from, to) => { const p = E.fmtPeriod(from, to); return from.slice(0, 4) === to.slice(0, 4) ? p.replace(/ \d{4}$/, "") : p; };
  const colLabel = (key, bucket) => bucket === "month" ? E.fmtDateId(key + "-01").split(" ").slice(1).join(" ") : (bucket === "week" ? "minggu mulai " : "") + E.fmtDateId(key, false);

  /** Grafik batang TUNGGAL per hari/minggu/bulan (maks 14 batang): puncak = teal tebal, lainnya netral; sumbu mulai nol; font 26 satuan (>= 20pt pada slide). */
  function barSvg(dv) {
    const bucket = E.slideBucket(dv.from, dv.to, 14), keys = E.bucketKeys(dv.from, dv.to, bucket), m = new Map(keys.map(k => [k, 0]));
    for (const r of dv.rows) if (r.counted && r.date) { const k = E.bucketKey(r.date, bucket); if (m.has(k)) m.set(k, m.get(k) + r.counted); }
    const vals = keys.map(k => m.get(k)), mx = Math.max(0, ...vals), max = Math.max(1, mx), peak = mx > 0 ? vals.indexOf(mx) : -1;
    const W = 1000, H = 190, L = 10, R = 10, T = 36, B = 36, ph = H - T - B, slot = (W - L - R) / Math.max(1, keys.length);
    const t = (x, y, s, extra = "") => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-family="${FF}" font-size="22" fill="${PDF.ink}"${extra}>${s}</text>`;
    const bars = keys.map((k, i) => {
      const cx = L + slot * i + slot / 2, v = vals[i], h = v / max * ph, isP = i === peak, bw = Math.min(slot * (isP ? .55 : .42), 90), y = T + ph - h;
      const lab = bucket === "month" ? E.fmtDateId(k + "-01", false).split(" ")[1] : (bucket === "day" && keys.length > 7 && i > 0 && +k.slice(8) !== 1) ? String(+k.slice(8)) : `${+k.slice(8, 10)}/${+k.slice(5, 7)}`;
      return `<g>${v ? `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${isP ? PDF.accent : PDF.day}"></rect>` : ""}` +
        t(cx, y - 7, fmt(v), isP ? ' font-weight="700"' : "") + t(cx, H - 8, esc(lab), isP ? ' font-weight="700"' : "") + `</g>`;
    }).join("");
    const unit = bucket === "day" ? "hari" : bucket === "week" ? "minggu" : "bulan";
    return { svg: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik batang jumlah dokumen per ${unit}, sumbu mulai dari nol"><line x1="${L}" x2="${W - R}" y1="${T + ph}" y2="${T + ph}" stroke="${PDF.otherLine}" stroke-width="1.5"></line>${bars}</svg>`, bucket, peakKey: peak >= 0 ? keys[peak] : null };
  }

  /** Slide 4: matriks kelompok x hari; heat satu hue teal 4 tingkat; angka tertulis di tiap sel, nol = "·". Lebih dari 11 kelompok: 10 teratas + Lainnya. */
  function groupMatrixSlide(dv) {
    const build = bucket => E.pivot(dv.rows, { by: "date", from: dv.from, to: dv.to, bucket, names: dv.users, objectOrder: dv.order });
    const maxOf = p => Math.max(1, ...p.groups.flatMap(g => Object.values(g.subtotal.cells)));
    let bucket = E.slideBucket(dv.from, dv.to, 16), p = build(bucket);
    if (maxOf(p) >= 1000) { bucket = E.slideBucket(dv.from, dv.to, 10); p = build(bucket); }
    const gt = E.grandTotal(p), pc = p.cols.length, unit = bucket === "day" ? "hari" : bucket === "week" ? "minggu (mulai Senin)" : "bulan";
    const all = p.groups.map(g => ({ name: g.group, cells: g.subtotal.cells, total: g.subtotal.total })).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    let rows = all;
    if (all.length > 11) {
      const rest = all.slice(10), cells = {}; let total = 0;
      for (const g of rest) { total += g.total; for (const k in g.cells) cells[k] = (cells[k] || 0) + g.cells[k]; }
      rows = all.slice(0, 10).concat([{ name: `Lainnya (${rest.length})`, cells, total, other: true }]);
    }
    const max = Math.max(1, ...rows.filter(g => !g.other).flatMap(g => Object.values(g.cells)));
    // judul = kesimpulan: kolom puncak (tanpa kolom tanpa tanggal) + kelompok terbanyak di kolom itu
    const dated = p.cols.filter(c => c.key !== E.NO_DATE), pk = dated.reduce((b, c) => (gt.cells[c.key] || 0) > (b ? gt.cells[b.key] || 0 : -1) ? c : b, null);
    let title = "Kelompok dokumen per " + unit.replace(" (mulai Senin)", "");
    if (pk && gt.cells[pk.key]) { title = `Puncak ${colLabel(pk.key, bucket)}: ${nf(gt.cells[pk.key])} dokumen`; }
    const heads = pdfHeads(p.cols);
    const w = Math.floor(185 / Math.max(1, pc)), cg = p.cols.map(() => `<col style="width:${w}mm">`).join("");
    const cell = (v, plain) => { const b = plain ? 0 : pdfHeat(v, max); if (plain && v) return `<td class="hm">${fmt(v)}</td>`; return b ? `<td class="hm" style="background:${PDF.heat[b - 1]}${b === 4 ? ";color:#fff" : ""}">${fmt(v)}</td>` : `<td class="hm">&middot;</td>`; };
    const body = rows.map(g => `<tr><td class="pt" style="font-size:16pt">${esc(g.name)}</td>${p.cols.map(c => cell(g.cells[c.key], g.other)).join("")}<td class="tt">${fmt(g.total)}</td></tr>`).join("");
    const foot = `<tr class="all"><td class="pt" style="font-size:16pt">Total semua</td>${p.cols.map(c => `<td class="hm">${gt.cells[c.key] ? fmt(gt.cells[c.key]) : "&middot;"}</td>`).join("")}<td class="tt">${fmt(gt.total)}</td></tr>`;
    return `<h2 class="p-ti">${esc(title + (bucket === "day" ? "" : ""))}</h2>${p.cols.some(c => c.key === E.NO_DATE) ? `<p class="p-etik sm">Kolom ? = dokumen tanpa tanggal.</p>` : ""}` +
      `<table class="p-t p-m"><colgroup><col style="width:66mm">${cg}<col></colgroup><thead><tr><th>Kelompok</th>${heads}<th>Total</th></tr></thead><tbody>${body}${foot}</tbody></table>`;
  }

  /** Header kolom tanggal dua baris (bulan hanya saat berganti / tanggal). */
  function pdfHeads(cols) {
    let prevMonth = "";
    return cols.map(c => {
      let top = "&nbsp;", bot = "?";
      if (c.key !== E.NO_DATE && isKey(c.key)) { const mo = E.fmtDateId(c.key, false).split(" ")[1]; top = mo !== prevMonth ? mo : "&nbsp;"; prevMonth = mo; bot = String(+c.key.slice(8, 10)); }
      else if (c.key !== E.NO_DATE) { top = c.key.slice(0, 4); bot = E.fmtDateId(c.key + "-01", false).split(" ")[1]; }
      return `<th style="padding:0 0.5mm"><span style="display:block;font-weight:500;color:${PDF.sub}">${top}</span>${bot}</th>`;
    }).join("");
  }

  /** Slide lanjutan "Dokumen per hari" (bentuk pivot Excel Query1, lengkap tanpa dipotong): Kelompok | Dokumen | hari | Grand Total; dipecah per 12 baris, header diulang, Total keseluruhan di slide terakhir. */
  function docSlides(dv) {
    const build = bucket => E.pivot(dv.rows, { by: "date", from: dv.from, to: dv.to, bucket, names: dv.users, objectOrder: dv.order });
    let bucket = E.slideBucket(dv.from, dv.to, 14), p = build(bucket);
    if (Math.max(1, ...p.groups.flatMap(g => g.objects.flatMap(o => Object.values(o.cells)))) >= 1000) { bucket = E.slideBucket(dv.from, dv.to, 10); p = build(bucket); }
    const m = E.docMatrix(p), total = m[m.length - 1], data = m.slice(1, -1), PER = 12, pc = p.cols.length;
    const max = Math.max(1, ...data.flatMap(r => r.slice(3, 3 + pc).map(Number)));
    const unit = bucket === "day" ? "hari" : bucket === "week" ? "minggu" : "bulan";
    const w = Math.floor(125 / Math.max(1, pc)), cg = p.cols.map(() => `<col style="width:${w}mm">`).join("");
    const heads = pdfHeads(p.cols), n = Math.max(1, Math.ceil(data.length / PER));
    const cell = v => { const b = pdfHeat(v, max); return b ? `<td class="hm" style="background:${PDF.heat[b - 1]}${b === 4 ? ";color:#fff" : ""}">${fmt(v)}</td>` : `<td class="hm">&middot;</td>`; };
    const out = [];
    for (let i = 0; i < n; i++) {
      const rows = data.slice(i * PER, (i + 1) * PER).map(r => `<tr><td class="pt">${esc(r[0])}</td><td class="pt">${esc(r[2])}</td>${r.slice(3, 3 + pc).map(cell).join("")}<td class="tt">${fmt(r[3 + pc])}</td></tr>`).join("");
      const foot = i === n - 1 ? `<tr class="all"><td class="pt" colspan="2">Total keseluruhan</td>${total.slice(3, 3 + pc).map(v => `<td class="hm">${v ? fmt(v) : "&middot;"}</td>`).join("")}<td class="tt">${fmt(total[3 + pc])}</td></tr>` : "";
      out.push({ html: `<h2 class="p-ti">Dokumen per ${unit}${n > 1 ? ` (${i + 1}/${n})` : ""}</h2><table class="p-t p-m p-doc"><colgroup><col style="width:44mm"><col style="width:58mm">${cg}<col></colgroup><thead><tr><th>Kelompok</th><th>Dokumen</th>${heads}<th>Grand Total</th></tr></thead><tbody>${rows}${foot}</tbody></table>` });
    }
    return out;
  }

  /** Slide 5: maks 4 poin (sumber, diambil pada + data sampai jam, filter, batasan + definisi). Tanpa warna. */
  function slideNotes() {
    const f = st.f, r = st.resp, tk = st.taken, td = E.iso(new Date(Date.UTC(tk.getFullYear(), tk.getMonth(), tk.getDate())));
    const li = [
      `Sumber: SAP Business One, ${r.companyName || r.company || ""}.`,
      `Diambil pada ${tk.toLocaleString("id-ID")}; data sampai pukul ${E.fmtTime(tk)}${r.to === td ? "; hari terakhir belum penuh" : ""}.`,
      `Filter aktif: ${filterText()}. User manager dan INTERFACE ${f.system ? "disertakan" : "dikecualikan"}; nama pengguna ${st.mask ? "disamarkan" : "ditampilkan apa adanya"}.`,
      `Dokumen = dokumen SAP yang dibuat pada periode, menurut tanggal buat. Dokumen yang dibatalkan belum disaring; persetujuan ${f.approval ? "ikut dihitung (pola penyetuju, belum terverifikasi)" : "tidak dihitung"}.`
    ];
    return `<h2 class="p-ti">Catatan dan batasan</h2><div class="p-note"><ul>${li.map(t => `<li>${esc(t)}</li>`).join("")}</ul></div>`;
  }

  /** Laporan slide 16:9: 5 slide (ringkas, kelompok, pengguna, matriks, catatan). Judul tiap slide = kesimpulan yang dihitung dari data. Mengembalikan [{html, notes}]. */
  function shareSlides(dv) {
    const k = E.kpis(dv.rows), has = k.documents > 0, slides = [], gs = E.groupStats(dv.rows), per = periodShort(dv.from, dv.to);
    if (!has) slides.push({ html: `${kopHtml(`Belum ada dokumen tercatat pada ${per}`, true)}<p class="p-empty p-nodata">Belum ada data untuk filter ini.</p>` });
    else {
      const bar = barSvg(dv), multi = k.activeDays > 1 && bar.peakKey;
      const title = `${nf(k.documents)} dokumen dibuat ${per}${multi ? `; puncak ${bar.bucket === "day" ? "" : bar.bucket === "week" ? "minggu " : ""}${colLabel(bar.peakKey, bar.bucket).replace("minggu mulai ", "")}` : ""}`;
      const ins = gs.length > 1 ? `Kelompok terbanyak: ${gs[0].group}, ${nf(gs[0].documents)} dokumen (${pct0(gs[0].pct)}).` : `Seluruhnya di kelompok ${gs[0].group}.`;
      slides.push({ html: `${kopHtml(title, true)}<div class="p-hero"><b>${nf(k.documents)}</b><span>${nf(k.activeUsers)} pengguna &middot; ${nf(k.objectsUsed)} jenis &middot; ${nf(k.activeDays)} hari aktif</span></div><div class="p-chart">${bar.svg}</div><p class="p-sum">${esc(ins)}</p>` });
      // slide 2: peringkat total periode (3 nada + Lainnya) + 10 dokumen terbanyak (netral)
      const rk = pdfRanks(gs), gmax = Math.max(rk.restDocs, gs[0].documents);
      const rowsG = rk.top.map((g, i) => [g.group, g.documents, g.pct, PDF.rank[i], ""]);
      if (rk.rest.length) rowsG.push([`Lainnya (${nf(rk.rest.length)} kelompok)`, rk.restDocs, rk.restPct, PDF.other, `;border:0.75pt solid ${PDF.otherLine}`]);
      const gl = rowsG.map(([n, d, p, c, x]) => `<div class="p-gr"><span class="l"><span>${esc(n)}</span><span><b>${nf(d)}</b> &middot; ${pct1(p)}</span></span><span class="p-bar"><i style="width:${(d / gmax * 100).toFixed(1)}%;background:${c}${x}"></i></span></div>`).join("");
      const to = E.topObjects(dv.rows, 10);
      const ttb = `<table class="p-t p-top"><colgroup><col style="width:78%"><col></colgroup><tbody>${to.map(o => `<tr><td class="pt">${esc(o.id)}</td><td class="r">${nf(o.counted)}</td></tr>`).join("")}</tbody></table>`;
      slides.push({ html: `<h2 class="p-ti">${esc(`${gs[0].group} ${pct0(gs[0].pct)} dari dokumen`)}</h2><div class="p-cols"><div><h2 class="p-h3">Per kelompok dokumen</h2>${gl}</div><div><h2 class="p-h3">10 dokumen terbanyak</h2>${ttb}</div></div>` });
      // slide 3: pengguna (nama asli bawaan) - 3 teratas + Lainnya, batang tipis teal
      const us = E.userStats(dv.rows, dv.names), kk = Math.min(3, us.length), topU = us.slice(0, kk), restU = us.slice(kk);
      const topSum = topU.reduce((t, u) => t + u.counted, 0), restSum = restU.reduce((t, u) => t + u.counted, 0), umax = Math.max(topU[0].counted, restSum);
      const ur = topU.map(u => [esc(u.name), u.counted, PDF.accent]).concat(restU.length ? [[`Lainnya (${nf(restU.length)} pengguna)`, restSum, PDF.day]] : [])
        .map(([n, c, col]) => `<tr><td class="pt">${n}</td><td><span class="p-bar" style="height:2.5mm"><i style="width:${(c / umax * 100).toFixed(1)}%;background:${col}"></i></span></td><td class="r">${nf(c)}</td><td class="r">${pct1(c / k.documents * 100)}</td></tr>`).join("");
      slides.push({ html: `<h2 class="p-ti">${esc(`${kk} dari ${nf(us.length)} pengguna mencatat ${pct0(topSum / k.documents * 100)} dokumen`)}</h2><p class="p-etik">${esc(NOTE)}</p><table class="p-t p-u"><colgroup><col style="width:38%"><col style="width:30%"><col style="width:16%"><col></colgroup><thead><tr><th>Pengguna</th><th></th><th class="r">Dokumen</th><th class="r">%</th></tr></thead><tbody>${ur}</tbody></table>` });
      slides.push({ html: groupMatrixSlide(dv) });
      slides.push(...docSlides(dv));
    }
    slides.push({ notes: true, html: slideNotes() });
    return slides;
  }

  const reportCtx = dv => { const r = st.resp; return { dv, resp: r, taken: st.taken, company: r.companyName || r.company || "", filterText: filterText(), mask: st.mask, version: VERSION, note: NOTE }; };
  async function exportPng() {
    setStatus("Membuat PNG…");
    const { html, width } = RP.reportHtml(reportCtx(derive())), out = await RP.renderPng(html, width), n = out.blobs.length;
    // Chrome menolak unduhan otomatis beruntun yang terlalu rapat; beri jeda antar file.
    for (let i = 0; i < n; i++) {
      if (i) await new Promise(r => setTimeout(r, 900));
      download(out.blobs[i], `count-document_${st.resp.from}_${st.resp.to}${n > 1 ? `_bagian-${i + 1}-dari-${n}` : ""}.png`);
    }
    setStatus(`PNG selesai: ${out.width} x ${out.height} px (skala 2x)${n > 1 ? `, dibagi ${n} gambar (1: ringkasan + grafik, 2: tabel), siap dikirim berurutan` : ""}.`);
  }
  function printReport() {
    const tpl = st.template, dv = derive(), k = E.kpis(dv.rows);
    let html, size, margin = "12mm", slide = false;
    if (tpl === "png") {
      const rp = RP.reportHtml(reportCtx(dv)); html = rp.html;
      size = `${rp.width}px ${RP.measureReport(html)}px`; margin = "0";
      slide = true;
    } else if (tpl === "share") {
      const sl = shareSlides(dv), N = sl.length;
      html = sl.map((x, i) => `<section class="p-slide">${x.html}<div class="p-foot"><span>${esc(VERSION)} &middot; Sumber: SAP Business One</span><span class="p-pg">${i + 1} / ${N}</span></div></section>`).join("");
      size = "297mm 167mm"; margin = "0"; slide = true;
    } else if (tpl === "matrix") {
      html = kopHtml("Laporan Aktivitas Dokumen SAP (matriks)") + `<p class="p-sum">${esc(E.buildSummary(dv.rows, dv.from, dv.to))}</p>` +
        (k.documents ? printMatrix(dv, st.view === "user" ? "user" : "date") : `<p class="p-empty">Tidak ada data untuk filter ini.</p>`) + notesHtml(dv, "Catatan", true);
      size = "A4 landscape";
    } else {
      const head = kopHtml("Count Document (internal)");
      const kp = `<div class="p-kpi">${[["Jumlah dokumen", k.documents], ["User aktif", k.activeUsers], ["Jenis dokumen terpakai", k.objectsUsed], ["Hari aktif", k.activeDays]].map(([l, v]) => `<div><b>${fmt(v)}</b>${esc(l)}</div>`).join("")}</div>`;
      const note = notesHtml(dv, "Catatan", true);
      if (isPv()) html = head + printMatrix(dv, byOf()) + note;
      else {
        const rows = E.tableRows(dv.rows, dv.names);
        html = head + kp + `<table class="p-t p-grid"><thead><tr><th>Kelompok</th><th>Dokumen</th><th>Peran</th><th>Jenis tanggal</th><th>Tanggal</th><th>User</th><th>Status</th><th class="r">Jumlah</th></tr></thead><tbody>${rows.map(x =>
          `<tr><td>${esc(x.group)}</td><td>${esc(x.objId)}</td><td>${esc(x.role)}</td><td>${esc(x.dateKind)}</td><td>${esc(x.date)}</td><td>${esc(x.user)}</td><td>${esc(stLabel(x.status))}</td><td class="r">${fmt(x.counted)}</td></tr>`).join("")}</tbody></table>` + note;
      }
      size = "A4 landscape";
    }
    printEl.innerHTML = html;
    const sty = document.createElement("style");
    sty.textContent = slide ? `@page { size: ${size}; margin: ${margin}; }` : `@page { size: ${size}; margin: ${margin}; @bottom-right { content: "Halaman " counter(page) " dari " counter(pages); font: 8pt system-ui, sans-serif; color: #444; } @bottom-left { content: "${VERSION}"; font: 8pt system-ui, sans-serif; color: #444; } }`;
    document.head.append(sty);
    const done = () => { printEl.innerHTML = ""; sty.remove(); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
  }

  // ---------- interaksi ----------
  let cross = null;
  const clearCross = () => { if (!cross) return; cross.row.classList.remove("cd-hr"); cross.cells.forEach(c => c.classList.remove("cd-hc")); cross = null; };
  function setCross(td) {
    if (cross && cross.td === td) return;
    clearCross();
    const tb = td.closest("table"), idx = td.cellIndex, cells = [];
    tb.querySelectorAll("tr").forEach(r => { const c = r.cells[idx]; if (c && c !== td) { c.classList.add("cd-hc"); cells.push(c); } });
    td.parentElement.classList.add("cd-hr"); cross = { td, row: td.parentElement, cells };
  }
  root.addEventListener("mouseover", ev => { const td = ev.target.closest && ev.target.closest("td.n[data-o]"); if (td) setCross(td); else if (cross && !(ev.target.closest && ev.target.closest(".cd-m"))) clearCross(); });
  root.addEventListener("mouseleave", clearCross);
  root.addEventListener("focusin", ev => { const td = ev.target.closest && ev.target.closest("td.n[data-o]"); if (td) setCross(td); else clearCross(); });

  root.addEventListener("click", ev => {
    const t = ev.target;
    root.querySelectorAll("details.cd-pop[open]").forEach(d => { if (!d.contains(t)) d.open = false; });
    const td = t.closest && t.closest("td.n[data-o]"); if (td) return openDetail(td);
    if (t.id === "cd-scrim") return closeDetail();
    const b = t.closest && t.closest("button"); if (!b || b.disabled) return;
    if (b.id === "cd-go") return void load();
    if (b.dataset.p) { const p = E.preset(b.dataset.p); $("#cd-from").value = p.from; $("#cd-to").value = p.to; return; }
    if (!st.data) return;
    if (b.dataset.gn) {
      const g = b.dataset.gn, cur = st.f.groups;
      if (ev.ctrlKey || ev.shiftKey || ev.metaKey) { const i = cur.indexOf(g); i < 0 ? cur.push(g) : cur.splice(i, 1); }
      else st.f.groups = cur.length === 1 && cur[0] === g ? [] : [g];
      st.page = 0; return update();
    }
    if (b.dataset.act === "edit") { st.edit = !st.edit; syncSrc(); b.textContent = st.edit ? "Tutup" : "Ubah"; b.setAttribute("aria-expanded", st.edit); return; }
    if (b.dataset.act === "close-detail") return closeDetail();
    if (b.dataset.act === "reset") { st.f = { groups: [], q: "", status: "", system: false, approval: false }; st.page = 0; return paint(); }
    if (b.dataset.tg) { const g = b.dataset.tg, tb = b.closest("tbody"), col = !st.collapsed.has(g); col ? st.collapsed.add(g) : st.collapsed.delete(g); tb.classList.toggle("cd-col", col); b.setAttribute("aria-expanded", !col); b.setAttribute("aria-label", `${col ? "Buka" : "Ciutkan"} ${g}`); return; }
    if (b.dataset.sk) { const k = b.dataset.sk, s = st.sort; st.sort = s.key !== k ? { key: k, dir: "desc" } : s.dir === "desc" ? { key: k, dir: "asc" } : { key: null, dir: null }; return renderView(); }
    if (b.dataset.v) return setView(b.dataset.v);
    if (b.dataset.dens) { st.dense = b.dataset.dens; wr(DENS_KEY, st.dense); root.classList.toggle("comfy", st.dense === "comfy"); root.querySelectorAll("[data-dens]").forEach(x => x.setAttribute("aria-pressed", x.dataset.dens === st.dense)); return; }
    if (b.dataset.pg) { st.page += +b.dataset.pg; return renderView(); }
    if (b.dataset.x) { try { if (b.dataset.x === "png") exportPng().catch(e => setStatus(`Ekspor gagal: ${e.message}`, true)); else b.dataset.x === "pdf" ? printReport() : exportFile(b.dataset.x); } catch (e) { setStatus(`Ekspor gagal: ${e.message}`, true); } }
  });
  root.addEventListener("change", ev => {
    const t = ev.target, k = t.dataset && t.dataset.f; if (!k || !st.data) return;
    if (k === "tpl") { st.template = t.value; ssSet(TPL_KEY, t.value); return; }
    if (k === "mask") { st.mask = t.checked; ssSet(MASK_KEY, t.checked ? "1" : "0"); return update(); }
    if (k === "system" || k === "approval") st.f[k] = t.checked; else st.f[k] = t.value;
    st.page = 0; update();
  });
  let qTimer = null;
  root.addEventListener("input", ev => {
    if (!ev.target || ev.target.id !== "cd-q") return;
    clearTimeout(qTimer); const v = ev.target.value;
    qTimer = setTimeout(() => { st.f.q = v; st.page = 0; update(); }, 150);
  });
  root.addEventListener("toggle", ev => { if (ev.target.id === "cd-help") st.help = ev.target.open; }, true);
  // sel: Enter/Spasi membuka rincian; panah memindahkan fokus antar angka (roving tabindex), melewati kelompok yang diciutkan
  root.addEventListener("keydown", ev => {
    if (ev.key === "Escape") { if (st.detail) { ev.preventDefault(); closeDetail(); } root.querySelectorAll("details.cd-pop[open]").forEach(d => { d.open = false; }); return; }
    const td = ev.target.closest && ev.target.closest("td.n[data-o]");
    if (td) {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); return openDetail(td); }
      const dir = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[ev.key]; if (!dir) return;
      ev.preventDefault();
      const tbl = td.closest("table"), first = tbl.classList.contains("has-no") ? 3 : 2;
      const rows = [...tbl.querySelectorAll("tbody:not(.cd-col) tr.o")]; let ri = rows.indexOf(td.parentElement), ci = td.cellIndex;
      for (;;) {
        ri += dir[0]; ci += dir[1];
        const r = rows[ri]; if (!r || ci < first || ci >= r.cells.length) return;
        const c = r.cells[ci]; if (c.dataset && c.dataset.o) { td.tabIndex = -1; c.tabIndex = 0; c.focus(); return; }
      }
    }
    const tb = ev.target.closest && ev.target.closest('[role="tab"]'); if (!tb || (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft")) return;
    const ids = TABS.map(x => x[0]), i = ids.indexOf(st.view), n = (i + (ev.key === "ArrowRight" ? 1 : -1) + ids.length) % ids.length;
    ev.preventDefault(); setView(ids[n]); const nt = $(`#cd-tab-${ids[n]}`); if (nt) nt.focus();
  });

  // ---------- awal ----------
  (async () => {
    try {
      const [cos, meta] = await Promise.all([api("companies"), api("meta")]);
      st.companies = cos.companies || []; st.meta = meta;
      $("#cd-co").innerHTML = st.companies.map(c => `<option value="${esc(c.schema)}">${esc(c.name || c.schema)}</option>`).join("");
      if (!st.companies.length) setStatus("Tidak ada company yang bisa dipilih.", true);
    } catch (e) {
      setStatus(`${e.message}${e.code ? ` (kode ${e.code})` : ""}`, true); $("#cd-go").disabled = true;
    }
  })();
  return { st, load };
}
