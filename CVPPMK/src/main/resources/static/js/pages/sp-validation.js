// 4.4 Stored procedure di company ini + breakdown SBO_SP_TransactionNotification / SBO_SP_PostTransactionNotice per object.
// Sumber: DB di config aplikasi (sql/sp-validation). Cara breakdown: sp-parse.js. Penjelasan bahasa awam (opsional): sp-rules.js.
import { $, $$, esc, rowsOf, section, searchable, onMount, OBJECTS as SAP_OBJECTS } from "../ui.js";
import { parseSp } from "./sp-parse.js";
import { OBJECTS as NOTES, MODULES } from "./sp-rules.js";

// procedure bawaan SAP B1 (dibuat saat company dibuat / upgrade / analytics). SBO_SP_* selalu tampil.
const SAP_BUILTIN = /^(_?TMSP|TMPSP|ATP_|CFF_|CRSP_|DWZ_|COCKPIT_|B1CFL|MOBILE_KPI_|MOBILE_SERVICETICKET_|AFL_|BGT\d|BUDGET_ANALYSIS|CINF_|CS[IV]\d|DA_|DP_|ETL_|PAL\w+_PROC$|SBO_GETNEXTAUTOKEY$|SP_PROCEDURE_PARAMS_ROWSET$)|_(DELTA|INIT)$/i;
const PROC = { TN: "SBO_SP_TRANSACTIONNOTIFICATION", POST: "SBO_SP_POSTTRANSACTIONNOTICE" };
const PROC_LABEL = { TN: "TransactionNotification", POST: "PostTransactionNotice" };
const TEMPLATE_LEN = 1500;   // template kosong bawaan SAP ~900 karakter

const kindOf = n => /^SBO_SP_/i.test(n) ? "SBO (dipanggil SAP)" : /^(STEM|ST)_/i.test(n) ? "Add-on STEM" : "Lainnya";
const kpis = list => `<div class="kpis">${list.map(([n, l, c]) => `<div class="kpi ${c || ""}"><b>${n.toLocaleString("id-ID")}</b><span>${esc(l)}</span></div>`).join("")}</div>`;
const MOD = [["Penjualan", /^(13|14|15|16|17|23|24|203|112)$/], ["Pembelian", /^(18|19|20|21|22|46|204|1470000113|540000006)$/],
  ["Inventory & Produksi", /^(59|60|67|202|1250000001|10000071|1470000065)$/], ["Master Data", /^(1|2|4|64)$/],
  ["Mobile", /^MOBILE_/], ["Bonus Add-on", /^STEM_(BNS|TEAMASSIGN|BONUSPROC)/], ["Add-on Breeding", /^STEM_/]];
const moduleOf = (t, note) => note?.module || (MOD.find(([, re]) => re.test(t)) || ["Lainnya"])[0];
const noteObj = t => NOTES.find(o => o.type === t || (o.types || []).includes(t));
const prettyType = t => t.replace(/^MOBILE_/, "Mobile ").replace(/^STEM_/, "");

