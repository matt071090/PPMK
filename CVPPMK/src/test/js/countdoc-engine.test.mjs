import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as E from "../../main/resources/static/js/pages/countdoc-engine.js";

const fx = JSON.parse(readFileSync(new URL("./countdoc-fixture.json", import.meta.url), "utf8"));
const data = E.normalize(fx.resp, fx.meta);
const COMBOS = [];
for (const includeSystem of [false, true]) for (const includeApproval of [false, true])
  for (const groups of [undefined, ["Purchasing"], ["MasterData", "Approval"]])
    for (const statuses of [undefined, ["O"], ["C", ""]]) COMBOS.push({ includeSystem, includeApproval, groups, statuses });

test("normalize: 1900/NULL jadi tanpa tanggal", () => {
  assert.equal(data.rows.length, 12);
  assert.equal(data.rows.filter(r => r.date === null).length, 2);
});

test("filter manager/INTERFACE dan persetujuan", () => {
  const def = E.filterRows(data.rows, {});
  assert.ok(def.every(r => !E.isSystemUser(r) && !r.approval));
  assert.equal(E.sumCounted(def), 3 + 2 + 5 + 4 + 1 + 2 + 1 + 2);
  const sys = E.filterRows(data.rows, { includeSystem: true });
  assert.equal(E.sumCounted(sys) - E.sumCounted(def), 100 + 8);
  const appr = E.filterRows(data.rows, { includeApproval: true });
  assert.equal(E.sumCounted(appr) - E.sumCounted(def), 13);
});

test("invarian: jumlah sel pivot = jumlah Counted untuk semua kombinasi", () => {
  const names = E.displayNames(data.rows, data.users, false);
  for (const c of COMBOS) {
    const rows = E.filterRows(data.rows, c), want = E.sumCounted(rows);
    for (const bucket of ["day", "week", "month"]) {
      const p = E.pivot(rows, { by: "date", from: "2026-10-01", to: "2026-10-10", bucket, names });
      assert.equal(E.pivotSum(p), want, JSON.stringify(c) + bucket);
      const mx = E.pivotMatrix(p), grand = mx.slice(1).filter(r => !String(r[1]).startsWith("Subtotal")).reduce((t, r) => t + r[r.length - 1], 0);
      assert.equal(grand, want);
      // total baris objek = jumlah selnya
      for (const g of p.groups) for (const o of g.objects) assert.equal(Object.values(o.cells).reduce((a, b) => a + b, 0), o.total);
    }
    const pu = E.pivot(rows, { by: "user", names });
    assert.equal(E.pivotSum(pu), want);
  }
});

test("subtotal per kelompok = jumlah objeknya, tanpa total lintas kelompok", () => {
  const rows = E.filterRows(data.rows, {});
  const p = E.pivot(rows, { by: "date", from: "2026-10-01", to: "2026-10-10", bucket: "day" });
  const pur = p.groups.find(g => g.group === "Purchasing");
  assert.equal(pur.objects.length, 2);
  assert.equal(pur.subtotal.total, pur.objects.reduce((t, o) => t + o.total, 0));
  assert.equal(pur.subtotal.cells["2026-10-02"], 5);
  assert.ok(p.cols.some(c => c.key === E.NO_DATE));
  assert.ok(!("grand" in p) && !("total" in p));
});

test("samarkan nama: User 1..n urut jumlah, sistem jadi Integrasi", () => {
  const rows = E.filterRows(data.rows, { includeSystem: true });
  const names = E.displayNames(rows, data.users, true);
  assert.equal(names.get(0), "User 1");           // ani paling banyak
  assert.equal(names.get(1), "Integrasi");
  assert.equal(names.get(2), "Integrasi");
  assert.equal(names.get(3), "User 2");
  assert.ok(![...names.values()].some(v => /Ani|Budi|Manager/.test(v)));
  const real = E.displayNames(rows, data.users, false);
  assert.equal(real.get(0), "Ani");
  assert.equal(real.get(4), E.NO_USER);
});

test("kpi", () => {
  const k = E.kpis(E.filterRows(data.rows, {}));
  assert.equal(k.documents, 20);
  assert.equal(k.activeUsers, 3);   // ani, budi, tanpa user
  assert.equal(k.objectsUsed, 3);
  assert.equal(k.activeDays, 3);    // 01, 02, 09; 1900/NULL tidak dihitung
});

test("tren: hari tanpa data = 0 dan mulai dari nol", () => {
  const t = E.trend(E.filterRows(data.rows, {}), "2026-10-01", "2026-10-10");
  assert.equal(t.points.length, 10);
  assert.equal(t.points[2].value, 0);
  assert.equal(t.points[0].value, 8);
});

test("bucket & preset", () => {
  assert.equal(E.bucketFor("2026-10-01", "2026-10-31"), "day");
  assert.equal(E.bucketFor("2026-09-01", "2026-10-31"), "week");
  assert.equal(E.bucketFor("2026-01-01", "2026-12-31"), "month");
  assert.deepEqual(E.preset("lastmonth", new Date(2026, 0, 15)), { from: "2025-12-01", to: "2025-12-31" });
  assert.deepEqual(E.preset("7d", new Date(2026, 9, 21)), { from: "2026-10-15", to: "2026-10-21" });
  assert.equal(E.bucketKey("2026-10-21", "week"), "2026-10-19");
});

test("CSV: BOM, titik koma, netralkan rumus", () => {
  const s = E.toCsv([["a", "=1+1"], ["x;y", 1.5], ["-cmd", '"q"']]);
  assert.ok(s.startsWith("﻿"));
  assert.ok(s.includes("a;'=1+1"));
  assert.ok(s.includes('"x;y";1,5'));
  assert.ok(s.includes("'-cmd;\"\"\"q\"\"\"") || s.includes("'-cmd;\"\"q\"\""));
});

test("pivotMatrix compact+grand: sel kosong, label Total, baris Total semua = jumlah sumber", () => {
  const rows = E.filterRows(data.rows, {}), names = E.displayNames(rows, data.users, false);
  const p = E.pivot(rows, { by: "date", from: "2026-10-01", to: "2026-10-10", bucket: "day", names });
  const mx = E.pivotMatrix(p, ["Kelompok", "Dokumen"], { compact: true, grand: true });
  const last = mx[mx.length - 1];
  assert.equal(last[1], "Total semua");
  assert.equal(last[last.length - 1], E.sumCounted(rows));
  assert.equal(E.grandTotal(p).total, E.sumCounted(rows));
  assert.ok(mx.slice(1).some(r => r.slice(2, -1).includes("")), "sel 0 jadi kosong");
  assert.ok(!mx.slice(1).some(r => r.slice(2, -1).includes(0)));
  assert.ok(mx.some(r => String(r[1]).startsWith("Total ")) && !mx.some(r => String(r[1]).startsWith("Subtotal")));
  // bawaan lama tidak berubah
  assert.ok(E.pivotMatrix(p).some(r => String(r[1]).startsWith("Subtotal")));
});
