// Section "Addon STEM" dan "Addon Farm Breeding" yang ditempel ke halaman yang sudah ada, tanpa mengubah kode halamannya:
//   5.2 UDT (tabel + parameter @ST_PARAM), 5.3 UDF (field), 4.4 Validasi SP (procedure + function).
// Membandingkan yang DIHARAPKAN addon (addon-data.js) dengan isi DB (sql/<halaman>/*addon*.sql). Semua query baca saja.
// Status: ok = sesuai, warn = ada tapi perlu diisi, danger = belum ada, none = opsional.
import { esc, rowsOf, section, searchable } from "../ui.js";
import { ADDONS } from "./addon-data.js";

const kpis = list => `<div class="kpis">${list.map(([n, l]) => `<div class="kpi"><b>${n.toLocaleString("id-ID")}</b><span>${esc(l)}</span></div>`).join("")}</div>`;
const LABEL = { ok: ["yes", "Siap"], warn: ["warn", "Perlu diisi"], danger: ["danger", "Belum ada"], none: ["", "Opsional"] };
const badge = s => `<span class="badge ${LABEL[s.t][0]}">${esc(s.text || LABEL[s.t][1])}</span>`;
const code = v => `<code>${esc(v)}</code>`;
const upper = v => String(v ?? "").toUpperCase();
const count = (rows, t) => rows.filter(r => r.status.t === t).length;
const order = { danger: 0, warn: 1, none: 2, ok: 3 };
const byStatus = rows => rows.slice().sort((a, b) => order[a.status.t] - order[b.status.t]);
const statusCol = { key: "status", label: "Status", fmt: badge };
const missingOpt = { t: "none", text: "Opsional, belum ada" };

// query gagal (mis. login HANA ditolak): pesan errornya sudah tampil di atas halaman, jangan tampilkan hitungan palsu
const failed = (d, keys) => keys.some(k => !d[k] || d[k].error);
const NOTICE = `<p class="sec-lead">Belum bisa dibandingkan karena data dari DB gagal dibaca. Perbaiki dulu pesan error di atas, lalu klik Muat ulang.</p>`;

const summary = (rows, noun) => kpis([[rows.length, noun], [count(rows, "ok"), "Siap"], [count(rows, "warn"), "Perlu diisi"], [count(rows, "danger"), "Belum ada"]]);

// ---------- pembanding ----------
const paramRows = (a, d) => {
  const db = new Map(rowsOf(d.addon_params).map(r => [upper(r.U_Key), r]));
  return a.PARAMS.map(([key, group, level, desc]) => {
    const hit = db.get(key), blank = !hit || String(hit.U_Value ?? "").trim() === "";
    const status = !hit ? (level === "w" ? { t: "danger" } : missingOpt)
      : blank ? (level === "w" ? { t: "warn" } : { t: "none", text: "Opsional, kosong" }) : { t: "ok" };
    return { status, Key: key, Group: group, Desc: desc, Value: hit ? hit.U_Value : "" };
  });
};
const tableRows = (a, d) => {
  const db = new Map(rowsOf(d.addon_rows).map(r => [upper(r.Name), r]));
  return a.TABLES.map(([name, by, needsData, usedBy, note]) => {
    const hit = db.get("@" + name), n = hit ? +hit.Rows : null;
    const status = !hit ? { t: "danger" } : needsData && n === 0 ? { t: "warn", text: "Kosong" } : { t: "ok" };
    return { status, Name: name, By: by, Used: usedBy, Rows: n, Note: note };
  });
};
const udfRows = (a, d) => {
  const db = new Set(rowsOf(d.addon_udf).map(r => `${upper(r.TableID)}.${upper(r.AliasID)}`));
  return a.UDFS.map(([tbl, alias, why]) => ({
    status: db.has(`${upper(tbl)}.${upper(alias)}`) ? { t: "ok" } : { t: "danger" }, Table: tbl, Field: "U_" + alias, Used: why
  }));
};
const procRows = (a, d) => {
  const db = new Map([...rowsOf(d.addon_procs), ...rowsOf(d.addon_funcs)].map(r => [upper(r.Name), r]));
  return a.PROCS.map(([name, kind, usedBy, file, level]) => ({
    status: db.has(upper(name)) ? { t: "ok" } : level === "w" ? { t: "danger" } : missingOpt,
    Name: name, Kind: kind === "SP" ? "Procedure" : "Function", Used: usedBy, File: file
  }));
};