// ---------- gabungkan hasil parser dengan penjelasan ----------
function build(d) {
  const defs = Object.fromEntries(rowsOf(d.sbo).map(r => [r.Name, r.Definition || ""]));
  const params = Object.fromEntries(rowsOf(d.params).map(r => [r.U_Key, r.U_Value]));
  const objs = new Map();
  for (const [key, name] of Object.entries(PROC)) {
    if (!defs[name] || defs[name].length < TEMPLATE_LEN) continue;
    const res = parseSp(defs[name], key);
    for (const r of res.rules) for (const t of r.types) {
      const o = objs.get(t) || objs.set(t, { type: t, rules: [], blocks: [] }).get(t);
      o.rules.push({ ...r, type: t });
    }
    for (const b of res.objects) if (objs.has(b.type)) objs.get(b.type).blocks.push(...b.blocks);
  }
  for (const o of objs.values()) {
    const n = noteObj(o.type), used = new Set();
    o.note = n;
    o.name = n?.types ? `${n.name}: ${prettyType(o.type)}` : n?.name || (/^\d+$/.test(o.type) && SAP_OBJECTS[o.type]) || titleOf(o.blocks) || prettyType(o.type);
    o.module = moduleOf(o.type, n);
    o.tables = n?.tables || "";
    o.rules.forEach(r => {
      const hit = n && n.rules.find((x, i) => !used.has(i) && x.k === r.kind && r.code.includes(x.anchor) && used.add(i));
      r.ex = hit || null;
      r.params = [...new Set([...r.params, ...(hit?.param || [])])].map(k => ({ k, v: params[k] }));
      r.title = hit?.name || r.name || (r.kind === "val" ? short(r.msg) : stmtTitle(r.stmts[0]));
    });
    o.matched = o.rules.some(r => r.ex);
    // temuan otomatis
    o.auto = [];
    // penjagaan di cabang ELSE saling eksklusif dengan cabang sebelumnya, jadi tidak saling menimpa
    const tn = o.rules.filter(r => r.kind === "val" && !r.off && r.proc === "TN" && !r.conds.some(c => c.startsWith("selain:")));
    if (tn.length > 1) o.auto.push("Kalau lebih dari satu penjagaan gagal, user hanya melihat pesan yang terakhir: semua cek tetap dijalankan dan setiap error menimpa pesan sebelumnya.");
    const odd = o.rules.filter(r => r.legendOff !== null && r.legendOff !== undefined && r.legendOff !== r.off);
    if (odd.length) o.auto.push(`Daftar komentar di atas blok SP tidak sesuai dengan kodenya: ${odd.map(r => `No ${r.no} ${r.legendOff ? "ditandai dimatikan, padahal kodenya aktif" : "ditandai aktif, padahal kodenya di-comment"}`).join("; ")}.`);
  }
  return { defs, objs: [...objs.values()].sort((a, b) => MODULES.concat("Lainnya").indexOf(a.module) - MODULES.concat("Lainnya").indexOf(b.module) || a.rules[0].line - b.rules[0].line) };
}
const titleOf = blocks => { const t = (blocks.find(b => b.title) || {}).title || ""; return t ? t.toLowerCase().replace(/(^|[\s/])\w/g, c => c.toUpperCase()) : ""; };
const short = m => { const s = m.replace(/^\[ERROR SP\]\s*:\s*/i, ""); return s.length > 70 ? s.slice(0, 67) + "…" : s; };
const stmtTitle = s => { const m = s.match(/^(UPDATE|INSERT\s+INTO|MERGE\s+INTO|CALL)\s+("?[\w@.]+"?)/i); return m ? `${m[1].toUpperCase()} ${m[2].replace(/"/g, "")}` : s.slice(0, 50); };
const dedent = code => { const ls = code.split("\n"), ind = Math.min(...ls.filter(l => l.trim()).map(l => l.match(/^[\t ]*/)[0].replace(/ {4}/g, "\t").length)); return ls.map(l => l.replace(/ {4}/g, "\t").slice(ind)).join("\n").replace(/\t/g, "  "); };
const msgHtml = m => esc(m).replace(/\{(\w+)\}/g, `<em class="sp-var">{$1}</em>`);
const normSearch = s => s.toLowerCase().replace(/\[error sp\]\s*:?/g, "").replace(/\{\w+\}|\d+/g, "#").replace(/\s+/g, " ").trim();

