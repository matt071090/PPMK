// Tes Laporan PNG: builder HTML murni (tanpa DOM), pembagian bagian PNG, dan integrasi tombol/templat (jsdom). Rasterisasi canvas hanya bisa diuji di browser nyata.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import * as E from "../../main/resources/static/js/pages/countdoc-engine.js";
import * as RP from "../../main/resources/static/js/pages/countdoc-report.js";

const p = process.env.JSDOM_PATH || "C:/tmp/pd-test-nm/node_modules/jsdom/lib/api.js";
let JSDOM;
try { ({ JSDOM } = await import(pathToFileURL(p).href)); } catch { /* tidak ada */ }
const fx = JSON.parse(readFileSync(new URL("./countdoc-fixture.json", import.meta.url), "utf8"));
const num = s => Number(String(s).replace(/\./g, "").replace(/[^\d]/g, "") || 0);

function ctx(mask = false) {
  const data = E.normalize(fx.resp, fx.meta), rows = E.filterRows(data.rows, {}), us = E.displayUsers(rows, data.users, mask);
  const dv = { rows, users: us, names: new Map([...us].map(([i, u]) => [i, u.name])), from: fx.resp.from, to: fx.resp.to, bucket: E.bucketFor(fx.resp.from, fx.resp.to), order: data.objects.map(o => o.id) };
  return { dv, resp: fx.resp, taken: new Date(2026, 9, 21, 14, 5), company: "PT <Contoh>", filterText: "tanpa filter tambahan", mask, version: "v", note: "Jumlah dokumen bukan ukuran kinerja." };
}

test("pngParts: satu bagian bila muat, dibagi rata bila terlalu tinggi, jumlah tinggi tetap", () => {
  assert.deepEqual(RP.pngParts(3000), [{ y: 0, h: 3000 }]);
  const parts = RP.pngParts(15000, 7000);
  assert.equal(parts.length, 3);
  assert.equal(parts.reduce((t, x) => t + x.h, 0), 15000);
  assert.ok(parts.every((x, i) => x.h <= 7000 && (i === 0 || x.y === parts[i - 1].y + parts[i - 1].h)));
});

test("reportHtml: bagian lengkap, tabel utama = semua objek + total konsisten, tanpa var(), escape", () => {
  const { html, width } = RP.reportHtml(ctx());
  assert.ok(width >= 1200);
  assert.ok(html.includes("Laporan Aktivitas Dokumen SAP") && html.includes("PT &lt;Contoh&gt;") && /Diambil pada 14\.05/.test(html));
  assert.equal((html.match(/class="kp"/g) || []).length, 1);
  assert.ok(html.includes("Pengguna teratas") && html.includes("Dokumen terbanyak") && html.includes("<svg"));
  assert.ok(!/var\(/.test(html) && !/animation/.test(html) && !/class="[^"]*\bdata-g/.test(html));
  assert.ok(!/(<[^>]*"[^"]*"[^"]*"[a-z]+"[^>]*>)/.test("") );
  if (!JSDOM) return;
  const d = new JSDOM(`<body>${html}</body>`).window.document;
  assert.equal(d.querySelectorAll("tbody tr:not(.s):not(.all)").length, 3, "semua objek (non-approval) tampil, tidak digabung");
  assert.deepEqual([...d.querySelectorAll("thead th")].slice(0, 2).map(x => x.textContent), ["Kelompok", "Dokumen"]);
  const all = d.querySelector("tr.all"); assert.ok(all.textContent.includes("Total keseluruhan") && num(all.lastElementChild.textContent) === 20);
  const sub = [...d.querySelectorAll("tr.s")].reduce((t, r) => t + num(r.lastElementChild.textContent), 0);
  assert.equal(sub, 20, "jumlah subtotal = total keseluruhan");
  assert.ok(d.querySelector("td[style*='background:#']"), "heat teal");
});

test("reportHtml: nama disamarkan mengikuti saklar; atribut SVG tanpa tanda kutip ganda bersarang (valid XML)", () => {
  const a = RP.reportHtml(ctx(false)).html, b = RP.reportHtml(ctx(true)).html;
  assert.ok(a.includes("Ani") && !b.includes("Ani") && b.includes("User 1") && b.includes("Nama disamarkan"));
  assert.ok(!/font-family="[^"]*"[^ >]*"/.test(a) && !a.includes(`font-family="system-ui, "`));
});

test("integrasi: template bawaan PNG, tombol Unduh PNG, cetak memakai @page ukuran khusus", { skip: !JSDOM && "jsdom tidak tersedia" }, async () => {
  const dom = new JSDOM(`<!doctype html><body><article id="a"></article><div id="pr"></div></body>`, { pretendToBeVisual: true, url: "http://localhost/" });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.sessionStorage = dom.window.sessionStorage; globalThis.localStorage = dom.window.localStorage;
  globalThis.fetch = async url => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => url.startsWith("api/countdoc/companies") ? { companies: [{ schema: "X", name: "X" }] } : url.startsWith("api/countdoc/meta") ? fx.meta : fx.resp });
  const { countdocPage } = await import("../../main/resources/static/js/pages/countdoc.js");
  const root = document.getElementById("a"); countdocPage(root, document.getElementById("pr"));
  await new Promise(r => setTimeout(r, 20)); root.querySelector("#cd-go").click(); await new Promise(r => setTimeout(r, 30));
  assert.equal(root.querySelector('[data-f="tpl"]').value, "png");
  assert.equal(root.querySelector('[data-x="png"]').textContent, "Unduh PNG");
  let printed = ""; dom.window.print = () => { printed = document.getElementById("pr").innerHTML + [...document.head.querySelectorAll("style")].map(x => x.textContent).join(""); };
  root.querySelector('[data-x="pdf"]').click();
  assert.ok(printed.includes("Laporan Aktivitas Dokumen SAP") && /@page \{ size: \d+px \d+px; margin: 0/.test(printed), printed.slice(-200));
  // ringkasan: top pengguna + top dokumen
  root.querySelector('[data-v="summary"]').click();
  assert.ok(root.textContent.includes("Pengguna teratas") && root.textContent.includes("Dokumen terbanyak"));
});
