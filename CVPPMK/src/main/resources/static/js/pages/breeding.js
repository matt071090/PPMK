// Bab 7: Addon Farm Breeding. Membandingkan yang DIHARAPKAN addon (breeding-data.js) dengan isi DB (sql/breeding-*/).
// Semua query baca saja. Status: ok = sesuai, warn = ada tapi perlu diisi, danger = belum ada, none = opsional.
import { esc, rowsOf, section, searchable, table } from "../ui.js";
import { PARAMS, TABLES, PROCS, UDFS } from "./breeding-data.js";

const kpis = list => `<div class="kpis">${list.map(([n, l]) => `<div class="kpi"><b>${n.toLocaleString("id-ID")}</b><span>${esc(l)}</span></div>`).join("")}</div>`;
const LABEL = { ok: ["yes", "Siap"], warn: ["warn", "Perlu diisi"], danger: ["danger", "Belum ada"], none: ["", "Opsional"] };
const badge = s => `<span class="badge ${LABEL[s.t][0]}">${esc(s.text || LABEL[s.t][1])}</span>`;
const code = v => `<code>${esc(v)}</code>`;
const upper = v => String(v ?? "").toUpperCase();
const count = (rows, t) => rows.filter(r => r.status.t === t).length;
const order = { danger: 0, warn: 1, none: 2, ok: 3 };
const byStatus = rows => rows.slice().sort((a, b) => order[a.status.t] - order[b.status.t]);

// ringkasan KPI + callout yang sama bentuknya di semua halaman cek
function summary(rows, noun) {
  return kpis([[rows.length, noun], [count(rows, "ok"), "Siap"], [count(rows, "warn"), "Perlu diisi"], [count(rows, "danger"), "Belum ada"]]);
}
function problems(rows, noun, link) {
  const out = [], bad = count(rows, "danger"), warn = count(rows, "warn");
  if (bad) out.push(["danger", `${bad} ${noun} yang dibutuhkan addon belum ada di DB ini.`, link]);
  if (warn) out.push(["warn", `${warn} ${noun} sudah ada tapi masih kosong.`, link]);
  return out;
}

// ---------- 7.1 Parameter @ST_PARAM ----------
function paramRows(d) {
  const db = new Map(rowsOf(d.params).map(r => [upper(r.U_Key), r]));
  return PARAMS.map(([key, group, level, desc]) => {
    const hit = db.get(key), blank = !hit || String(hit.U_Value ?? "").trim() === "";
    const status = !hit ? (level === "w" ? { t: "danger" } : { t: "none", text: "Opsional, belum ada" })
      : blank ? (level === "w" ? { t: "warn" } : { t: "none", text: "Opsional, kosong" }) : { t: "ok" };
    return { status, Key: key, Group: group, Level: level, Desc: desc, Code: hit ? hit.Code : "", Value: hit ? hit.U_Value : "" };
  });
}

// ---------- 7.2 Tabel master ----------
function tableRows(d) {
  const db = new Map(rowsOf(d.tables).map(r => [upper(r.Name), r]));
  return TABLES.map(([name, by, needsData, usedBy, note]) => {
    const hit = db.get("@" + name), n = hit ? +hit.Rows : null;
    const status = !hit ? { t: "danger" } : needsData && n === 0 ? { t: "warn", text: "Kosong" } : { t: "ok" };
    return { status, Name: name, By: by, Used: usedBy, Rows: n, Note: note };
  });
}

// ---------- 7.3 SP dan function ----------
function procRows(d) {
  const db = new Map([...rowsOf(d.procs), ...rowsOf(d.funcs)].map(r => [upper(r.Name), r]));
  return PROCS.map(([name, kind, usedBy, file, level]) => {
    const hit = db.get(upper(name));
    const status = hit ? { t: "ok" } : level === "w" ? { t: "danger" } : { t: "none", text: "Opsional, belum ada" };
    return { status, Name: name, Kind: kind === "SP" ? "Procedure" : "Function", Used: usedBy, File: file };
  });
}

// ---------- 7.4 UDF ----------
function udfRows(d) {
  const db = new Set(rowsOf(d.udf).map(r => `${upper(r.TableID)}.${upper(r.AliasID)}`));
  return UDFS.map(([tbl, alias, why]) => ({
    status: db.has(`${upper(tbl)}.${upper(alias)}`) ? { t: "ok" } : { t: "danger" }, Table: tbl, Field: "U_" + alias, Used: why
  }));
}

const statusCol = { key: "status", label: "Status", fmt: badge };