// ---------- tampilan ----------
function card(o, r) {
  const ex = r.ex, val = r.kind === "val";
  const hay = normSearch([o.name, o.type, r.title, ex?.syarat || "", r.msg || "", (r.stmts || []).join(" "), r.conds.join(" "), r.params.map(p => p.k).join(" ")].join(" | "));
  const conds = r.conds.length ? `<ul class="sp-conds">${r.conds.map(c => `<li><code>${esc(c)}</code></li>`).join("")}</ul>` : `<p class="muted">Tanpa syarat tambahan.</p>`;
  return `<article class="sp-card${val ? "" : " proc"}${r.off ? " off" : ""}" data-kind="${r.kind}" data-on="${r.off ? "off" : "on"}" data-when="${esc(r.when.join(","))}" data-q="${esc(hay)}">
    <div class="sp-ct"><h4>${r.no ? `<span class="no">${esc(r.no)}</span>` : ""}${esc(r.title)}</h4>
      <span class="badge ${r.off ? "" : "yes"}">${r.off ? "Dimatikan" : "Aktif"}</span></div>
    ${ex?.syarat ? `<div><div class="sp-lbl">${val ? "Kapan diblok" : "Kapan jalan"}</div><p>${esc(ex.syarat)}</p></div>` : ""}
    ${val ? `<div><div class="sp-lbl">Pesan yang tampil</div><div class="sp-msg"><code>${msgHtml(r.msg)}</code><button type="button" class="sp-copy" data-copy="${esc(r.msg)}">Salin</button></div></div>`
      : `<div><div class="sp-lbl">Yang dilakukan</div><div class="sp-does">${ex?.does || r.stmts.map(s => `<code>${esc(s.length > 160 ? s.slice(0, 157) + "…" : s)}</code>`).join("<br>")}</div></div>`}
    ${!ex ? `<div><div class="sp-lbl">Kondisi (dari kode)</div>${conds}</div>` : ""}
    <div class="sp-tags">${r.when.length ? r.when.map(w => `<span class="sp-tag">${esc(w)}</span>`).join("") : `<span class="sp-tag">Semua transaksi</span>`}
      ${r.params.map(p => `<span class="sp-tag mono" title="@ST_PARAM">${esc(p.k)} = <b>${p.v === undefined ? "belum ada" : esc(p.v === "" ? "(kosong)" : p.v)}</b></span>`).join("")}</div>
    ${ex ? `<details><summary>Kondisi teknis</summary><div>${ex.kondisi ? `<p>${ex.kondisi}</p>` : ""}${conds}</div></details>` : ""}
    <details><summary>Lihat kode</summary><div><span class="muted">${PROC_LABEL[r.proc]} · baris ${r.start}–${r.end}</span><pre>${esc(dedent(r.code))}</pre></div></details>
  </article>`;
}

function objBlock(o) {
  const v = o.rules.filter(r => r.kind === "val"), p = o.rules.filter(r => r.kind === "proc");
  const on = v.filter(r => !r.off).length, off = o.rules.filter(r => r.off).length;
  const where = [...new Set(o.blocks.map(b => `${PROC_LABEL[b.proc]} baris ${b.line}`))].slice(0, 4).join(" · ");
  const notes = [...o.auto, ...(o.matched && o.note?.notes || [])];
  return `<section class="sp-obj" data-obj="${esc(o.type)}">
    <div class="sp-oh"><div><b>${esc(o.name)}</b> <span class="raw">object ${esc(o.type)}${o.tables ? " · " + esc(o.tables) : ""}</span></div>
      <div class="sp-badges"><span class="badge danger">${on} penjagaan aktif</span>${off ? `<span class="badge">${off} dimatikan</span>` : ""}${p.length ? `<span class="badge info">${p.length} proses otomatis</span>` : ""}</div></div>
    <div class="src">${esc(where)}</div>
    ${notes.map(n => `<div class="callout warn"><span class="ci">!</span><div class="ct">${n}</div></div>`).join("")}
    ${v.length ? `<div class="sp-grp danger">Penjagaan <span>memblok dokumen dan menampilkan pesan</span></div><div class="sp-cards">${v.map(r => card(o, r)).join("")}</div>` : ""}
    ${p.length ? `<div class="sp-grp info">Proses otomatis <span>jalan sendiri saat dokumen disimpan</span></div><div class="sp-cards">${p.map(r => card(o, r)).join("")}</div>` : ""}
  </section>`;
}

