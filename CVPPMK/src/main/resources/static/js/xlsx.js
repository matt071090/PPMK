// Penulis .xlsx minimal tanpa library (zip tanpa kompresi), supaya export tetap jalan di server tanpa internet.
// sheets: [{ name, rows: [[cell, ...], ...] }]. Baris pertama = header (tebal, dibekukan, ada filter).
// cell: string -> teks, number -> angka.

const enc = new TextEncoder();
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = bytes => { let c = ~0; for (const b of bytes) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return ~c >>> 0; };

// files: [[nama, isi teks]] -> Blob zip (metode store)
export function zip(files, type) {
  const parts = [], central = [];
  let offset = 0;
  const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
  for (const [name, text] of files) {
    const n = enc.encode(name), d = enc.encode(text), crc = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
    h.setUint16(12, DOS_DATE, true); h.setUint32(14, crc, true);
    h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, n.length, true);
    parts.push(h, n, d);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint16(14, DOS_DATE, true); c.setUint32(16, crc, true);
    c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, n.length, true);
    c.setUint32(42, offset, true);
    central.push(c, n);
    offset += 30 + n.length + d.length;
  }
  const size = central.reduce((t, x) => t + x.byteLength, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, size, true); e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, e], { type });
}

const xml = s => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const colName = i => { let s = ""; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };

// Nama sheet: maks 31 karakter, tanpa []:*?/\ dan harus unik
function sheetNames(names) {
  const used = new Set();
  return names.map(raw => {
    const base = (String(raw).replace(/[[\]:*?/\\]/g, " ").trim() || "Sheet").slice(0, 31);
    let name = base;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
    used.add(name.toLowerCase());
    return name;
  });
}

// Indeks style (lihat styles.xml di bawah). Dipakai template upload lewat cell { v, s }.
export const S = { HEAD: 1, LABEL: 2, FIELD: 3, NOTE: 4, TEXT: 5, DATE: 6, BOLD: 7, SAMPLE_TEXT: 8, SAMPLE_DATE: 9, SAMPLE: 10, XHEAD: 11 };
// Tanggal "YYYY-MM-DD" -> nomor seri Excel (dipakai dengan style DATE)
export const excelDate = iso => (Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) - Date.UTC(1899, 11, 30)) / 864e5;

// Gaya dinamis: sel boleh { v, s: { b, fill:"RRGGBB", color:"RRGGBB", num } } (b = tebal, num = format #,##0); didaftarkan per berkas (indeks mulai 12).
function makeStyles() {
  const specs = [], idx = new Map();
  return { specs, id(o) { const k = JSON.stringify([!!o.b, o.fill || "", o.color || "", !!o.num]); if (!idx.has(k)) { idx.set(k, 12 + specs.length); specs.push(o); } return idx.get(k); } };
}
function dynStyles(specs) {
  const fonts = [], fills = [], xfs = [];
  specs.forEach(o => {
    const fk = `<font>${o.b ? "<b/>" : ""}<sz val="11"/>${o.color ? `<color rgb="FF${o.color}"/>` : ""}<name val="Calibri"/></font>`;
    let fi = fonts.indexOf(fk); if (fi < 0) fi = fonts.push(fk) - 1;
    let fl = 0;
    if (o.fill) { const k = `<fill><patternFill patternType="solid"><fgColor rgb="FF${o.fill}"/><bgColor indexed="64"/></patternFill></fill>`; let i = fills.indexOf(k); if (i < 0) i = fills.push(k) - 1; fl = 5 + i; }
    xfs.push(`<xf numFmtId="${o.num ? 3 : 0}" fontId="${5 + fi}" fillId="${fl}" borderId="0" xfId="0" applyFont="1"${fl ? ' applyFill="1"' : ""}${o.num ? ' applyNumberFormat="1"' : ""}/>`);
  });
  return { fonts: fonts.join(""), fills: fills.join(""), xfs: xfs.join(""), nf: fonts.length, nl: fills.length };
}