export const PAGES = {
  "breeding-setup": {
    static: true,
    lead: "Urutan menyiapkan DB baru untuk addon STEM dan Farm Breeding. Tiap halaman di bawah membandingkan kebutuhan addon dengan isi DB yang sedang terhubung.",
    render() {
      const steps = [
        ["1", "DBCreator STEM lalu DBCreator Farm Breeding (STEM harus lebih dulu)", "7.4", "breeding-udf"],
        ["2", "Tempel SP gabungan dan function HANA", "7.3", "breeding-sql"],
        ["3", "Isi parameter addon di @ST_PARAM", "7.1", "breeding-params"],
        ["4", "Isi tabel master: Type of Statistic, mapping biaya, mesin, standar", "7.2", "breeding-master"]
      ];
      return section("urutan", "Urutan setup", table(
        [{ key: "n", label: "Langkah" }, { key: "what", label: "Yang dikerjakan" },
          { key: "page", label: "Cek di halaman", fmt: (_, r) => `<a href="#/${r.id}">${esc(r.no)}</a>` }],
        steps.map(([n, what, no, id]) => ({ n, what, no, id })), { noExport: true }),
        { lead: "Kolom terakhir membuka halaman yang menunjukkan mana yang sudah siap dan mana yang belum." });
    }
  },

  "breeding-params": {
    lead: "Key yang dibaca addon Farm Breeding dari tabel @ST_PARAM. Key bertanda wajib dibaca langsung di jalur Statistic, Setter, Hatcher, dan Transfer.",
    menu: "Tools › User-Defined Tables › STEM AddOn Parameter",
    tables: ["@ST_PARAM"],
    checks: d => problems(paramRows(d), "key wajib", ["#/breeding-params", "lihat daftar"]),
    render(d) {
      const rows = byStatus(paramRows(d)), known = new Set(PARAMS.map(p => p[0])), extra = rowsOf(d.params).filter(r => !known.has(upper(r.U_Key)));
      return summary(rows, "Key dicek")
        + section("daftar", "Daftar key", searchable("brp", [statusCol,
          { key: "Key", label: "Key", fmt: code }, { key: "Group", label: "Kelompok" },
          { key: "Desc", label: "Dipakai untuk" }, { key: "Value", label: "Nilai di DB", fmt: v => v ? code(v) : "" }],
          rows, { filterKey: "Group", filterLabel: "kelompok", flag: r => r.status.t === "danger" }),
          { lead: `${extra.length} key lain di @ST_PARAM tidak dicek di sini (milik STEM atau modul lain).` });
    }
  },

  "breeding-master": {
    lead: "Tabel buatan addon. Tabel yang perlu isi data tapi masih kosong ditandai, karena modulnya tidak bisa dipakai sebelum itu.",
    menu: "Tools › User-Defined Tables",
    tables: ["SYS.TABLES"],
    checks: d => problems(tableRows(d), "tabel", ["#/breeding-master", "lihat daftar"]),
    render(d) {
      const rows = byStatus(tableRows(d));
      return summary(rows, "Tabel dicek")
        + section("daftar", "Daftar tabel", searchable("brm", [statusCol,
          { key: "Name", label: "Tabel", fmt: v => code("@" + v) }, { key: "Rows", label: "Baris", num: true, fmt: v => v === null ? "" : v.toLocaleString("id-ID") },
          { key: "By", label: "Dibuat oleh" }, { key: "Used", label: "Dibaca oleh" }, { key: "Note", label: "Catatan" }],
          rows, { flag: r => r.status.t === "danger" }));
    }
  },

  "breeding-sql": {
    lead: "Stored procedure dan function HANA yang dipanggil addon Farm Breeding. Definisinya ada di folder yang tertulis di kolom File, dan harus dijalankan sendiri di HANA.",
    menu: "Database HANA › Procedures dan Functions",
    tables: ["SYS.PROCEDURES", "SYS.FUNCTIONS"],
    checks: d => problems(procRows(d), "objek wajib", ["#/breeding-sql", "lihat daftar"]),
    render(d) {
      const rows = byStatus(procRows(d));
      return summary(rows, "Objek dicek")
        + section("daftar", "Daftar objek", searchable("brs", [statusCol,
          { key: "Name", label: "Nama", fmt: code }, { key: "Kind", label: "Jenis" },
          { key: "Used", label: "Dipanggil oleh" }, { key: "File", label: "File definisi" }],
          rows, { filterKey: "Kind", filterLabel: "jenis", flag: r => r.status.t === "danger" }));
    }
  },

  "breeding-udf": {
    lead: "Field buatan DBCreator yang dipakai Farm Breeding. Field branch hanya ada bila DBCreator dijalankan pada DB yang memakai branch.",
    menu: "Tools › Customization Tools › User-Defined Fields",
    tables: ["CUFD"],
    checks: d => problems(udfRows(d), "field", ["#/breeding-udf", "lihat daftar"]),
    render(d) {
      const rows = byStatus(udfRows(d));
      return summary(rows, "Field dicek")
        + section("daftar", "Daftar field", searchable("bru", [statusCol,
          { key: "Table", label: "Tabel", fmt: code }, { key: "Field", label: "Field", fmt: code }, { key: "Used", label: "Fungsi" }],
          rows, { flag: r => r.status.t === "danger" }));
    }
  }
};