function procList(d, defs) {
  const all = rowsOf(d.procs), mine = all.filter(p => /^SBO_SP_/i.test(p.Name) || !SAP_BUILTIN.test(p.Name));
  const sboText = Object.values(defs).join("\n").toUpperCase();
  const rows = mine.map(p => ({ ...p, Jenis: kindOf(p.Name),
    Catatan: /^SBO_SP_/i.test(p.Name) && +p.Len < TEMPLATE_LEN ? "Masih template kosong bawaan SAP"
      : !/^SBO_SP_/i.test(p.Name) && sboText.includes(p.Name.toUpperCase()) ? "Dipanggil dari SBO_SP" : "" }));
  return section("sp-list", "SP yang terdaftar di company ini",
    kpis([[mine.length, "SP di luar bawaan SAP"], [mine.filter(p => /^SBO_SP_/i.test(p.Name)).length, "SBO_SP (dipanggil SAP)"], [mine.filter(p => /^(STEM|ST)_/i.test(p.Name)).length, "Add-on STEM"], [all.length - mine.length, "Bawaan SAP (disembunyikan)"]])
    + searchable("sp-procs", [{ key: "Name", label: "Nama", fmt: v => `<code>${esc(v)}</code>` }, { key: "Jenis", label: "Jenis" },
      { key: "Created", label: "Dibuat" }, { key: "Len", label: "Panjang (karakter)", num: 1, fmt: v => (+v).toLocaleString("id-ID") }, { key: "Catatan", label: "Catatan" }],
      rows, { filterKey: "Jenis", filterLabel: "jenis" }),
    { lead: "Procedure bawaan SAP B1 (TMSP, ATP, CRSP, analytics, dan sejenisnya) tidak ditampilkan, kecuali SBO_SP_* yang dipanggil SAP setiap kali dokumen disimpan." });
}