function cellXml(ref, c, reg) {
  const { v, s } = c !== null && typeof c === "object" ? c : { v: c };
  const st = s ? ` s="${typeof s === "object" ? reg.id(s) : s}"` : "";
  if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
  if (v === null || v === undefined || v === "") return st ? `<c r="${ref}"${st}/>` : "";
  return `<c r="${ref}" t="inlineStr"${st}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
}

// Sheet export biasa (format BP Master Data): header putih tebal di biru tua + wrap, freeze header & 2 kolom pertama (kode, nama),
// filter, lebar kolom dari isi (maks 50). Sheet template (sheet.template): style per cell, kolom bisa punya
// style default (cols[i].style, mis. teks supaya kode 0123 tidak jadi angka), dropdown (validations), freeze sendiri.
function sheetXml(sheet, reg) {
  const rows = sheet.rows, tpl = !!sheet.template;
  const width = Math.max(1, ...rows.map(r => r.length));
  const text = c => String(c !== null && typeof c === "object" ? c.v ?? "" : c ?? "");
  // judul kolom boleh terbungkus 2 baris, jadi lebar cukup untuk kata terpanjangnya
  const headW = i => Math.max(...text((rows[0] || [])[i]).split(/\s+/).map(s => s.length + 2));
  const widths = Array.from({ length: width }, (_, i) => {
    const def = (sheet.cols || [])[i] || {};
    return def.width || (tpl ? Math.min(45, Math.max(10, ...rows.slice(0, 3).map(r => text(r[i]).length + 2)))
      : Math.min(50, Math.max(8, headW(i), ...rows.slice(1).map(r => text(r[i]).length + 2))));
  });
  const cols = widths.map((w, i) => {
    const def = (sheet.cols || [])[i] || {};
    return `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${def.style ? ` style="${def.style}"` : ""}/>`;
  }).join("");
  const wrapHead = !tpl && (rows[0] || []).some((c, i) => text(c).length + 2 > widths[i]);
  const body = rows.map((r, y) => `<row r="${y + 1}"${y === 0 && wrapHead ? ` ht="30" customHeight="1"` : ""}>${r.map((c, x) =>
    cellXml(`${colName(x)}${y + 1}`, !tpl && y === 0 && c !== null && c !== "" && !(typeof c === "object") ? { v: c, s: S.XHEAD } : c, reg)).join("")}</row>`).join("");
  const fr = tpl ? sheet.freeze : { row: 1, col: width > 3 ? 2 : 0 };
  const pane = !fr ? "" : `<pane${fr.col ? ` xSplit="${fr.col}"` : ""} ySplit="${fr.row}" topLeftCell="${colName(fr.col)}${fr.row + 1}" activePane="${fr.col ? "bottomRight" : "bottomLeft"}" state="frozen"/>`;
  const filter = !tpl && rows.length > 1 ? `<autoFilter ref="A1:${colName(width - 1)}${sheet.filterRows || rows.length}"/>` : "";
  const dv = (sheet.validations || []).map(d => `<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Nilai tidak valid" error="Pilih dari daftar dropdown." sqref="${d.sqref}"><formula1>${xml(d.formula)}</formula1></dataValidation>`);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>
<cols>${cols}</cols>
<sheetData>${body}</sheetData>${filter}${dv.length ? `<dataValidations count="${dv.length}">${dv.join("")}</dataValidations>` : ""}</worksheet>`;
}

export function xlsxBlob(sheets) {
  const reg = makeStyles(), sheetXmls = sheets.map(s => sheetXml(s, reg)), dyn = dynStyles(reg.specs);
  const names = sheetNames(sheets.map(s => s.name));
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const rel = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const filters = sheets.map((s, i) => !s.template && s.rows.length > 1
    ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${names[i].replace(/'/g, "''")}'!$A$1:$${colName(Math.max(1, ...s.rows.map(r => r.length)) - 1)}$${s.filterRows || s.rows.length}</definedName>` : "").join("");
  const files = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${names.map((n, i) => `<sheet name="${xml(n)}" sheetId="${i + 1}"${sheets[i].hidden ? ` state="hidden"` : ""} r:id="rId${i + 1}"/>`).join("")}</sheets>${filters ? `<definedNames>${filters}</definedNames>` : ""}</workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="${rel}/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>
<fonts count="${5 + dyn.nf}"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><i/><sz val="11"/><color rgb="FF1F4E78"/><name val="Calibri"/></font><font><i/><sz val="9"/><color rgb="FF555555"/><name val="Calibri"/></font>${dyn.fonts}</fonts>
<fills count="${5 + dyn.nl}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE4F5F1"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill>${dyn.fills}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFB7B7B7"/></left><right style="thin"><color rgb="FFB7B7B7"/></right><top style="thin"><color rgb="FFB7B7B7"/></top><bottom style="thin"><color rgb="FFB7B7B7"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${12 + reg.specs.length}"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>${dyn.xfs}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXmls[i]])
  ];
  return zip(files, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

export function download(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename.replace(/[\\/:*?"<>|]+/g, " ").trim();
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
