// Tes render area cetak (jsdom): slide 16:9 berwarna, kosong, 1 pengguna, banyak hari, > 40 jenis dokumen, samaran nama, escape.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const p = process.env.JSDOM_PATH || "C:/tmp/pd-test-nm/node_modules/jsdom/lib/api.js";
let JSDOM;
try { ({ JSDOM } = await import(pathToFileURL(p).href)); } catch { /* tidak ada */ }
const fx = JSON.parse(readFileSync(new URL("./countdoc-fixture.json", import.meta.url), "utf8"));
const skip = !JSDOM && "jsdom tidak tersedia";
const num = s => Number(String(s).replace(/\./g, "").replace(/[^\d]/g, "") || 0);

/** Muat halaman dengan respons tertentu lalu kembalikan { root, pg, dom, print(tpl) -> { html, css } }. */
async function boot(resp, meta) {
  const dom = new JSDOM(`<!doctype html><body><article id="a"></article><div id="pr"></div></body>`, { pretendToBeVisual: true, url: "http://localhost/" });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.sessionStorage = dom.window.sessionStorage; globalThis.localStorage = dom.window.localStorage;
  globalThis.fetch = async url => {
    const body = url.startsWith("api/countdoc/companies") ? { companies: [{ schema: "X", name: "PT Contoh" }] } : url.startsWith("api/countdoc/meta") ? meta : resp;
    return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => body };
  };
  const { countdocPage } = await import("../../main/resources/static/js/pages/countdoc.js");
  const root = document.getElementById("a"), pg = countdocPage(root, document.getElementById("pr"));
  await new Promise(r => setTimeout(r, 20));
  root.querySelector("#cd-go").click();
  await new Promise(r => setTimeout(r, 30));
  let out = null; dom.window.print = () => { out = { html: document.getElementById("pr").innerHTML, css: [...document.head.querySelectorAll("style")].map(x => x.textContent).join("\n") }; };
  const print = tpl => {
    const sel = root.querySelector('[data-f="tpl"]'); sel.value = tpl; sel.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
    out = null; root.querySelector('[data-x="pdf"]').click();
    assert.ok(out, "window.print terpanggil; status: " + root.querySelector("#cd-status").textContent);
    return out;
  };
  return { root, pg, dom, print };
}
const clone = o => JSON.parse(JSON.stringify(o));
const noRed = html => assert.ok(!/(#f00|#ff0000|red\b|rgb\(2[0-9]{2},\s*\d{1,2},\s*\d{1,2}\))/i.test(html));
const doc = html => new JSDOM(`<body>${html}</body>`).window.document;

test("slide 16:9 eksekutif: 5 slide, judul kesimpulan, palet teal terpisah, tanpa pita/legenda/label internal", { skip }, async () => {
  const f = clone(fx); f.resp.users[3] = ["budi", "<b>Budi</b>"]; f.resp.companyName = "PT <Contoh>";
  const { root, print, dom } = await boot(f.resp, f.meta);
  assert.equal(root.querySelector('[data-f="tpl"]').value, "png", "template bawaan = Laporan PNG");
  assert.ok(root.querySelector("#cd-pdf-hint").textContent.includes("Simpan sebagai PDF"));
  const { html, css } = print("share");
  const d = doc(html);
  const sl = [...d.querySelectorAll(".p-slide")];
  assert.equal(sl.length, 6, "ringkas, kelompok, pengguna, matriks kelompok, dokumen per hari (1), catatan");
  assert.deepEqual(sl.map(x => x.querySelector(".p-pg").textContent), ["1 / 6", "2 / 6", "3 / 6", "4 / 6", "5 / 6", "6 / 6"]);
  // slide 1: judul kesimpulan dari data, meta, hero 72pt, 1 grafik batang tunggal, 1 kalimat insight; tanpa KPI/legenda/tabel/pita
  assert.ok(/^20 dokumen dibuat 1-10 Okt; puncak \d+ Okt$/.test(sl[0].querySelector("h1").textContent), sl[0].querySelector("h1").textContent);
  assert.ok(sl[0].querySelector(".p-meta").textContent.includes("PT <Contoh>") && /Diambil pada \d\d\.\d\d/.test(sl[0].querySelector(".p-meta").textContent));
  assert.equal(sl[0].querySelector(".p-hero b").textContent, "20");
  assert.ok(/\d+ pengguna · \d+ jenis · \d+ hari aktif/.test(sl[0].querySelector(".p-hero span").textContent));
  assert.equal(sl[0].querySelectorAll("svg").length, 1);
  assert.ok(sl[0].querySelectorAll("svg rect").length >= 1 && sl[0].querySelector('svg rect[fill="#0A6B5C"]'), "puncak = teal");
  assert.ok(/viewBox="0 0 1000 \d+"/.test(sl[0].innerHTML) && /font-size="22"/.test(sl[0].innerHTML));
  assert.ok(sl[0].querySelector(".p-sum").textContent.startsWith("Kelompok terbanyak:"));
  assert.equal(sl[0].querySelector(".p-kpi, .p-leg, .p-us, .p-rib, table"), null, "slide 1 bersih");
  assert.equal(d.querySelector(".p-rib"), null, "pita dihapus");
  // slide 2: judul % kelompok teratas; maks 3 nada + Lainnya; 10 dokumen terbanyak tetap
  assert.ok(/^\S+ \d+% dari dokumen$/.test(sl[1].querySelector("h2.p-ti").textContent));
  assert.ok(sl[1].querySelectorAll(".p-gr").length <= 4 && sl[1].querySelector(".p-gr"));
  assert.ok(sl[1].querySelectorAll("table.p-top tbody tr").length <= 10);
  assert.ok(/#0A4F47/i.test(sl[1].innerHTML), "peringkat 1");
  // slide 3: nama asli, judul dihitung, kalimat etika tepat di bawah judul
  assert.ok(/^\d dari \d pengguna mencatat \d+% dokumen$/.test(sl[2].querySelector("h2.p-ti").textContent));
  assert.equal(sl[2].querySelector("h2.p-ti + p.p-etik").textContent, "Jumlah dokumen bukan ukuran kinerja.");
  assert.ok(sl[2].textContent.includes("Ani"));
  assert.ok(sl[2].querySelectorAll("tbody tr").length <= 4, "3 teratas + Lainnya");
  // slide 4: heat teal, nol = ·, Total semua = total sumber
  assert.ok(/^Puncak /.test(sl[3].querySelector("h2.p-ti").textContent));
  const all = sl[3].querySelector("tr.all"); assert.ok(all && num(all.lastElementChild.textContent) === 20);
  assert.ok(sl[3].querySelector("td.hm[style*='background:#']"), "heat bertint");
  assert.ok([...sl[3].querySelectorAll("td.hm")].every(td => !td.textContent.trim() || td.textContent.trim() === "·" || /\d/.test(td.textContent)));
  assert.ok(!/(#5558D6|#3F9A2E|#E8741C|#2A7FD4)/i.test(html), "palet GROUPS tidak dipakai di PDF");
  // slide 5: Dokumen per hari (bentuk pivot Excel): lengkap, total = total sumber
  assert.equal(sl[4].querySelector("h2.p-ti").textContent, "Dokumen per hari");
  assert.deepEqual([...sl[4].querySelectorAll("thead th")].slice(0, 2).map(x => x.textContent), ["Kelompok", "Dokumen"]);
  assert.equal(sl[4].querySelectorAll("tbody tr:not(.all)").length, 3, "3 dokumen non-approval, tidak digabung");
  assert.ok(num(sl[4].querySelector("tr.all").lastElementChild.textContent) === 20 && sl[4].querySelector("tr.all").textContent.includes("Total keseluruhan"));
  // slide terakhir: maks 4 poin, tanpa label internal
  assert.ok(sl[5].querySelectorAll("li").length <= 4 && sl[5].querySelector(".p-note").textContent.includes("Dokumen yang dibatalkan belum disaring") && sl[5].textContent.includes("Filter aktif: tanpa filter tambahan"));
  assert.ok(!/Internal, jangan diteruskan/.test(html));
  assert.equal((html.match(/bukan ukuran kinerja/g) || []).length, 1, "catatan kinerja hanya di slide pengguna");
  // teknis cetak: tanpa variabel tema, tanpa animasi
  assert.ok(!/var\(/.test(html) && !/data-g=/.test(html) && !/animation/.test(html));
  assert.ok(/font-family="system-ui/.test(html));
  assert.ok(css.includes("size: 297mm 167mm") && css.includes("margin: 0") && !css.includes("A4 portrait"), "ukuran slide 16:9");
  assert.ok(!/terbaik|terajin|peringkat|paling rajin/i.test(html));
  noRed(html + css);
  const tcss = readFileSync(new URL("../../main/resources/static/countdoc.html", import.meta.url), "utf8");
  assert.ok(/\.p-slide\s*\{[^}]*break-after: page/.test(tcss) && /\.p-slide:last-child\s*\{[^}]*break-after: auto/.test(tcss) && /\.p-slide\s*\{[^}]*break-inside: avoid/.test(tcss));
  assert.ok(/#cd-print \*\s*\{[^}]*print-color-adjust: exact/.test(tcss));
  assert.ok(/h1, #cd-print \.p-slide h2\.p-ti \{ font-size: 27pt/.test(tcss), "judul 27pt");
  assert.ok(/\.p-slide \{[^}]*font-size: 18pt/.test(tcss) && /table\.p-m \{ font-size: 14pt/.test(tcss), "isi 18pt, sel matriks 14pt");
  assert.ok(/\.p-hero b \{ font-size: 60pt/.test(tcss) && /\.p-foot \{[^}]*font-size: 12pt/.test(tcss) && /\.p-rib \{ display: none/.test(tcss));
  noRed(tcss);
  // satu saklar Samarkan nama mengatur layar + PDF
  const cb = root.querySelector('[data-f="mask"]'); cb.checked = true; cb.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  const r2 = print("share").html;
  assert.ok(/User 1/.test(r2) && !/Ani|Budi/.test(r2));
  assert.equal(sessionStorage.getItem("cd-mask"), "1");
  assert.equal(sessionStorage.getItem("cd-tpl"), "share");
});

test("slide: data kosong tidak merusak layout", { skip }, async () => {
  const f = clone(fx); f.resp.rows = [];
  const { print } = await boot(f.resp, f.meta);
  const html = print("share").html;
  assert.ok(html.includes("Belum ada dokumen tercatat pada"));
  const d = doc(html);
  assert.equal(d.querySelectorAll(".p-slide").length, 2, "hanya cover + catatan, tanpa slide kosong");
  assert.ok(d.querySelector(".p-slide").textContent.includes("Belum ada data untuk filter ini") && !d.querySelector("svg"));
  assert.ok(!html.includes("NaN") && !html.includes("undefined"));
  assert.deepEqual([...d.querySelectorAll(".p-pg")].map(x => x.textContent), ["1 / 2", "2 / 2"]);
  const m = print("matrix").html;
  assert.ok(m.includes("Tidak ada data untuk filter ini") && !m.includes("NaN"));
});

test("slide: satu pengguna, satu hari", { skip }, async () => {
  const f = clone(fx); f.resp.from = f.resp.to = "2026-10-01"; f.resp.rows = [[1, 0, "2026-10-01", 7, "O"]];
  const { print } = await boot(f.resp, f.meta);
  const html = print("share").html;
  assert.equal(doc(html).querySelector("h1").textContent, "7 dokumen dibuat 1 Okt");
  assert.ok(html.includes("1 pengguna · 1 jenis · 1 hari aktif") && html.includes("Seluruhnya di kelompok Purchasing"));
  assert.ok(html.includes("Ani") && !html.includes("NaN"));
  assert.equal(doc(html).querySelectorAll(".p-slide:first-child svg rect").length, 1);
  assert.equal(doc(html).querySelectorAll(".p-slide").length, 6);
});

test("cetak: banyak hari (>31 = mingguan) dan > 40 jenis dokumen; kelompok tak dikenal = Lainnya", { skip }, async () => {
  const objs = Array.from({ length: 45 }, (_, i) => ({ id: `Dokumen_Dengan_Nama_Yang_Sangat_Panjang_Sekali_${i}`, label: `D${i}`, group: i % 2 ? "Sales" : `Kelompok${i % 6}`, role: "Pembuat", dateKind: "Tgl buat", approval: false }));
  const rows = []; let d0 = Date.UTC(2026, 7, 1);
  for (let d = 0; d < 80; d++) for (let o = 0; o < 45; o += 3) rows.push([o, d % 3, new Date(d0 + d * 864e5).toISOString().slice(0, 10), 1 + (d + o) % 7, "O"]);
  const resp = { company: "X", from: "2026-08-01", to: "2026-10-19", objects: objs.map(o => o.id), users: [["a", "A"], ["b", "B"], ["c", "C"]], rows };
  const { print, root } = await boot(resp, { objects: objs });
  const sh = print("share").html, dd = doc(sh);
  assert.ok(dd.querySelectorAll(".p-slide").length >= 7, "ada slide lanjutan dokumen per minggu");
  const dsl = [...dd.querySelectorAll(".p-slide")].filter(x => /^Dokumen per (minggu|bulan)/.test((x.querySelector("h2.p-ti") || x.querySelector("h1")).textContent));
  assert.equal(dsl.length, 2); assert.ok(dsl[0].querySelector("h2.p-ti").textContent.endsWith("(1/2)") && !dsl[0].querySelector("tr.all") && dsl[1].querySelector("tr.all"), "judul (1/2), header diulang, total di slide terakhir");
  assert.equal(dsl.reduce((n, x) => n + x.querySelectorAll("tbody tr:not(.all)").length, 0), 15, "semua dokumen tampil");
  assert.ok(/puncak (minggu |bulan )?\d+ \w+/.test(dd.querySelector("h1").textContent), "grafik mingguan");
  const sl = [...dd.querySelectorAll(".p-slide")];
  assert.equal(sl[1].querySelectorAll("table.p-top tbody tr").length, 10, "top 10 dokumen");
  assert.equal(sl[1].querySelectorAll(".p-gr").length, 2, "Sales + Lainnya (kelompok tak dikenal digabung)");
  assert.ok(sl[3].querySelector("h2.p-ti").textContent.includes("minggu") || sl[3].querySelector("h2.p-ti").textContent.includes("bulan"), "matriks slide dikelompokkan");
  assert.ok(dd.querySelectorAll("td.pt").length > 0, "sel teks panjang diberi kelas potong");
  const total = rows.reduce((t, r) => t + r[3], 0);
  const grp = [...sl[1].querySelectorAll(".p-gr b")].reduce((t, b) => t + num(b.textContent), 0);
  assert.equal(grp, total, "jumlah per kelompok = total");
  assert.equal(num(sl[3].querySelector("tr.all").lastElementChild.textContent), total, "Total semua matriks slide = total");
  root.querySelector('[data-v="date"]').click();
  const mx = print("matrix").html, md = doc(mx);
  assert.ok(md.querySelectorAll("table.pm").length >= 1 && mx.includes("minggu (mulai Senin)") && mx.includes("Total semua") && mx.includes("bukan ukuran kinerja"));
  root.querySelector('[data-v="user"]').click();
  const mu = print("matrix").html;
  assert.ok(mu.includes(">A<") && mu.includes("pengguna"), "matriks per pengguna");
  const it = print("internal").html;
  assert.ok(it.includes("Count Document (internal)") && it.includes('class="pm"'));
});

test("slide: 30 pengguna -> tabel pengguna maks 10 baris abjad + '... dan n lainnya', XSS ter-escape", { skip }, async () => {
  const objs = [{ id: "<img src=x onerror=alert(1)>", label: "X", group: "Grup<script>", role: "Pembuat", dateKind: "Tgl buat", approval: false }];
  const users = Array.from({ length: 30 }, (_, i) => [`u${i}`, `Nama${String(i).padStart(2, "0")}`]);
  const rows = users.map((_, u) => [0, u, "2026-10-0" + (1 + u % 9), 1 + u, "O"]);
  const resp = { company: "X", from: "2026-10-01", to: "2026-10-09", objects: [objs[0].id], users, rows };
  const { print } = await boot(resp, { objects: objs });
  const html = print("share").html, d = doc(html);
  const sl = [...d.querySelectorAll(".p-slide")];
  assert.equal(sl.length, 6);
  const tr = [...sl[2].querySelectorAll("tbody tr")];
  assert.equal(tr.length, 4);
  assert.ok(tr[3].textContent.includes("Lainnya (27 pengguna)"));
  assert.deepEqual(tr.slice(0, 3).map(r => r.cells[0].textContent), ["Nama29", "Nama28", "Nama27"], "3 teratas menurut jumlah");
  assert.ok(sl[2].querySelector("h2.p-ti").textContent.startsWith("3 dari 30 pengguna"));
  const total = rows.reduce((t, r) => t + r[3], 0);
  const g = [...sl[1].querySelectorAll(".p-gr b")].reduce((t, b) => t + num(b.textContent), 0);
  assert.equal(g, total, "jumlah per kelompok = total");
  assert.equal(d.querySelector("img, script"), null, "XSS ter-escape");
  assert.ok(html.includes("&lt;img") && !/terbaik|terajin|peringkat|paling rajin/i.test(html));
  noRed(html);
});