// ---------- section ----------
const paramSection = (a, d) => {
  const rows = byStatus(paramRows(a, d)), known = new Set(a.PARAMS.map(p => p[0]));
  const extra = rowsOf(d.addon_params).filter(r => !known.has(upper(r.U_Key))).length;
  return section(`addon-${a.id}-param`, `${a.name}: parameter (@ST_PARAM)`, summary(rows, "Key dicek") + searchable(`ad-${a.id}-p`, [statusCol,
    { key: "Key", label: "Key", fmt: code }, { key: "Group", label: "Kelompok" }, { key: "Desc", label: "Dipakai untuk" },
    { key: "Value", label: "Nilai di DB", fmt: v => v ? code(v) : "" }], rows, { filterKey: "Group", filterLabel: "kelompok", flag: r => r.status.t === "danger" }),
    { level: 3, lead: `Key yang dibaca ${a.name}. Wajib = dibaca langsung di jalur utama. ${extra} key lain di @ST_PARAM tidak dicek di sini.` });
};
const tableSection = (a, d) => {
  const rows = byStatus(tableRows(a, d));
  return section(`addon-${a.id}-tabel`, `${a.name}: tabel yang dibutuhkan`, summary(rows, "Tabel dicek") + searchable(`ad-${a.id}-t`, [statusCol,
    { key: "Name", label: "Tabel", fmt: v => code("@" + v) }, { key: "Rows", label: "Baris", num: true, fmt: v => v === null ? "" : v.toLocaleString("id-ID") },
    { key: "By", label: "Dibuat oleh" }, { key: "Used", label: "Dibaca oleh" }, { key: "Note", label: "Catatan" }], rows, { flag: r => r.status.t === "danger" }),
    { level: 3, lead: "Tabel yang perlu isi data tapi masih kosong ditandai, karena modulnya tidak bisa dipakai sebelum itu." });
};
const udfSection = (a, d) => {
  const rows = byStatus(udfRows(a, d));
  return section(`addon-${a.id}-udf`, `${a.name}: field yang dibutuhkan`, summary(rows, "Field dicek") + searchable(`ad-${a.id}-u`, [statusCol,
    { key: "Table", label: "Tabel", fmt: code }, { key: "Field", label: "Field", fmt: code }, { key: "Used", label: "Fungsi" }], rows,
    { flag: r => r.status.t === "danger" }), { level: 3, lead: "Dibuat oleh DBCreator addon. Field branch hanya ada bila DBCreator dijalankan pada DB yang memakai branch." });
};
const procSection = (a, d) => {
  const rows = byStatus(procRows(a, d));
  return section(`addon-${a.id}-sp`, `${a.name}: procedure dan function`, summary(rows, "Objek dicek") + searchable(`ad-${a.id}-s`, [statusCol,
    { key: "Name", label: "Nama", fmt: code }, { key: "Kind", label: "Jenis" }, { key: "Used", label: "Dipanggil oleh" }, { key: "File", label: "File definisi" }],
    rows, { filterKey: "Kind", filterLabel: "jenis", flag: r => r.status.t === "danger" }),
    { level: 3, lead: "Definisinya harus dijalankan sendiri di HANA. Kolom File menunjuk lokasinya." });
};

// ---------- ringkasan masalah untuk kotak temuan halaman ----------
const problems = (a, rows, noun) => {
  const out = [], bad = count(rows, "danger"), warn = count(rows, "warn");
  if (bad) out.push(["danger", `${a.name}: ${bad} ${noun} yang dibutuhkan belum ada di DB ini.`]);
  if (warn) out.push(["warn", `${a.name}: ${warn} ${noun} sudah ada tapi masih kosong.`]);
  return out;
};

// tempelkan section ke halaman yang sudah ada: render lama + section baru, checks lama + temuan baru
function wrap(PAGES, id, keys, build, find) {
  const p = PAGES[id];
  if (!p) return;
  const render = p.render, checks = p.checks;
  p.render = d => render.call(p, d) + (failed(d, keys) ? section(`addon-${id}`, "Kebutuhan addon STEM dan Farm Breeding", NOTICE, { level: 2 })
    : section(`addon-${id}`, "Kebutuhan addon STEM dan Farm Breeding", "", { level: 2, lead: "Dibandingkan dengan isi DB ini. Daftar kebutuhan diambil dari kode addon." }) + ADDONS.map(a => build(a, d)).join(""));
  p.checks = d => [...(checks ? checks.call(p, d) : []), ...(failed(d, keys) ? [] : ADDONS.flatMap(a => find(a, d)))];
}

export function extendPages(PAGES) {
  wrap(PAGES, "udt", ["addon_rows", "addon_params"], (a, d) => tableSection(a, d) + paramSection(a, d),
    (a, d) => [...problems(a, tableRows(a, d), "tabel"), ...problems(a, paramRows(a, d), "key parameter")]);
  wrap(PAGES, "udf", ["addon_udf"], udfSection, (a, d) => problems(a, udfRows(a, d), "field"));
  wrap(PAGES, "sp-validation", ["addon_procs", "addon_funcs"], procSection, (a, d) => problems(a, procRows(a, d), "procedure/function"));
}
