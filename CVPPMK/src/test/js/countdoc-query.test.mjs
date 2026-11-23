// Tes halaman "Daftar Query" Count Document (Tahap A), TANPA DB: logika murni + render dengan jsdom dan fetch palsu.
// Jalankan: JSDOM_PATH=<folder node_modules/jsdom/lib/api.js> node --test src/test/js/
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import * as L from "../../main/resources/static/js/pages/countdoc-query-lib.js";

const p = process.env.JSDOM_PATH || "C:/tmp/pd-test-nm/node_modules/jsdom/lib/api.js";
let JSDOM;
try { ({ JSDOM } = await import(pathToFileURL(p).href)); } catch { /* tidak ada */ }

test("deriveRun: prioritas error > kosong > terpotong > lambat > ok", () => {
  assert.equal(L.deriveRun({ error: "tidak_tersedia", ms: 5 }).state, "tidak_tersedia");
  assert.equal(L.deriveRun({ error: "timeout", ms: 60000 }).state, "gagal");
  assert.equal(L.deriveRun({ error: "gagal", code: "AB1" }).code, "AB1");
  assert.equal(L.deriveRun({ rows: [], ms: 20 }).state, "kosong");
  assert.equal(L.deriveRun({ rows: [[1]], truncated: true, ms: 9000 }).state, "terpotong");
  assert.equal(L.deriveRun({ rows: [[1]], ms: 8000 }).state, "lambat");
  assert.equal(L.deriveRun({ rows: [[1]], ms: 7999 }).state, "ok");
  assert.equal(L.deriveRun({ rows: [[1], [2]], ms: 12 }).rows, 2);
  assert.equal(L.deriveRun(null).state, "gagal");
});

test("sortRows: tipe num/date/text, null di akhir, stabil, desc", () => {
  const rows = [["b", 10, "2026-02-01"], ["a", 9, "2026-01-01"], [null, null, null], ["c", 100, "2026-03-01"], ["a2", 9, "2026-01-01"]];
  assert.deepEqual(L.sortRows(rows, 1, "num", "asc").map(r => r[1]), [9, 9, 10, 100, null], "angka bukan teks (9 < 10 < 100)");
  assert.deepEqual(L.sortRows(rows, 1, "num", "asc").map(r => r[0]).slice(0, 2), ["a", "a2"], "stabil untuk nilai sama");
  assert.deepEqual(L.sortRows(rows, 1, "num", "desc").map(r => r[1]), [100, 10, 9, 9, null], "null tetap di akhir saat desc");
  assert.deepEqual(L.sortRows(rows, 2, "date", "asc").map(r => r[2]), ["2026-01-01", "2026-01-01", "2026-02-01", "2026-03-01", null]);
  assert.deepEqual(L.sortRows(rows, 0, "text", "asc").map(r => r[0]), ["a", "a2", "b", "c", null]);
  assert.deepEqual(L.sortRows([["x10"], ["x9"]], 0, "text", "asc").map(r => r[0]), ["x9", "x10"], "urut natural");
  assert.deepEqual(L.sortRows(rows, 1, "num", null), rows, "dir null = urutan asli");
  assert.notEqual(L.sortRows(rows, null, "num", "asc"), rows, "salinan, bukan array asli");
});

test("filterRows & paginate", () => {
  const rows = [["Ani", 1], ["Budi", 22], [null, 3]];
  assert.equal(L.filterRows(rows, "").length, 3);
  assert.deepEqual(L.filterRows(rows, " BUD ").map(r => r[0]), ["Budi"]);
  assert.deepEqual(L.filterRows(rows, "22").map(r => r[0]), ["Budi"], "cocok ke angka");
  assert.equal(L.filterRows(rows, "zzz").length, 0);
  assert.deepEqual(L.paginate(120, 0, 50), { page: 0, pages: 3, size: 50, from: 0, to: 50 });
  assert.deepEqual(L.paginate(120, 2, 50), { page: 2, pages: 3, size: 50, from: 100, to: 120 });
  assert.equal(L.paginate(120, 99, 50).page, 2, "halaman dijepit");
  assert.equal(L.paginate(120, -3, 50).page, 0);
  assert.equal(L.paginate(0, 0, 50).pages, 1);
  assert.equal(L.paginate(10, 0, 7).size, 50, "ukuran tak sah -> 50");
  assert.deepEqual(L.PAGE_SIZES, [25, 50, 100, 250]);
});

