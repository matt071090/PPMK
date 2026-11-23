import { ADDONS } from "./addon-data.js";
import { addonHasData, nonBranch, emptyPreference, branchOnly, branchNotice, emptyDataRow, blankValue } from "../data-policy.js";
// Bab 7 Addon: daftar dinamis dari DB (api/addon/objects): UDO Master Data + UDT No Object + UDO Document yang di mapping
// ditandai sebagai master. Dikelompokkan per sub kategori (mapping, diatur di menu Setup), urut nama.
// Halaman generik: isi tabel header + child apa adanya (kolom kunci + UDF berlabel CUFD), baca-saja.
import { esc, rowsOf, section, searchable, expandList, table, tabs, exportSheets, autoCols, kv, isEmpty } from "../ui.js";

export const UNCAT = "Belum dikategorikan";
// hasil api/addon/objects terakhir (diisi app.js saat start), dipakai juga tabel Daftar UDO (tombol Jadikan menu)
export const addonState = { objects: null, categories: [], editable: false };
export const KIND = { m: "UDO Master Data", d: "UDO Document", t: "UDT No Object" };
export const addonPageId = code => "addon-" + code.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const objTitle = o => o.title || o.name.replace(/_/g, " ");

// halaman sidebar: sub kategori abjad, "Belum dikategorikan" paling bawah, item urut nama
export function addonPages(objects, showEmpty = emptyPreference("addon-menu")) {
  return objects.filter(o => o.shown && (!nonBranch() || !o.tables?.some(t => t.name === "STEM_TIBRANCHH")) && (showEmpty || addonHasData(o)))
    .map(o => ({ id: addonPageId(o.code), title: objTitle(o), cat: o.cat || UNCAT, status: addonHasData(o) ? "progress" : null, empty: !addonHasData(o), addon: o.code }))
    .sort((a, b) => (a.cat === UNCAT) - (b.cat === UNCAT) || a.cat.localeCompare(b.cat) || a.title.localeCompare(b.title));
}

// kolom penghubung child ke header: Code (UDO Master Data) atau DocEntry (UDO Document)
const linkKey = t => ["3", "4"].includes(String(t.type)) ? "DocEntry" : "Code";
const blank = v => isEmpty(v) ? `<span class="muted">–</span>` : esc(v);
const colsOf = (res, skip = []) => autoCols(res).filter(c => !skip.includes(c.key)).map(c => c.fmt ? c : { ...c, fmt: blank });