function breakdown(objs) {
  if (!objs.length) return section("sp-rules", "Breakdown per object", `<div class="callout info"><span class="ci">i</span><div class="ct">SBO_SP_TransactionNotification dan SBO_SP_PostTransactionNotice di company ini belum berisi aturan (masih template SAP), jadi belum ada yang bisa dipecah.</div></div>`);
  const all = objs.flatMap(o => o.rules);
  const chips = (id, label, opts) => `<div class="sp-fg" data-f="${id}"><span>${label}</span>${opts.map(([v, l], i) => `<button type="button" class="sp-chip" data-v="${v}" aria-pressed="${i === 0}">${l}</button>`).join("")}</div>`;
  onMount(() => {
    const box = $("#sp-bd"); if (!box) return;
    const st = { kind: "all", on: "all", when: "all" }, q = $("input", box), cnt = $(".count", box);
    const draw = () => {
      const t = normSearch(q.value), words = t ? t.split(" ") : [];
      let n = 0;
      $$(".sp-card", box).forEach(c => {
        const ok = (st.kind === "all" || c.dataset.kind === st.kind) && (st.on === "all" || c.dataset.on === st.on)
          && (st.when === "all" || c.dataset.when.split(",").includes(st.when)) && words.every(w => c.dataset.q.includes(w));
        c.hidden = !ok; if (ok) n++;
      });
      $$(".sp-obj", box).forEach(o => { o.hidden = !$(".sp-card:not([hidden])", o); $$(".sp-grp", o).forEach(g => { g.hidden = !$(".sp-card:not([hidden])", g.nextElementSibling); }); });
      $$(".sp-mod", box).forEach(m => { m.hidden = !$(".sp-obj:not([hidden])", m); });
      cnt.textContent = `${n} dari ${all.length} aturan`;
    };
    q.oninput = draw;
    box.addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.copy !== undefined) {
        const done = () => { b.textContent = "Tersalin"; setTimeout(() => { b.textContent = "Salin"; }, 1400); };
        (navigator.clipboard ? navigator.clipboard.writeText(b.dataset.copy) : Promise.reject()).then(done, () => {
          const r = document.createRange(); r.selectNodeContents(b.previousElementSibling); getSelection().removeAllRanges(); getSelection().addRange(r); });
        return;
      }
      const g = b.closest(".sp-fg"); if (!g) return;
      st[g.dataset.f] = b.dataset.v; $$(".sp-chip", g).forEach(x => x.setAttribute("aria-pressed", x === b)); draw();
    });
    draw();
  });
  const mods = MODULES.concat("Lainnya").filter(m => objs.some(o => o.module === m));
  return section("sp-rules", "Breakdown per object",
    kpis([[objs.length, "Object"], [all.filter(r => r.kind === "val" && !r.off).length, "Penjagaan aktif", "danger"], [all.filter(r => r.off).length, "Dimatikan"], [all.filter(r => r.kind === "proc").length, "Proses otomatis", "info"]])
    + `<div id="sp-bd"><div class="sp-bar"><div class="toolbar"><input type="search" placeholder="Tempel pesan error, atau cari object / field / parameter…" aria-label="Cari aturan"><span class="count"></span></div>
      <div class="sp-filters">${chips("kind", "Jenis", [["all", "Semua"], ["val", "Penjagaan"], ["proc", "Proses otomatis"]])}${chips("on", "Status", [["all", "Semua"], ["on", "Aktif"], ["off", "Dimatikan"]])}${chips("when", "Berlaku", [["all", "Semua"], ["Add", "Add"], ["Update", "Update"], ["Cancel", "Cancel"]])}</div></div>`
    + mods.map(m => `<div class="sp-mod">${section(`sp-${m.toLowerCase().replace(/[^a-z]+/g, "-")}`, m, objs.filter(o => o.module === m).map(objBlock).join(""), { level: 3 })}</div>`).join("") + `</div>`,
    { lead: "Isi SBO_SP_TransactionNotification (penjagaan: memblok dokumen dan menampilkan pesan) dan SBO_SP_PostTransactionNotice (proses otomatis setelah dokumen tersimpan), dipecah per object langsung dari procedure di DB. Kalau ada lebih dari satu penjagaan yang gagal, user hanya melihat pesan yang terakhir." });
}

export const SP_PAGE = {
  lead: "Stored procedure buatan sendiri yang terdaftar di company ini, dan isi SP yang dipanggil SAP setiap kali dokumen disimpan: per object, kondisinya, berlaku saat apa, pesan yang tampil, dan statusnya.",
  menu: "Database HANA › Procedures",
  tables: ["SYS.PROCEDURES", "@ST_PARAM"],
  checks(d) {
    const out = [], defs = Object.fromEntries(rowsOf(d.sbo).map(r => [r.Name, r.Definition || ""]));
    for (const [k, n] of Object.entries(PROC)) {
      if (!(n in defs)) out.push(["warn", `${n} tidak ditemukan di company ini.`]);
      else if (defs[n].length < TEMPLATE_LEN) out.push(["warn", `${n} masih template bawaan SAP, belum ada ${k === "TN" ? "penjagaan" : "proses otomatis"}.`]);
    }
    return out;
  },
  render(d) {
    const { defs, objs } = build(d);
    return procList(d, defs) + breakdown(objs)
      + section("sp-src", "Isi procedure lengkap", Object.entries(defs).map(([n, def]) => `<details class="grp"><summary><span><code>${esc(n)}</code></span><span class="muted">${def.split("\n").length.toLocaleString("id-ID")} baris</span></summary>
        <pre class="proc-src">${esc(def)}</pre></details>`).join(""), { lead: "Teks asli dari DB, untuk dicocokkan dengan breakdown di atas." });
  }
};
