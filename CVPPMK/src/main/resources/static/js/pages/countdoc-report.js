// Count Document: "Laporan PNG (bebas ukuran)". Satu gambar landscape, tinggi mengikuti isi; warna eksplisit (tanpa var()) supaya
// HTML yang sama bisa dicetak, dan dirasterisasi lewat SVG foreignObject -> canvas -> PNG tanpa library.
// Isi: header, strip KPI, grafik batang harian, top pengguna + top dokumen, TABEL UTAMA Kelompok | Dokumen | hari | Total (semua objek, subtotal, heat teal).
import * as E from "./countdoc-engine.js";

const C = { ink: "#1B2428", sub: "#4B5860", line: "#D5DBDF", panel: "#F2F6F6", accent: "#0A6B5C", day: "#B7C4C9", heat: ["#E6F1EF", "#BFE0DA", "#7CBFB3", "#2F9486"], we: "#F4F6F7" };
const FF = `system-ui, 'Segoe UI', Roboto, Arial, sans-serif`;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nf = E.fmtNum, pct1 = p => p.toFixed(1).replace(".", ",") + "%";
const DAY3 = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const isKey = k => /^\d{4}-\d{2}-\d{2}/.test(k);
const dow = k => E.parseIso(k).getUTCDay();
/** Heat 4 tingkat (0 = kosong), satu hue teal. */
export const heat4 = (v, max) => (!v || !max ? 0 : Math.min(4, Math.floor(Math.min(1, Math.sqrt(v / max)) * 4) + 1));

export const CSS = `.rp{box-sizing:border-box;background:#fff;color:${C.ink};font:14px/1.45 ${FF};padding:32px 36px 26px}.rp *{box-sizing:border-box}
.rp h1{font-size:26px;line-height:1.2;margin:0 0 4px;font-weight:750}.rp h2{font-size:16px;margin:0 0 10px;font-weight:700}.rp .m{color:${C.sub};font-size:14px;margin:0 0 20px}
.rp .kp{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:0 0 20px}.rp .kp div{border:1px solid ${C.line};border-radius:8px;padding:12px 16px}.rp .kp b{display:block;font-size:30px;line-height:1.15;color:${C.accent};font-weight:750}.rp .kp span{color:${C.sub};font-size:13px}
.rp .cd{border:1px solid ${C.line};border-radius:8px;padding:14px 16px;margin:0 0 20px}.rp .two{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:0 0 20px}.rp .two .cd{margin:0}
.rp .li{display:grid;grid-template-columns:minmax(0,1fr) 120px 56px;gap:10px;align-items:center;padding:3px 0;font-size:14px}.rp .li i{display:block;height:6px;background:${C.accent};border-radius:3px;min-width:2px}.rp .li .t{height:6px;background:${C.panel};border-radius:3px}.rp .li em{font-style:normal;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.rp .li u{text-decoration:none;text-align:right;font-variant-numeric:tabular-nums}
.rp table{border-collapse:collapse;width:100%;font-size:14px;font-variant-numeric:tabular-nums}.rp th,.rp td{padding:5px 6px;border-bottom:1px solid ${C.line};text-align:center;white-space:nowrap;height:28px}
.rp thead th{font-size:12px;color:${C.sub};font-weight:600;line-height:1.25;border-bottom:1px solid #8E9AA2;vertical-align:bottom}.rp thead th span{display:block;font-weight:500}
.rp td.k,.rp th.k{text-align:left;width:150px;padding-left:10px}.rp td.d,.rp th.d{text-align:left;width:250px;max-width:250px;overflow:hidden;text-overflow:ellipsis}.rp td.t,.rp th.t{font-weight:700;width:70px;background:${C.panel}}
.rp tr.s td{font-weight:700}.rp tr.all td{font-weight:700;border-top:2px solid ${C.ink}}.rp td.z{color:#9AA5AB}.rp .ft{margin:14px 0 0;color:${C.sub};font-size:12px;line-height:1.5}`;

