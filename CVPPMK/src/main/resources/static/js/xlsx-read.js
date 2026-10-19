// Pembaca .xlsx minimal tanpa library: buka zip (store atau deflate lewat DecompressionStream), baca shared strings,
// lalu setiap sheet jadi array baris berisi teks / angka. Dipakai halaman Setup untuk membaca template upload yang sudah diisi.
// Hasil: [{ name, hidden, rows: [[nilai, ...], ...] }] urut sesuai workbook. Sel kosong = "".

async function unzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder();
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("File bukan .xlsx yang valid (struktur zip tidak dikenali)");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error("Daftar isi zip rusak");
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true), name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    files.set(name, { method, size, local });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return async name => {
    const f = files.get(name);
    if (!f) return null;
    const start = f.local + 30 + dv.getUint16(f.local + 26, true) + dv.getUint16(f.local + 28, true);
    const data = u8.subarray(start, start + f.size);
    if (f.method === 0) return dec.decode(data);
    if (f.method !== 8) throw new Error(`Kompresi zip metode ${f.method} tidak didukung`);
    if (typeof DecompressionStream === "undefined") throw new Error("Browser ini belum mendukung baca file Excel terkompresi; pakai Chrome / Edge versi baru");
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).text();
  };
}

// XML Excel cukup sederhana untuk dibaca dengan regex (tanpa DOMParser, jadi juga bisa diuji di Node)
const unesc = s => s.replace(/&(lt|gt|quot|apos|amp|#x[0-9a-f]+|#\d+);/gi, (m, e) => ({ lt: "<", gt: ">", quot: '"', apos: "'", amp: "&" })[e.toLowerCase()]
  ?? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)));
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? unesc(m[1]) : null; };
const tags = (xml, name) => xml.match(new RegExp(`<${name}\\b[^>]*?(?:/>|>[\\s\\S]*?</${name}>)`, "g")) || [];
const texts = xml => (xml.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) || []).map(t => unesc(t.replace(/^<t\b[^>]*>|<\/t>$/g, ""))).join("");
const colIndex = ref => { let n = 0; for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };

export async function readXlsx(file) {
  const get = await unzip(await file.arrayBuffer());
  const wb = await get("xl/workbook.xml");
  if (!wb) throw new Error("File bukan workbook Excel (xl/workbook.xml tidak ada)");
  const target = Object.fromEntries(tags(await get("xl/_rels/workbook.xml.rels") || "", "Relationship").map(r => [attr(r, "Id"), attr(r, "Target")]));
  const shared = tags(await get("xl/sharedStrings.xml") || "", "si").map(texts);
  const out = [];
  for (const sh of tags(wb, "sheet")) {
    const path = "xl/" + String(target[attr(sh, "r:id")] || "").replace(/^\/?xl\//, "").replace(/^\//, "");
    const xml = await get(path);
    const rows = [];
    if (xml) for (const r of tags(xml, "row")) {
      const y = +attr(r, "r") - 1, row = [];
      tags(r, "c").forEach((c, i) => {
        const ref = attr(c, "r"), x = ref ? colIndex(ref) : i, t = attr(c, "t");
        const vm = c.match(/<v>([\s\S]*?)<\/v>/), v = vm ? unesc(vm[1]) : "";
        row[x] = t === "s" ? shared[+v] ?? "" : t === "inlineStr" ? texts(c) : t === "str" || t === "b" || t === "e" ? v : v !== "" ? +v : "";
      });
      rows[y] = Array.from(row, x => x ?? "");
    }
    out.push({ name: attr(sh, "name"), hidden: attr(sh, "state") === "hidden", rows: Array.from(rows, x => x || []) });
  }
  return out;
}
