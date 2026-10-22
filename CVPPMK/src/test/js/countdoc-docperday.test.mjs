// Tes tab "Dokumen per hari" (bentuk pivot Excel Query1): kolom Kelompok | No | Dokumen | hari | Grand Total, tanpa breakdown user.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import * as E from "../../main/resources/static/js/pages/countdoc-engine.js";

const p = process.env.JSDOM_PATH || "C:/tmp/pd-test-nm/node_modules/jsdom/lib/api.js";
let JSDOM;
try { ({ JSDOM } = await import(pathToFileURL(p).href)); } catch { /* tidak ada */ }
const fx = JSON.parse(readFileSync(new URL("./countdoc-fixture.json", import.meta.url), "utf8"));
const num = s => Number(String(s).replace(/\./g, "") || 0);

test("engine docMatrix: header, Kelompok terisi tiap baris, No urut, Total keseluruhan, sel 0 kosong", () => {
  const p = { cols: [{ key: "2026-10-01", label: "2026-10-01" }, { key: "2026-10-02", label: "2026-10-02" }], groups: [
    { group: "A", objects: [{ id: "x", cells: { "2026-10-01": 2 }, total: 2 }, { id: "y", cells: { "2026-10-02": 3 }, total: 3 }], subtotal: { cells: { "2026-10-01": 2, "2026-10-02": 3 }, total: 5 } },
    { group: "B", objects: [{ id: "z", cells: { "2026-10-01": 1, "2026-10-02": 1 }, total: 2 }], subtotal: { cells: { "2026-10-01": 1, "2026-10-02": 1 }, total: 2 } }] };
  const m = E.docMatrix(p);
  assert.deepEqual(m[0], ["Kelompok", "No", "Dokumen", "2026-10-01", "2026-10-02", "Grand Total"]);
  assert.deepEqual(m[1], ["A", 1, "x", 2, "", 2]);
  assert.deepEqual(m[3], ["B", 3, "z", 1, 1, 2]);
  assert.deepEqual(m[4], ["", "", "Total keseluruhan", 3, 4, 7]);
  assert.equal(m.length, 5);
});

test("tab Dokumen per hari: kolom, tanpa breakdown user, total = total Per tanggal, ekspor", { skip: !JSDOM && "jsdom tidak tersedia" }, async () => {
  const dom = new JSDOM(`<!doctype html><body><article id="a"></article><div id="pr"></div></body>`, { pretendToBeVisual: true, url: "http://localhost/" });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.sessionStorage = dom.window.sessionStorage; globalThis.localStorage = dom.window.localStorage;
  globalThis.fetch = async url => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => url.startsWith("api/countdoc/companies") ? { companies: [{ schema: "X", name: "X" }] } : url.startsWith("api/countdoc/meta") ? fx.meta : fx.resp });
  const { countdocPage } = await import("../../main/resources/static/js/pages/countdoc.js");
  const root = document.getElementById("a"); countdocPage(root, document.getElementById("pr"));
  await new Promise(r => setTimeout(r, 20)); root.querySelector("#cd-go").click(); await new Promise(r => setTimeout(r, 30));
  root.querySelector('[data-v="date"]').click();
  const tDate = num(root.querySelector("table.cd-m tfoot td.tt").textContent);
  root.querySelector('[data-v="doc"]').click();
  const t = root.querySelector("table.cd-m");
  assert.ok(t.classList.contains("has-no"));
  assert.deepEqual([...t.querySelectorAll("thead th")].slice(0, 3).map(x => x.textContent), ["Kelompok", "No", "Dokumen"]);
  assert.equal(t.querySelector("thead th.tt").textContent, "Grand Total");
  assert.equal(t.querySelector("tfoot th").textContent, "Total keseluruhan");
  assert.ok(t.querySelector("thead th.c .d1") && t.querySelector("thead th.c .d2"), "header hari/tanggal dua baris");
  assert.deepEqual([...t.querySelectorAll("tbody tr.o td.no")].map(x => x.textContent), ["1", "2", "3", "4"].slice(0, t.querySelectorAll("tbody tr.o").length), "No urut 1..n");
  assert.equal(num(t.querySelector("tfoot td.tt").textContent), tDate, "total sama dengan Per tanggal");
  assert.ok(!/Per user|User/.test(t.textContent) || !t.querySelector("thead .u1"), "tanpa kolom user");
  // ciut subtotal + klik sel tetap membuka rincian
  t.querySelector(".cd-tg").click(); assert.ok(t.querySelector("tbody").classList.contains("cd-col"));
  t.querySelector("td.n[data-o]").click(); assert.ok(!root.querySelector("#cd-detail").hidden);
  // ekspor: CSV dan Excel mengikuti tab ini
  const blobs = []; dom.window.URL.createObjectURL = b => { blobs.push(b); return "blob:x"; }; dom.window.URL.revokeObjectURL = () => {};
  globalThis.URL.createObjectURL = dom.window.URL.createObjectURL; globalThis.Blob = dom.window.Blob;
  root.querySelector('[data-x="csv"]').click(); root.querySelector('[data-x="xlsx"]').click();
  assert.ok(!/Ekspor gagal/.test(root.querySelector("#cd-status").textContent), root.querySelector("#cd-status").textContent);
  assert.equal(blobs.length, 2);
  const csv = await new Promise(r => { const fr = new dom.window.FileReader(); fr.onload = () => r(fr.result); fr.readAsText(blobs[0]); });
  const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
  assert.ok(lines[0].startsWith("Kelompok;No;Dokumen;2026-10-01") && lines[0].endsWith(";Grand Total"));
  assert.ok(lines.some(l => l.startsWith(";;Total keseluruhan;")));
  // navigasi panah melewati kolom No
  const first = t.querySelector("tbody:not(.cd-col) tr.o td.n[data-o]") || [...t.querySelectorAll("tbody tr.o td.n[data-o]")][0];
  assert.ok(first.cellIndex >= 3, "sel data mulai setelah Kelompok, No, Dokumen");
});