/** Grafik batang tunggal (puncak teal), 1 satuan = 1 px; lebar W. */
function chartSvg(dv, W) {
  const bucket = E.bucketFor(dv.from, dv.to), keys = E.bucketKeys(dv.from, dv.to, bucket), m = new Map(keys.map(k => [k, 0]));
  for (const r of dv.rows) if (r.counted && r.date) { const k = E.bucketKey(r.date, bucket); if (m.has(k)) m.set(k, m.get(k) + r.counted); }
  const vals = keys.map(k => m.get(k)), mx = Math.max(0, ...vals), max = Math.max(1, mx), peak = mx > 0 ? vals.indexOf(mx) : -1;
  const H = 190, L = 8, T = 26, B = 30, ph = H - T - B, slot = (W - L * 2) / Math.max(1, keys.length), showAll = slot >= 30;
  const tx = (x, y, s, w) => `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" font-family="${FF}" font-size="13" fill="${C.ink}"${w ? ' font-weight="700"' : ""}>${s}</text>`;
  const bars = keys.map((k, i) => {
    const cx = L + slot * i + slot / 2, v = vals[i], h = v / max * ph, y = T + ph - h, bw = Math.min(slot * .6, 44), isP = i === peak;
    const lab = bucket === "month" ? k : bucket === "week" ? `${+k.slice(8, 10)}/${+k.slice(5, 7)}` : `${+k.slice(8, 10)}`;
    const wk = bucket === "day" && dow(k) % 6 === 0;
    return `<g>${v ? `<rect x="${(cx - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${isP ? C.accent : wk ? "#CBD5D9" : C.day}"></rect>` : ""}${(showAll || isP) ? tx(cx, y - 6, nf(v), isP) : ""}${(slot >= 20 || i % 2 === 0) ? tx(cx, H - 10, esc(lab), isP) : ""}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik batang jumlah dokumen, sumbu mulai dari nol"><line x1="${L}" x2="${W - L}" y1="${T + ph}" y2="${T + ph}" stroke="#8E9AA2" stroke-width="1"></line>${bars}</svg>`;
}

const listHtml = (items, max) => items.map(([n, c]) => `<div class="li"><em title="${esc(n)}">${esc(n)}</em><span class="t"><i style="width:${(c / max * 100).toFixed(1)}%"></i></span><u>${nf(c)}</u></div>`).join("");

/** Tabel utama dari pivot (sumber sama dengan E.docMatrix): semua objek, subtotal per kelompok, Total keseluruhan, heat teal, akhir pekan ditandai. */
function mainTable(dv) {
  const bucket = E.bucketFor(dv.from, dv.to), p = E.pivot(dv.rows, { by: "date", from: dv.from, to: dv.to, bucket, names: dv.users, objectOrder: dv.order });
  const gt = E.grandTotal(p); let max = 1;
  for (const g of p.groups) for (const o of g.objects) for (const k in o.cells) max = Math.max(max, o.cells[k]);
  const wk = c => bucket === "day" && isKey(c.key) && dow(c.key) % 6 === 0;
  const head = p.cols.map(c => {
    const [a, b] = c.key === E.NO_DATE ? ["tanpa", "tgl"] : bucket === "day" && isKey(c.key) ? [DAY3[dow(c.key)], `${c.key.slice(8, 10)}-${c.key.slice(5, 7)}`] : bucket === "week" && isKey(c.key) ? ["mgg", `${c.key.slice(8, 10)}-${c.key.slice(5, 7)}`] : [c.key, ""];
    return `<th${wk(c) ? ` style="background:${C.we}"` : ""}>${esc(a)}<span>${esc(b)}</span></th>`;
  }).join("");
  const cell = (v, c) => { const b = heat4(v, max); return b ? `<td style="background:${C.heat[b - 1]}${b === 4 ? ";color:#fff" : ""}">${nf(v)}</td>` : `<td class="z"${wk(c) ? ` style="background:${C.we}"` : ""}>&middot;</td>`; };
  const body = p.groups.map(g => {
    const i = E.groupInfo(g.group), kc = `class="k" style="background:${i.tint};border-left:4px solid ${i.bar};color:${i.ink}"`;
    const rows = g.objects.map(o => `<tr><td ${kc}>${esc(g.group)}</td><td class="d" title="${esc(o.id)}">${esc(o.id)}</td>${p.cols.map(c => cell(o.cells[c.key], c)).join("")}<td class="t">${nf(o.total)}</td></tr>`).join("");
    const sub = `<tr class="s"><td ${kc}>${esc(g.group)}</td><td class="d" style="background:${i.tint};color:${i.ink}">Total ${esc(g.group)}</td>${p.cols.map(c => `<td style="background:${i.tint}">${g.subtotal.cells[c.key] ? nf(g.subtotal.cells[c.key]) : ""}</td>`).join("")}<td class="t" style="background:${i.tint}">${nf(g.subtotal.total)}</td></tr>`;
    return rows + sub;
  }).join("");
  const foot = `<tr class="all"><td class="k"></td><td class="d">Total keseluruhan</td>${p.cols.map(c => `<td>${gt.cells[c.key] ? nf(gt.cells[c.key]) : ""}</td>`).join("")}<td class="t">${nf(gt.total)}</td></tr>`;
  return { html: `<table><thead><tr><th class="k">Kelompok</th><th class="d">Dokumen</th>${head}<th class="t">Total</th></tr></thead><tbody>${body}${foot}</tbody></table>`, cols: p.cols.length, bucket };
}

/** Bangun laporan. ctx: { dv, resp, taken(Date), company, filterText, mask, version, note }. Hasil { html (termasuk <style>), width }. */
export function reportHtml(ctx) {
  const { dv, resp } = ctx, k = E.kpis(dv.rows), gs = E.groupStats(dv.rows), per = E.fmtPeriod(resp.from, resp.to);
  const tbl = mainTable(dv), width = Math.max(1200, 150 + 250 + 70 + 24 + tbl.cols * 46 + 72);
  const b = E.busiestDay(dv.rows), us = E.userStats(dv.rows, dv.names).slice(0, 8), objs = E.topObjects(dv.rows, 10);
  const kp = [[nf(k.documents), "Jumlah dokumen"], [nf(k.activeUsers), "Pengguna aktif"], [nf(k.objectsUsed), "Jenis dokumen terpakai"], [b ? E.fmtDateId(b.date, false) : "-", b ? `Hari tersibuk (${nf(b.count)} dokumen)` : "Hari tersibuk"]]
    .map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("");
  const ins = gs.length > 1 ? ` Kelompok terbanyak: ${gs[0].group} (${nf(gs[0].documents)}, ${pct1(gs[0].pct)}).` : "";
  const html = `<style>${CSS}</style><div class="rp" style="width:${width}px"><h1>Laporan Aktivitas Dokumen SAP</h1>
<p class="m">${esc(ctx.company)} &middot; Periode ${esc(per)} &middot; Diambil pada ${esc(E.fmtTime(ctx.taken))}</p>
<div class="kp">${kp}</div>
${k.documents ? `<div class="cd"><h2>Dokumen dibuat per ${dv.bucket === "day" ? "hari" : dv.bucket === "week" ? "minggu" : "bulan"}</h2>${chartSvg(dv, width - 72 - 34)}<p class="ft" style="margin:6px 0 0">${esc(ins.trim())}</p></div>
<div class="two"><div class="cd"><h2>Pengguna teratas</h2>${listHtml(us.map(u => [u.name, u.counted]), us[0] ? us[0].counted : 1)}<p class="ft" style="margin:8px 0 0">${esc(ctx.note)}${ctx.mask ? " Nama disamarkan." : ""}</p></div>
<div class="cd"><h2>Dokumen terbanyak</h2>${listHtml(objs.map(o => [o.id, o.counted]), objs[0] ? objs[0].counted : 1)}</div></div>
<div class="cd" style="padding:14px 10px"><h2 style="padding-left:6px">Dokumen per ${tbl.bucket === "day" ? "hari" : tbl.bucket === "week" ? "minggu" : "bulan"}</h2>${tbl.html}</div>` : `<div class="cd"><p>Belum ada dokumen untuk filter ini.</p></div>`}
<p class="ft">Sumber: SAP Business One. Diambil pada ${esc(ctx.taken.toLocaleString("id-ID"))}; data sampai pukul ${esc(E.fmtTime(ctx.taken))}. Filter aktif: ${esc(ctx.filterText)}. Dokumen = dokumen SAP yang dibuat pada periode (tanggal buat); dokumen batal belum disaring. ${esc(ctx.note)}<br>${esc(ctx.version)}</p></div>`;
  return { html, width };
}

/** Bagi tinggi (px CSS) menjadi bagian-bagian berurutan <= maxH: [{y, h}]. */
export function pngParts(height, maxH = 7000) {
  const n = Math.max(1, Math.ceil(height / maxH)), h = Math.ceil(height / n), out = [];
  for (let i = 0; i < n; i++) out.push({ y: i * h, h: Math.min(h, height - i * h) });
  return out;
}

/** Tinggi laporan (px CSS) bila dirender selebar `width`; untuk ukuran halaman cetak. */
export function measureReport(html) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;visibility:hidden";
  host.innerHTML = html; document.body.append(host);
  try { return Math.ceil(host.querySelector(".rp").getBoundingClientRect().height); } finally { host.remove(); }
}

/** Rasterisasi HTML laporan -> daftar Blob PNG (skala 2x; > 7000 px tinggi dibagi beberapa bagian). Butuh browser (canvas + SVG foreignObject). */
export async function renderPng(html, width, scale = 2) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;visibility:hidden";
  host.innerHTML = html; document.body.append(host);
  try {
    const el = host.querySelector(".rp"), h = Math.ceil(el.getBoundingClientRect().height);
    let xml = new XMLSerializer().serializeToString(el);
    if (!/^<div[^>]*xmlns=/.test(xml)) xml = xml.replace(/^<div /, '<div xmlns="http://www.w3.org/1999/xhtml" ');
    const css = `<style xmlns="http://www.w3.org/1999/xhtml">${CSS}</style>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}"><foreignObject x="0" y="0" width="${width}" height="${h}">${css}${xml}</foreignObject></svg>`;
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = () => { const pe = new DOMParser().parseFromString(svg, "image/svg+xml").querySelector("parsererror"); no(new Error("Gagal merender gambar laporan." + (pe ? " " + pe.textContent.slice(0, 160) : ""))); }; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
    const blobs = [];
    for (const pt of pngParts(h)) {
      const cv = document.createElement("canvas"); cv.width = width * scale; cv.height = pt.h * scale;
      const cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height);
      cx.drawImage(img, 0, pt.y, width, pt.h, 0, 0, cv.width, cv.height);
      blobs.push(await new Promise((ok, no) => cv.toBlob(b => b ? ok(b) : no(new Error("Gagal membuat PNG.")), "image/png")));
    }
    return { blobs, width, height: h };
  } finally { host.remove(); }
}