test("CSV: ; dan BOM, kutip, dan netralkan awalan = + - @", () => {
  const cols = [{ name: "Nama" }, { name: "Jumlah" }];
  const csv = L.csvOf(cols, [["=HYPERLINK(\"x\")", 1.5], ["+1", 2], ["-x", 3], ["@a", 4], ["a;b", 5], ["bar\nis", 6], ["ok", -7]]);
  assert.ok(csv.startsWith("\uFEFFNama;Jumlah\r\n"));
  const lines = csv.split("\r\n");
  assert.equal(lines[1], "\"'=HYPERLINK(\"\"x\"\")\";1,5");
  assert.equal(lines[2], "'+1;2"); assert.equal(lines[3], "'-x;3"); assert.equal(lines[4], "'@a;4");
  assert.equal(lines[5], "\"a;b\";5");
  assert.ok(csv.includes("\"bar\nis\";6"));
  assert.ok(csv.includes("ok;-7"), "angka negatif sungguhan tidak diberi awalan");
});

test("groupQueries, matchesQuery, loadRuns, slugName", () => {
  const qs = [{ id: "a", label: "Vendor", group: "MasterData", source: "OCRD" }, { id: "b", label: "SO", group: "Sales", source: "ORDR" }, { id: "c", label: "Cust", group: "MasterData", source: "OCRD" }];
  const g = L.groupQueries(qs, null);
  assert.deepEqual(g.map(x => [x.group, x.items.length]), [["MasterData", 2], ["Sales", 1]]);
  assert.deepEqual(L.groupQueries(qs, q => L.matchesQuery(q, "ordr")).map(x => x.group), ["Sales"]);
  assert.equal(L.matchesQuery(qs[0], "  "), true);
  assert.deepEqual(L.loadRuns('{"a":{"state":"ok","ms":5,"rows":2},"b":{"state":"ngawur"},"c":{"state":"belum"}}'), { a: { state: "ok", ms: 5, rows: 2, code: null } });
  assert.deepEqual(L.loadRuns("{rusak"), {});
  assert.equal(L.slugName("Closed_PO (tgl diubah)"), "Closed_PO_tgl_diubah");
});

const QUERIES = [
  { id: "Vendor", label: "Vendor", group: "MasterData", role: "Pembuat", dateKind: "Tgl buat", source: "OCRD", approval: false, sql: "SELECT 1 WHERE d >= :from AND d <= :to" },
  { id: "Customer", label: "Customer", group: "MasterData", role: "Pembuat", dateKind: "Tgl buat", source: "OCRD", approval: false, sql: "SELECT 2 <b>x</b>" },
  { id: "Production Order", label: "Production Order", group: "Production", role: "Pembuat", dateKind: "Tgl buat", source: "OWOR", approval: false, sql: "SELECT 3" }
];
const manyRows = Array.from({ length: 130 }, (_, i) => [`U${i}`, i, "2026-10-" + String(1 + (i % 28)).padStart(2, "0")]);
const COLS = [{ name: "USER_CODE", type: "text" }, { name: "Counted", type: "num" }, { name: "CreateDate", type: "date" }];