export function addonPage(o) {
  const [head, ...children] = o.tables;
  return {
    addon: o.code,
    lead: `Isi ${o.kind === "t" ? "tabel" : "master"} add-on ini di DB company ini, dibaca langsung dari tabelnya. Halaman ini hanya untuk dilihat dan dicek, tidak mengubah data.`,
    menu: `Addon › ${o.cat || UNCAT}`,
    tables: o.tables.map(t => `@${t.name}`),
    render(d) {
      const res = d[head.name] || {}, allRows = rowsOf(res), key = linkKey(head);
      const branchParams = new Set(ADDONS.flatMap(a => a.PARAMS.filter(r => branchOnly('PARAMS', r)).map(r => r[0])));
      const isBranchParam = r => head.name === 'ST_PARAM' && branchParams.has(String(r.U_Key || r.Code).toUpperCase());
      const rows = nonBranch() ? allRows.filter(r => !isBranchParam(r)) : allRows;
      const candidateEmpty = head.name === 'ST_PARAM' ? r => blankValue(r.U_Value) : emptyDataRow;
      const kids = children.map(t => {
        const r = d[t.name] || {};
        return { t, res: r, rows: rowsOf(r), cols: colsOf(r, [linkKey(t)]) };
      });
      const childOf = (k, h) => k.rows.filter(x => x[linkKey(k.t)] === h[key]);
      const emptyRow = r => candidateEmpty(r) && !kids.some(k => childOf(k, r).length);
      const info = kv([
        [`Kode ${o.kind === "t" ? "UDT" : "UDO"}`, `<code>${esc(o.code)}</code>`],
        ["Tipe", esc(KIND[o.kind]) + (o.kind === "d" ? ` <span class="muted">(dipetakan sebagai master)</span>` : "")],
        ["Tabel", o.tables.map((t, i) => `<code>@${esc(t.name)}</code> <span class="muted">${i ? "child" : o.kind === "t" ? "" : "header"} · ${esc(t.descr)}</span>`).join("<br>")],
        ["Sub kategori", esc(o.cat || UNCAT)]
      ]);
      const kpis = `<div class="kpis"><div class="kpi"><b>${rows.length.toLocaleString("id-ID")}</b><span>Baris ${kids.length ? "header" : "data"}</span></div>
        ${kids.map(k => `<div class="kpi"><b>${k.rows.length.toLocaleString("id-ID")}</b><span>Baris ${esc(k.t.descr)}</span></div>`).join("")}</div>`;
      const errs = [res, ...kids.map(k => k.res)].filter(r => r.error).map(r => r.error);
      const trunc = [[head, res], ...kids.map(k => [k.t, k.res])].filter(([, r]) => r.truncated)
        .map(([t, r]) => `@${t.name} hanya menampilkan ${r.truncated.toLocaleString("id-ID")} baris pertama.`);
      let body;
      if (res.error) body = "";
      else if (!rows.length) body = `<p class="muted">Belum ada data di DB company ini.</p>`;
      else if (!kids.length) body = searchable(`ad-${o.code}`, colsOf(res), rows, { emptyRow });
      else {
        const cols = [...colsOf(res), ...kids.map(k => ({ key: `_n_${k.t.name}`, label: `Baris ${k.t.descr}`, num: true, fmt: (_, h) => String(childOf(k, h).length) }))];
        const detail = h => {
          const list = kids.map(k => { const r = childOf(k, h); return [`${k.t.descr} (${r.length})`, r.length ? table(k.cols, r, { noExport: true }) : `<p class="muted">Belum ada baris di @${esc(k.t.name)}.</p>`]; });
          return list.length === 1 ? list[0][1] : tabs(`ad-${o.code}`, list);
        };
        // Excel: sheet header + satu sheet per child, nama sheet = nama tabel (unik, <= 31 karakter); kolom penghubung ikut
        const sheets = [{ name: head.name, cols: colsOf(res), rows }, ...kids.map(k => ({ name: k.t.name, cols: colsOf(k.res), rows: k.rows }))];
        const onFilter = visible => {
          sheets[0].rows = visible;
          const keys = new Set(visible.map(h => h[key]));
          kids.forEach((k, i) => { sheets[i + 1].rows = k.rows.filter(r => keys.has(r[linkKey(k.t)])); });
        };
        body = exportSheets(sheets, objTitle(o))
          + expandList(`ad-${o.code}`, cols, rows, { expand: detail, lazy: true, noExport: true, onFilter, emptyRow, searchText: h => JSON.stringify([h, ...kids.map(k => childOf(k, h))]), placeholder: "Cari kode / nama / isi child…" });
      }
      return branchNotice(allRows.length - rows.length) + info + kpis
        + (errs.length ? `<div class="error">Data gagal dibaca dari DB. Coba muat ulang halaman.<br><small>${errs.map(esc).join("<br>")}</small></div>` : "")
        + (trunc.length ? `<div class="callouts"><div class="callout info"><span class="ci">i</span><div class="ct"><b>Info</b>${esc(trunc.join(" "))}</div></div></div>` : "")
        + section("data", "Data", body, kids.length && rows.length ? { lead: "Klik baris untuk melihat baris child-nya. Excel berisi sheet header + satu sheet per child." } : {});
    }
  };
}

// bab 7 tanpa objek (DB belum punya UDO/UDT) atau daftar gagal dibaca: satu halaman berisi pesannya
export function addonEmptyPage(error, hiddenCount = 0) {
  return {
    static: true,
    lead: "Master data add-on (UDO dan UDT) di DB company ini.",
    render: () => error
      ? `<div class="error">Daftar add-on gagal dibaca dari DB. Coba muat ulang halaman.<br><small>${esc(error)}</small></div>`
      : hiddenCount ? `<p class="sec-lead">${hiddenCount} menu Addon kosong disembunyikan. Aktifkan Tampilkan yang kosong untuk melihatnya.</p>`
      : `<div class="placeholder"><p style="margin:0 0 6px;font-weight:600;color:var(--text)">Belum ada objek add-on di DB company ini.</p>
          <p style="margin:0">Mulai dari object standard dulu. Menu di bab ini muncul otomatis setelah DBCreator add-on dijalankan.</p></div>`
  };
}
