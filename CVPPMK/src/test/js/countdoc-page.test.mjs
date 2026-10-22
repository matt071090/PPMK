// Tes render halaman dengan jsdom (alat uji di luar proyek; dilewati bila tidak ada). Jalankan: JSDOM_PATH=<folder node_modules/jsdom> node --test src/test/js/
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const p = process.env.JSDOM_PATH || "C:/tmp/pd-test-nm/node_modules/jsdom/lib/api.js";
let JSDOM;
try { ({ JSDOM } = await import(pathToFileURL(p).href)); } catch { /* tidak ada */ }
const fx = JSON.parse(readFileSync(new URL("./countdoc-fixture.json", import.meta.url), "utf8"));
fx.resp.users[3] = ["budi", "<img src=x onerror=alert(1)>"];
fx.resp.companyName = "PT Contoh";
fx.resp.errors = [{ object: "Survey", reason: "timeout" }];

test("halaman Count Document: muat, matriks berkolom kelompok, filter, urut, drawer, samarkan, escape", { skip: !JSDOM && "jsdom tidak tersedia" }, async () => {
  const dom = new JSDOM(`<!doctype html><body><article id="a"></article><div id="pr"></div></body>`, { pretendToBeVisual: true, url: "http://localhost/" });
  globalThis.window = dom.window; globalThis.document = dom.window.document;
  globalThis.sessionStorage = dom.window.sessionStorage; globalThis.localStorage = dom.window.localStorage;
  const calls = [];
  globalThis.fetch = async url => {
    calls.push(url);
    const body = url.startsWith("api/countdoc/companies") ? { companies: [{ schema: "LIVE_X", name: "PT Contoh", active: true }] }
      : url.startsWith("api/countdoc/meta") ? fx.meta : fx.resp;
    return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => body };
  };
  const { countdocPage } = await import("../../main/resources/static/js/pages/countdoc.js");
  const root = document.getElementById("a");
  const pg = countdocPage(root, document.getElementById("pr"));
  await new Promise(r => setTimeout(r, 20));
  assert.equal(root.querySelector("#cd-co").value, "LIVE_X");
  root.querySelector("#cd-from").value = "2026-10-01"; root.querySelector("#cd-to").value = "2026-10-10";
  root.querySelector("#cd-go").click();
  await new Promise(r => setTimeout(r, 30));
  assert.ok(calls.some(u => u.includes("company=LIVE_X") && u.includes("from=2026-10-01")));
  const html = root.innerHTML;
  assert.ok(html.includes("Perlu dicek") && html.includes("Survey"));
  assert.ok(!/class="lead"/.test(html), "tanpa paragraf lead");
  assert.equal(root.querySelector("img"), null, "nama user harus di-escape");
  // tab: Per tanggal | Per user (BAWAAN) | Ringkasan | Data; tanpa tab mati
  assert.deepEqual([...root.querySelectorAll('[role="tab"]')].map(b => b.dataset.v), ["doc", "date", "user", "summary", "table"]);
  assert.ok(!root.textContent.includes("Pivot sendiri") && root.querySelector('[data-v="table"]').textContent === "Data");
  assert.equal(root.querySelector('[role="tab"][aria-selected="true"]').dataset.v, "doc", "tab utama = Dokumen per hari");
  assert.equal(pg.st.view, "doc");
  root.querySelector('[data-v="user"]').click(); assert.equal(pg.st.view, "user");
  assert.ok(!/Grand Total/i.test(root.innerHTML));
  // KPI 4 kartu di atas tab, hero pertama
  assert.equal(root.querySelectorAll(".cd-kpi").length, 4);
  assert.ok(root.querySelector(".cd-kpi").classList.contains("hero"));
  assert.ok(root.querySelector("#cd-kpi").compareDocumentPosition(root.querySelector(".cd-tabs")) & 4, "KPI di atas tab");
  assert.ok(/Diambil pada \d\d\.\d\d/.test(root.querySelector(".cd-ctx").textContent));
  // matriks per user: nama asli bawaan, kode di baris 2, urut abjad
  let t = root.querySelector("table.cd-m");
  assert.ok(t && t.querySelector("caption").textContent.includes("user"));
  const heads = [...t.querySelectorAll("thead th.c")];
  const ani = heads.find(h => h.querySelector(".u1").textContent === "Ani");
  assert.ok(ani && ani.querySelector(".u2").textContent === "ani", "kode di baris 2");
  assert.ok(heads.some(h => h.querySelector(".u1").textContent.includes("<img")), "nama di-escape (tampil sebagai teks)");
  assert.equal(heads[heads.length - 1].querySelector(".u1").textContent, "(tanpa user)", "tanpa user di akhir");
  const nm = heads.map(h => h.querySelector(".u1").textContent).slice(0, -1);
  assert.deepEqual(nm, [...nm].sort((x, y) => x.localeCompare(y, "id", { numeric: true, sensitivity: "base" })), "urut abjad");
  assert.ok(t.querySelector("tbody tr.o td.k").dataset.g.length >= 2, "sel kelompok ada di setiap baris");
  assert.ok(!t.querySelector("[rowspan]"), "tanpa rowspan");
  assert.ok(t.querySelectorAll("tbody tr.o td.k .cd-sr").length >= 1);
  assert.ok(t.querySelector("tbody tr.sub td.k .cd-bd"), "badge di baris pembuka blok");
  assert.equal(t.querySelectorAll("tbody tr.o td.k .cd-bd").length, 0);
  assert.equal(t.querySelector("tfoot th").textContent, "Total semua");
  assert.ok(t.querySelector("tbody th[scope=row]") && t.querySelector("thead th[scope=col]"));
  assert.equal(t.querySelector("td.n.e").textContent, "", "sel kosong tanpa '-'");
  assert.ok(t.querySelector("td.n[class*=' h']"), "ada latar heat");
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(root.querySelector("#cd-view").innerHTML.replace(/&#\d+;/g, "")), "tanpa hex di markup");
  assert.ok(root.querySelector(".cd-ucs .cd-uc"), "kartu per user");
  const cellSum = [...t.querySelectorAll("tbody tr.o td.n[data-o]")].reduce((a, td) => a + Number(td.textContent.replace(/\./g, "")), 0);
  assert.ok(cellSum > 0 && cellSum === Number(t.querySelector("tfoot td.tt").textContent.replace(/\./g, "")));
  // ciut/buka kelompok
  const tg = t.querySelector(".cd-tg"); tg.click();
  assert.ok(t.querySelector("tbody").classList.contains("cd-col") && tg.getAttribute("aria-expanded") === "false");
  tg.click(); assert.ok(!t.querySelector("tbody").classList.contains("cd-col"));
  // urut: klik 1 turun, 2 naik, 3 reset
  const th = () => root.querySelector("table.cd-m thead th.tt");
  root.querySelector('[data-sk="total"]').click(); assert.equal(th().getAttribute("aria-sort"), "descending");
  root.querySelector('[data-sk="total"]').click(); assert.equal(th().getAttribute("aria-sort"), "ascending");
  root.querySelector('[data-sk="total"]').click(); assert.equal(th().getAttribute("aria-sort"), null);
  // klik sel -> drawer rincian (di-escape)
  root.querySelector("table.cd-m td.n[data-o]").click();
  const det = root.querySelector("#cd-detail");
  assert.ok(!det.hidden && det.textContent.includes("Rincian") && det.querySelector("table"));
  assert.equal(root.querySelector("img"), null);
  root.querySelector('[data-act="close-detail"]').click();
  assert.equal(root.querySelector("#cd-detail").innerHTML, ""); assert.ok(root.querySelector("#cd-detail").hidden);
  // chip kelompok = legenda + filter: klik memilih hanya itu, klik lagi membersihkan
  const chips = [...root.querySelectorAll(".cd-chip")];
  assert.ok(chips.length >= 3 && chips.every(c => c.dataset.g && /\d/.test(c.querySelector("b").textContent)));
  chips.find(c => c.dataset.gn === "Purchasing").click();
  assert.equal(root.querySelector('.cd-chip[data-gn="Purchasing"]').getAttribute("aria-pressed"), "true");
  assert.ok(/Filter aktif: kelompok Purchasing/.test(root.querySelector("#cd-active").textContent));
  assert.ok(!root.querySelector("table.cd-m").textContent.includes("Vendor"));
  root.querySelector('.cd-chip[data-gn="Purchasing"]').click();
  assert.equal(root.querySelector("#cd-active").innerHTML, "");
  // cari (debounce 150 ms) + empty state yang menjelaskan filter + Reset
  const q = root.querySelector("#cd-q"); q.value = "zzzz"; q.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  await new Promise(r => setTimeout(r, 220));
  assert.ok(root.querySelector(".cd-empty").textContent.includes('pencarian "zzzz"'));
  root.querySelector('.cd-empty [data-act="reset"]').click();
  assert.equal(root.querySelector(".cd-empty"), null);
  // padat/nyaman diingat
  root.querySelector('[data-dens="comfy"]').click();
  assert.ok(root.classList.contains("comfy")); assert.equal(localStorage.getItem("cd-dens"), "comfy");
  // Per tanggal: header akhir pekan dua baris, kolom Kelompok sendiri
  root.querySelector('[data-v="date"]').click();
  t = root.querySelector("table.cd-m");
  assert.ok(t.querySelector("caption").textContent.includes("tanggal") && t.textContent.includes("Total Purchasing"));
  assert.ok(t.querySelector("thead th.we .d1") && t.querySelector("thead th.we .d2"), "akhir pekan: dua baris");
  assert.equal(t.querySelector("thead th.k").textContent, "Kelompok");
  // ringkasan: grafik bertumpuk + batang per kelompok
  root.querySelector('[data-v="summary"]').click();
  assert.ok(root.querySelector("svg.cd-svg [data-g]") && root.querySelector("svg.cd-svg text.z"));
  assert.ok(root.querySelector(".cd-gb .cd-bd") && root.querySelector(".cd-leg"));
  // ekspor mengikuti tampilan aktif (tanpa melempar)
  root.querySelector('[data-v="date"]').click();
  const blobs = []; dom.window.URL.createObjectURL = b => { blobs.push(b); return "blob:x"; }; dom.window.URL.revokeObjectURL = () => {};
  globalThis.URL.createObjectURL = dom.window.URL.createObjectURL; globalThis.Blob = dom.window.Blob;
  let printed = ""; dom.window.print = () => { printed = document.getElementById("pr").innerHTML + [...document.head.querySelectorAll("style")].map(x => x.textContent).join(""); };
  const tp = root.querySelector('[data-f="tpl"]'); tp.value = "internal"; tp.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  root.querySelector('[data-x="csv"]').click(); root.querySelector('[data-x="xlsx"]').click(); root.querySelector('[data-x="pdf"]').click();
  assert.ok(!/Ekspor gagal/.test(root.querySelector("#cd-status").textContent), root.querySelector("#cd-status").textContent);
  assert.equal(blobs.length, 2);
  assert.ok(printed.includes('class="pm"') && printed.includes("Total semua") && printed.includes("A4 landscape"));
  // persetujuan default disembunyikan, bisa dinyalakan lewat Filter lain
  assert.ok(!t.textContent.includes("AP_INV_Approved"));
  const ap = root.querySelector('[data-f="approval"]'); ap.checked = true; ap.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  assert.ok(root.querySelector("table.cd-m").textContent.includes("AP_INV_Approved"));
  // samarkan: saklar tunggal, bawaan mati, diingat per sesi
  assert.equal(root.querySelector('[data-f="mask"]').checked, false);
  assert.equal(root.querySelectorAll('[data-f="anon"], [data-f="anonp"]').length, 0, "dua saklar lama dihapus");
  const an = root.querySelector('[data-f="mask"]'); an.checked = true; an.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  root.querySelector('[data-v="user"]').click();
  const ut = root.querySelector("table.cd-m").textContent;
  assert.ok(/User 1/.test(ut) && !/Ani|Budi|\bani\b/.test(ut), "nama dan kode tersamar");
  assert.equal(root.querySelector("table.cd-m thead .u2"), null, "kode tidak tampil saat disamarkan");
  assert.equal(sessionStorage.getItem("cd-mask"), "1");
  // Data
  root.querySelector('[data-v="table"]').click();
  assert.ok(root.querySelector("table.cd-flat td[data-l='Jenis tanggal']") && root.textContent.includes("(tanpa tanggal)"));
  assert.ok(pg.st.view === "table");
  // sumber dilipat setelah data dimuat, "Ubah" membukanya lagi
  assert.ok(root.querySelector("#cd-src").hidden);
  root.querySelector('[data-act="edit"]').click();
  assert.ok(!root.querySelector("#cd-src").hidden);
});