test("halaman Daftar Query: daftar, saring, jalankan, tabel, sort, filter, paging, cek manual, XSS", { skip: !JSDOM && "jsdom tidak tersedia" }, async () => {
  const dom = new JSDOM(`<!doctype html><body><article id="a"></article></body>`, { pretendToBeVisual: true, url: "http://localhost/countdoc-query.html" });
  const w = dom.window;
  globalThis.window = w; globalThis.document = w.document; globalThis.location = w.location;
  globalThis.sessionStorage = w.sessionStorage; globalThis.localStorage = w.localStorage; globalThis.Blob = w.Blob;
  const calls = [], downloads = [];
  w.URL.createObjectURL = b => { downloads.push(b); return "blob:x"; }; w.URL.revokeObjectURL = () => { };
  globalThis.URL = w.URL;
  w.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
  let checks = { Customer: { status: "cocok", note: "ok", rev: 1, updatedAt: "2026-11-03T10:00:00" } };
  let runMode = "ok";
  globalThis.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    const reply = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => JSON.parse(JSON.stringify(body)) });
    if (url === "api/company") return reply({ code: "", name: "PT Contoh" });
    if (url === "api/countdoc/queries") return reply({ queries: QUERIES, maxRows: 5000, maxDays: 400 });
    if (url === "api/countdoc/query-checks") return reply({ checks });
    if (url === "api/countdoc/companies") return reply({ companies: [{ schema: "LIVE_A", name: "PT A", active: false }, { schema: "LIVE_B", name: "PT B", active: true }] });
    if (url === "api/countdoc/query/run") {
      if (runMode === "na") return reply({ id: "x", error: "tidak_tersedia", code: "ZZ9", ms: 12 });
      if (runMode === "403") return reply({ message: "Setup terkunci." }, 403);
      const rows = runMode === "xss" ? [["<img src=x onerror=alert(1)>", 5, "2026-10-01"]] : manyRows;
      return reply({ id: "x", company: "LIVE_B", from: "2026-11-01", to: "2026-11-03", columns: COLS, rows, rowCount: rows.length, truncated: false, ms: 1234 });
    }
    if (url.startsWith("api/countdoc/query-checks/")) {
      const body = JSON.parse(opts.body);
      if (body.rev !== (checks.Vendor ? checks.Vendor.rev : 0)) return reply({ message: "Sudah diubah orang lain.", current: checks.Vendor }, 409);
      checks.Vendor = { status: body.status, note: body.note, rev: body.rev + 1, updatedAt: "2026-11-03T11:00:00" };
      return reply(checks.Vendor);
    }
    return reply({ message: "tak dikenal" }, 404);
  };
  const { countdocQueryPage } = await import("../../main/resources/static/js/pages/countdoc-query.js");
  const root = document.getElementById("a");
  const pg = countdocQueryPage(root);
  await pg.ready;
  const tick = (ms = 15) => new Promise(r => setTimeout(r, ms));
  const $ = s => root.querySelector(s);

  // daftar
  assert.equal(root.querySelectorAll(".cq-item").length, 3);
  assert.equal($("#cq-count").textContent, "Cek: 1 dari 3");
  assert.equal($("#cq-co").value, "LIVE_B", "company aktif jadi bawaan");
  assert.ok($("#cq-from").value.endsWith("-01"), "awal = tanggal 1 bulan ini");
  assert.equal(root.querySelectorAll(".cq-grp").length, 2);
  assert.ok($(".cq-item .cq-st").textContent.includes("Belum"), "status teks, bukan hanya warna");
  assert.ok($("#cq-empty") && !$("#cq-empty").hidden && $("#cq-body").hidden);
  // cari
  const si = $("#cq-search"); si.value = "owor"; si.dispatchEvent(new w.Event("input"));
  assert.deepEqual([...root.querySelectorAll(".cq-item")].map(b => b.dataset.id), ["Production Order"]);
  si.value = ""; si.dispatchEvent(new w.Event("input"));
  // chip Belum / Gagal
  const chip = name => [...root.querySelectorAll(".cq-chip")].find(b => b.textContent.startsWith(name));
  chip("Gagal").click(); assert.equal(root.querySelectorAll(".cq-item").length, 0);
  assert.ok(root.textContent.includes("Tidak ada query yang cocok"));
  chip("Belum").click(); assert.equal(root.querySelectorAll(".cq-item").length, 3);
  chip("Semua").click();

  // pilih query (hash route; id berspasi)
  root.querySelector('.cq-item[data-id="Production Order"]').click();
  await tick(30);
  assert.equal(pg.st.sel, "Production Order");
  assert.ok($("#cq").classList.contains("open"));
  assert.equal($("#cq-sql pre").textContent, "SELECT 3");
  root.querySelector('.cq-item[data-id="Customer"]').click(); await tick(30);
  assert.equal($("#cq-sql pre").textContent, "SELECT 2 <b>x</b>", "SQL tampil sebagai teks");
  assert.equal($("#cq-sql b"), null, "SQL tidak menyisipkan HTML");
  assert.equal($("#cq-check input:checked").value, "cocok", "status cek dari server");
  assert.equal($("#cq-note").value, "ok");

  // jalankan Vendor (hasil 130 baris)
  root.querySelector('.cq-item[data-id="Vendor"]').click(); await tick(30);
  $("#cq-company, #cq-co").value = "LIVE_A"; $("#cq-co").dispatchEvent(new w.Event("change"));
  root.querySelector('[data-act="run"]').click(); await tick(40);
  const run = calls.filter(c => c.url === "api/countdoc/query/run").pop();
  assert.equal(run.opts.method, "POST");
  const sent = JSON.parse(run.opts.body);
  assert.deepEqual(Object.keys(sent).sort(), ["company", "from", "id", "to"], "klien hanya kirim id + parameter, tanpa SQL");
  assert.equal(sent.id, "Vendor"); assert.equal(sent.company, "LIVE_A");
  assert.equal(pg.st.runs.Vendor.state, "ok");
  assert.ok($("#cq-title").textContent.includes("130 baris") && $("#cq-title").textContent.includes("1,2 dtk"));
  assert.ok(!$("#cq-res").textContent.includes("null"), "tidak ada teks null nyasar");
  assert.equal(root.querySelectorAll("#cq-tbl tbody tr").length, 50, "paging 50");
  assert.ok($(".cq-pinfo").textContent.includes("1–50 dari 130"));
  assert.ok(JSON.parse(sessionStorage.getItem("cdq-runs")).Vendor, "status jalan di sessionStorage");
  // sort numerik pada kolom Counted
  const sortBtn = i => root.querySelectorAll(".cq-sortb")[i];
  sortBtn(1).click(); sortBtn(1).click();
  assert.equal(root.querySelectorAll("#cq-tbl th")[1].getAttribute("aria-sort"), "descending");
  assert.equal(root.querySelector("#cq-tbl tbody tr td:nth-child(2)").textContent, "129");
  // filter global
  const rf = $("#cq-rf"); rf.value = "U12"; rf.dispatchEvent(new w.Event("input"));
  assert.ok($(".cq-pinfo").textContent.includes("dari 11"), "U12, U120..U129");
  rf.value = ""; rf.dispatchEvent(new w.Event("input"));
  // ukuran halaman & paging
  const sz = $("#cq-size"); sz.value = "25"; sz.dispatchEvent(new w.Event("change"));
  assert.equal(root.querySelectorAll("#cq-tbl tbody tr").length, 25);
  [...root.querySelectorAll(".cq-pager .cbtn")].find(b => b.textContent.startsWith("Berikutnya")).click();
  assert.ok($(".cq-pinfo").textContent.startsWith("26–50"));
  // ekspor CSV mengikuti filter
  rf.value = "U12"; rf.dispatchEvent(new w.Event("input"));
  [...root.querySelectorAll(".cq-rtool .cbtn")].find(b => b.textContent === "CSV").click();
  await tick(0); // Download now waits for company metadata before naming the file.
  assert.ok(String(downloads[downloads.length - 1]).startsWith("query_Vendor_2026-11-01_2026-11-03.csv"));
  const csvBlob = downloads.find(d => d && d.size);
  assert.ok(csvBlob.size > 20 && csvBlob.size < 600, "CSV hanya baris yang lolos filter (11 baris)");
  [...root.querySelectorAll(".cq-rtool .cbtn")].find(b => b.textContent === "Excel").click();
  await tick(0);
  assert.ok(String(downloads[downloads.length - 1]).endsWith(".xlsx"));

  // XSS di sel
  runMode = "xss"; root.querySelector('[data-act="run"]').click(); await tick(40);
  assert.equal(root.querySelector("#cq-tbl img"), null, "nilai sel tidak jadi HTML");
  assert.ok($("#cq-tbl td").textContent.includes("<img"));

  // tidak tersedia
  runMode = "na"; root.querySelector('[data-act="run"]').click(); await tick(40);
  assert.equal(pg.st.runs.Vendor.state, "tidak_tersedia");
  assert.ok($("#cq-title").textContent.includes("Tidak tersedia"));
  assert.ok($("#cq-res").textContent.includes("tidak tersedia"));
  // 403: bukan status jalan, tampil pesan
  runMode = "403"; root.querySelector('[data-act="run"]').click(); await tick(40);
  assert.equal(pg.st.runs.Vendor.state, "tidak_tersedia", "403 tidak menimpa status jalan");
  assert.ok($("#cq-res").textContent.includes("Setup terkunci"));

  // cek manual: simpan, lalu konflik 409
  root.querySelector('input[name^="cq-chk"][value="selisih"]').click();
  $("#cq-note").value = "beda 2 baris"; $("#cq-note").dispatchEvent(new w.Event("input"));
  [...root.querySelectorAll("#cq-check .cbtn")].find(b => b.textContent === "Simpan cek").click(); await tick(30);
  const put = calls.filter(c => c.opts.method === "PUT").pop();
  assert.equal(put.url, "api/countdoc/query-checks/Vendor");
  assert.deepEqual(JSON.parse(put.opts.body), { rev: 0, status: "selisih", note: "beda 2 baris" });
  assert.equal(pg.st.checks.Vendor.rev, 1);
  assert.equal($("#cq-count").textContent, "Cek: 2 dari 3");
  checks.Vendor = { status: "cocok", note: "orang lain", rev: 5, updatedAt: "x" };
  [...root.querySelectorAll("#cq-check .cbtn")].find(b => b.textContent === "Simpan cek").click(); await tick(30);
  assert.ok($("#cq-check .cq-status.err"), "409 tampil sebagai kesalahan");
  assert.equal(pg.st.checks.Vendor.rev, 5, "item terkini dari server dimuat");
  assert.equal($("#cq-note").value, "orang lain");

  // query berikutnya (tombol bawah HP)
  const nextBtn = [...$("#cq-bar").querySelectorAll(".cbtn")].find(b => b.textContent.startsWith("Query berikutnya"));
  nextBtn.click(); await tick(30);
  assert.equal(pg.st.sel, "Customer");
  // kembali ke daftar
  $(".cq-back").click(); await tick(30);
  assert.equal(pg.st.sel, null);
  assert.ok(!$("#cq").classList.contains("open"));
});

test("halaman Daftar Query: 403 gerbang tampil sebagai pesan, bukan daftar kosong", { skip: !JSDOM && "jsdom tidak tersedia" }, async () => {
  const dom = new JSDOM(`<!doctype html><body><article id="a"></article></body>`, { pretendToBeVisual: true, url: "http://localhost/countdoc-query.html" });
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.location = dom.window.location;
  globalThis.sessionStorage = dom.window.sessionStorage; globalThis.localStorage = dom.window.localStorage;
  globalThis.fetch = async () => ({ ok: false, status: 403, headers: { get: () => "application/json" }, json: async () => ({ message: "Count Document belum diaktifkan." }) });
  const { countdocQueryPage } = await import("../../main/resources/static/js/pages/countdoc-query.js?x=2");
  const root = document.getElementById("a");
  const pg = countdocQueryPage(root); await pg.ready;
  const f = root.querySelector("#cq-fatal");
  assert.ok(!f.hidden && f.textContent.includes("belum diaktifkan"));
  assert.ok(root.querySelector("#cq").hidden);
});
