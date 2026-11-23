// Tes ringkasan laporan yang dibagikan: kalimat kesimpulan, per kelompok, dokumen terbanyak, per pengguna (fungsi murni).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as E from "../../main/resources/static/js/pages/countdoc-engine.js";

const fx = JSON.parse(readFileSync(new URL("./countdoc-fixture.json", import.meta.url), "utf8"));
const data = E.normalize(fx.resp, fx.meta);
const names = E.displayNames(data.rows, data.users, true, "Pengguna");

test("format angka dan periode gaya Indonesia", () => {
  assert.equal(E.fmtNum(2206), "2.206");
  assert.equal(E.fmtNum(1234567), "1.234.567");
  assert.equal(E.fmtNum(0), "0");
  assert.equal(E.fmtPeriod("2026-10-01", "2026-10-21"), "1-21 Okt 2026");
  assert.equal(E.fmtPeriod("2026-10-21", "2026-10-21"), "21 Okt 2026");
  assert.equal(E.fmtPeriod("2026-09-28", "2026-10-05"), "28 Sep - 5 Okt 2026");
  assert.equal(E.fmtPeriod("2025-12-28", "2026-01-05"), "28 Des 2025 - 5 Jan 2026");
});

test("kalimat kesimpulan dari fixture (default: tanpa sistem/persetujuan)", () => {
  const rows = E.filterRows(data.rows, {});
  const s = E.buildSummary(rows, "2026-10-01", "2026-10-10");
  assert.equal(s, "Pada 1-10 Okt 2026 tercatat 20 dokumen oleh 3 pengguna di 3 jenis dokumen. Hari tersibuk 1 Okt (8 dokumen); kelompok terbanyak: Purchasing (15).");
  assert.ok(!/terbaik|terajin|peringkat|kinerja/i.test(s), "tanpa klaim kinerja");
});

test("kalimat kesimpulan: kosong, satu hari, satu kelompok", () => {
  assert.match(E.buildSummary([], "2026-10-01", "2026-10-21"), /belum ada dokumen/);
  const one = E.filterRows(data.rows, { groups: ["MasterData"] }).filter(r => r.date === "2026-10-01");
  const s = E.buildSummary(one, "2026-10-01", "2026-10-01");
  assert.match(s, /Pada 1 Okt 2026 tercatat 3 dokumen oleh 1 pengguna di 1 jenis dokumen\./);
  assert.match(s, /Seluruhnya tercatat pada 1 Okt 2026; seluruhnya di kelompok MasterData|Seluruhnya tercatat pada 1 Okt 2026/);
});

test("invarian: per kelompok = total; top 10 <= total; per pengguna = total; persen ~100", () => {
  for (const includeSystem of [false, true]) for (const includeApproval of [false, true]) {
    const rows = E.filterRows(data.rows, { includeSystem, includeApproval }), total = E.sumCounted(rows);
    const g = E.groupStats(rows), t = E.topObjects(rows, 10), u = E.userStats(rows, names);
    assert.equal(g.reduce((a, x) => a + x.documents, 0), total);
    assert.equal(u.reduce((a, x) => a + x.counted, 0), total);
    assert.ok(t.reduce((a, x) => a + x.counted, 0) <= total);
    assert.ok(t.length <= 10);
    if (total) assert.ok(Math.abs(g.reduce((a, x) => a + x.pct, 0) - 100) < 1e-9);
    for (let i = 1; i < g.length; i++) assert.ok(g[i - 1].documents >= g[i].documents);
    for (let i = 1; i < t.length; i++) assert.ok(t[i - 1].counted >= t[i].counted);
    assert.equal(E.kpis(rows).objectsUsed, new Set(t.concat(E.topObjects(rows, 1e9)).map(x => x.id)).size);
  }
});

test("top dokumen dibatasi 10 untuk > 40 jenis dokumen", () => {
  const rows = Array.from({ length: 45 }, (_, i) => ({ obj: i, objId: `Doc_${i}`, group: `G${i % 5}`, user: 0, date: "2026-10-01", counted: i + 1, approval: false }));
  const t = E.topObjects(rows, 10);
  assert.equal(t.length, 10);
  assert.equal(t[0].id, "Doc_44");
  assert.ok(t.reduce((a, x) => a + x.counted, 0) < E.sumCounted(rows));
  assert.equal(E.groupStats(rows).reduce((a, x) => a + x.documents, 0), E.sumCounted(rows));
});

test("per pengguna: hari aktif, jenis dokumen, nama samaran Pengguna n", () => {
  const rows = E.filterRows(data.rows, {});
  const u = E.userStats(rows, names);
  assert.deepEqual(u.map(x => x.name), ["Pengguna 1", "Pengguna 2", "Pengguna 3"]);
  assert.equal(u[0].counted, 15);
  assert.equal(u[0].activeDays, 3);
  assert.equal(E.displayNames(data.rows, data.users, true, "Pengguna").get(1), "Integrasi");
});

test("trend dengan batas hari: > 31 hari jadi mingguan", () => {
  assert.equal(E.trend([], "2026-10-01", "2026-10-31", 31).bucket, "day");
  assert.equal(E.trend([], "2026-10-01", "2026-11-15", 31).bucket, "week");
  assert.equal(E.trend([], "2026-10-01", "2026-11-15").bucket, "day");
});
