// Bab 7: tampilan baca-saja langkah Setup tahap G (Addon Farm Breeding), untuk dicek user tanpa mode edit.
// Halaman = entri sections.json yang punya "setupStep"; data dari /api/section/setup/{step} (query sama dengan menu Setup, DB company ini).
// Kolom "_Detail*" = baris detail yang digabung query Setup (baris dipisah rowSep, kolom colSep), dipecah lagi di sini.
import { esc, rowsOf, section, searchable, expandList, table, exportSheets, isEmpty } from "../ui.js";

const NUM = /^-?\d+(\.\d+)?$/;
const label = c => c.replace(/^_/, "");
// baris detail satu record: [{field: nilai}] menurut definisi children di steps.json
function detailRows(r, ch) {
  const raw = r[ch.from];
  if (isEmpty(raw)) return [];
  if (ch.fields) return String(raw).split(ch.rowSep || "¦").map(line => { const v = line.split(ch.colSep || "^"); return Object.fromEntries(ch.fields.map((f, i) => [f, v[i] ?? ""])); });
  return String(raw).split(ch.sep || "|").map(v => ({ [ch.field || "Value"]: v }));
}
const colsOf = keys => keys.map(k => ({ key: k, label: label(k), num: false, fmt: v => isEmpty(v) ? `<span class="muted">–</span>` : esc(v) }));

export function setupViewPage(stepId, title) {
  return {
    setupStep: stepId,
    lead: "Isi master ini di DB company ini, dibaca dengan query yang sama dengan menu Setup (tahap Addon Farm Breeding). Halaman ini hanya untuk dilihat dan dicek, tidak mengubah data.",
    menu: "Addon Farm Breeding › Master Data",
    checks: d => rowsOf(d.rows).length ? [] : [["info", "Belum ada data di DB company ini."]],
    render(d) {
      const step = d.step || {}, res = d.rows || {}, children = step.children || [];
      const rows = rowsOf(res);
      const main = (res.columns || []).filter(c => c !== "_key" && !children.some(ch => ch.from === c));
      const keyCols = (step.match || ["Code"]).filter(k => main.includes(k));
      const mainCols = colsOf(main);
      const detailName = (ch, i) => children.length === 1 ? "Detail" : `Detail ${i + 1}${ch.collection ? ` (${ch.collection.replace(/Collection$/, "")})` : ""}`;
      const count = (r, ch) => detailRows(r, ch).length;
      if (children.length) mainCols.push(...children.map((ch, i) => ({ key: ch.from, label: `Baris ${detailName(ch, i).toLowerCase()}`, num: true, fmt: (_, r) => String(count(r, ch)) })));
      // Excel: header + satu sheet per detail, baris detail diberi kolom kunci header-nya
      const sheets = [{ name: step.title || title, cols: colsOf(main), rows },
        ...children.map((ch, i) => {
          const fields = ch.fields || [ch.field || "Value"];
          return { name: detailName(ch, i), cols: colsOf([...keyCols, ...fields]),
            rows: rows.flatMap(r => detailRows(r, ch).map(x => ({ ...Object.fromEntries(keyCols.map(k => [k, r[k]])), ...x }))) };
        })];
      const detail = r => children.map((ch, i) => {
        const list = detailRows(r, ch), fields = ch.fields || [ch.field || "Value"];
        return `<div class="sv-detail"><b>${esc(detailName(ch, i))}</b> <span class="muted">${list.length} baris</span>${table(colsOf(fields), list, { noExport: true })}</div>`;
      }).join("");
      // tanpa detail: tabel biasa dengan tombol Excel-nya sendiri; dengan detail: satu tombol Excel berisi header + sheet detail
      const body = !rows.length ? `<p class="muted">Belum ada data di DB company ini.</p>`
        : children.length ? exportSheets(sheets, step.title || title)
          + expandList(`sv-${stepId}`, mainCols, rows, { expand: detail, lazy: true, noExport: true, placeholder: "Cari kode / nama / isi detail…" })
        : searchable(`sv-${stepId}`, mainCols, rows);
      return `<div class="kpis"><div class="kpi"><b>${rows.length.toLocaleString("id-ID")}</b><span>Baris${children.length ? " header" : ""}</span></div>
          ${children.map((ch, i) => `<div class="kpi"><b>${rows.reduce((n, r) => n + count(r, ch), 0).toLocaleString("id-ID")}</b><span>Baris ${esc(detailName(ch, i).toLowerCase())}</span></div>`).join("")}</div>`
        + (step.note ? `<div class="callouts"><div class="callout info"><span class="ci">i</span><div class="ct"><b>Catatan</b>${esc(step.note)}</div></div></div>` : "")
        + section("data", step.ref ? `Data ${step.ref}` : "Data", body, children.length ? { lead: "Klik baris untuk melihat detailnya." } : {});
    }
  };
}
