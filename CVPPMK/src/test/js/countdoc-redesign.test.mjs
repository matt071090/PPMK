// Tes mesin redesain: kelompok/warna, heat bucket, urut abjad user, displayUsers dengan kode, urut pivot, segmen bertumpuk, tren bertumpuk, Excel.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as E from "../../main/resources/static/js/pages/countdoc-engine.js";
import { xlsxBlob } from "../../main/resources/static/js/xlsx.js";

const fx = JSON.parse(readFileSync(new URL("./countdoc-fixture.json", import.meta.url), "utf8"));
const data = E.normalize(fx.resp, fx.meta);
const rows = E.filterRows(data.rows, {});

test("palet kelompok: pemetaan tetap, longgar nama, tak dikenal = Lainnya, kode unik", () => {
  assert.equal(E.GROUPS.length, 13);
  assert.equal(new Set(E.GROUPS.map(g => g.code)).size, 13);
  assert.equal(E.groupInfo("Banking").code, "BNK");
  assert.equal(E.groupInfo("inventory movement").code, "INV");
  assert.equal(E.groupInfo("Entah apa").name, "Lainnya");
  assert.equal(E.groupInfo(null).code, "LNY");
  assert.ok(E.GROUPS.every(g => [g.ink, g.bar, g.tint, g.dInk, g.dTint].every(h => /^#[0-9A-F]{6}$/.test(h))));
  assert.ok(E.GROUPS.every(g => g.code.length >= 2 && g.code.length <= 3));
});

test("normalize memetakan kelompok tak dikenal ke Lainnya", () => {
  const n = E.normalize({ objects: ["X"], users: [["a", "A"]], rows: [[0, 0, "2026-10-01", 1, ""]] }, { objects: [{ id: "X", group: "Aneh", role: "", dateKind: "", approval: false }] });
  assert.equal(n.rows[0].group, "Lainnya"); assert.equal(n.objects[0].groupRaw, "Aneh");
});

test("heat: lima bucket sqrt terhadap maksimum global, nol kosong", () => {
  assert.equal(E.heatBucket(0, 100), 0);
  assert.equal(E.heatBucket(1, 100), 1);      // t=.1
  assert.equal(E.heatBucket(9, 100), 2);      // t=.3
  assert.equal(E.heatBucket(25, 100), 3);     // t=.5
  assert.equal(E.heatBucket(49, 100), 4);     // t=.7
  assert.equal(E.heatBucket(81, 100), 5);     // t=.9
  assert.equal(E.heatBucket(100, 100), 5);
  assert.equal(E.heatBucket(500, 100), 5);
  assert.equal(E.mixHex("#000000", 50), "#808080");
  assert.equal(E.mixHex("#2A7FD4", 100), "#2a7fd4");
});

test("displayUsers: kode ikut; disamarkan = User n tanpa kode", () => {
  const real = E.displayUsers(rows, data.users, false);
  assert.deepEqual(real.get(0), { name: "Ani", code: "ani" });
  const masked = E.displayUsers(rows, data.users, true);
  assert.equal(masked.get(0).name, "User 1"); assert.equal(masked.get(0).code, "");
  assert.ok(![...masked.values()].some(u => /ani|budi/i.test(u.name + u.code)));
  assert.equal(E.displayNames(rows, data.users, false).get(0), "Ani");
});

test("pivot per user: kolom urut ABJAD nama (bukan jumlah), tanpa user di akhir, kode ikut", () => {
  const users = E.displayUsers(rows, data.users, false);
  const p = E.pivot(rows, { by: "user", names: users });
  const labels = p.cols.map(c => c.label);
  assert.equal(labels[labels.length - 1], E.NO_USER);
  const rest = labels.slice(0, -1);
  assert.deepEqual(rest, [...rest].sort((a, b) => a.localeCompare(b, "id", { numeric: true })));
  assert.ok(p.cols.find(c => c.label === "Ani").code === "ani");
  const m = E.displayUsers(rows, data.users, true), pm = E.pivot(rows, { by: "user", names: m });
  assert.ok(pm.cols.every(c => c.code === ""));
});

test("agregasi per kelompok konsisten: pivot, groupStats, stackedTrend, userCards = total", () => {
  const total = E.sumCounted(rows);
  assert.equal(E.groupStats(rows).reduce((t, g) => t + g.documents, 0), total);
  const st = E.stackedTrend(rows, "2026-10-01", "2026-10-10");
  const dated = rows.filter(r => r.date).reduce((t, r) => t + r.counted, 0);
  assert.equal(st.points.reduce((t, p) => t + p.total, 0), dated);
  assert.equal(st.totals.reduce((t, x) => t + x.n, 0), dated);
  assert.ok(st.points.every(p => Object.values(p.segs).reduce((a, b) => a + b, 0) === p.total));
  const cards = E.userCards(rows, E.displayUsers(rows, data.users, false));
  assert.equal(cards.reduce((t, c) => t + c.counted, 0), total);
  const nm = cards.map(c => c.name); assert.deepEqual(nm, [...nm].sort((a, b) => a.localeCompare(b, "id", { numeric: true })), "kartu urut abjad");
  assert.ok(cards.every(c => c.segments.reduce((t, s) => t + s.n, 0) === c.counted));
});

test("stackedTrend: 8 kelompok teratas + Lainnya", () => {
  const rs = []; for (let i = 0; i < 11; i++) rs.push({ group: "Banking Farm Finance InventoryMovement MasterData Production Purchasing QC Sales Shopfloor Timbangan".split(" ")[i], counted: 100 - i, date: "2026-10-01", user: 0, objId: "o" + i });
  const t = E.stackedTrend(rs, "2026-10-01", "2026-10-02");
  assert.equal(t.groups.length, 9); assert.equal(t.groups[8], "Lainnya");
  assert.equal(t.points[0].segs.Lainnya, (100 - 8) + (100 - 9) + (100 - 10));
});

test("stackSegments: < 3% digabung ke Lainnya, segmen minimal 2px", () => {
  const s = E.stackSegments([{ group: "Banking", n: 90 }, { group: "Sales", n: 8 }, { group: "Farm", n: 1 }, { group: "QC", n: 1 }], 100);
  assert.deepEqual(s.map(x => x.group), ["Banking", "Sales", "Lainnya"]);
  assert.equal(s[2].n, 2); assert.ok(s.every(x => x.px >= 2));
});

test("sortPivot: di dalam kelompok, turun/naik/asli", () => {
  const mk = () => E.pivot(rows, { by: "date", from: "2026-10-01", to: "2026-10-10", bucket: "day", names: new Map() });
  const base = mk(), g0 = base.groups.find(g => g.objects.length > 1);
  const orig = g0.objects.map(o => o.id);
  const d = mk(); E.sortPivot(d, "total", "desc");
  const tot = d.groups.find(g => g.group === g0.group).objects.map(o => o.total);
  assert.deepEqual(tot, [...tot].sort((a, b) => b - a));
  const a = mk(); E.sortPivot(a, "total", "asc");
  const ta = a.groups.find(g => g.group === g0.group).objects.map(o => o.total);
  assert.deepEqual(ta, [...ta].sort((x, y) => x - y));
  assert.deepEqual(E.sortPivot(mk(), "total", null).groups.find(g => g.group === g0.group).objects.map(o => o.id), orig);
});

test("searchRows, fmtTime, slideBucket", () => {
  const users = E.displayUsers(rows, data.users, false);
  assert.ok(E.searchRows(rows, "purchase", users).every(r => /purchase/i.test(r.objId)));
  assert.ok(E.searchRows(rows, "ani", users).every(r => r.userCode === "ani"));
  assert.equal(E.searchRows(rows, "  ", users), rows);
  assert.equal(E.fmtTime(new Date(2026, 9, 21, 9, 5)), "09.05");
  assert.equal(E.slideBucket("2026-10-01", "2026-10-14"), "day");
  assert.equal(E.slideBucket("2026-10-01", "2026-10-31"), "week");
  assert.equal(E.slideBucket("2026-01-01", "2026-10-31"), "month");
});

test("xlsx: gaya dinamis, autofilter tanpa baris Total, freeze C2, XML valid", async () => {
  const sheet = { name: "Pivot", rows: [["Kelompok", "Dokumen", { v: "2026-10-17", s: { b: true, color: "FFFFFF", fill: "6B7B83" } }, "Total"],
    [{ v: "Banking", s: { fill: "E5F0FA" } }, "Vendor", { v: 5, s: { num: true } }, { v: 5, s: { num: true, b: true } }],
    [{ v: "Total semua", s: { b: true, fill: "DDE3E6" } }, "", { v: 5, s: { num: true, b: true, fill: "DDE3E6" } }, ""]], filterRows: 2 };
  const buf = Buffer.from(await xlsxBlob([sheet, { name: "Data", rows: [["a", "b"], ["x", 1]] }]).arrayBuffer());
  const txt = buf.toString("latin1");
  assert.ok(txt.includes('<autoFilter ref="A1:D2"/>'), "autofilter berhenti sebelum Total semua");
  assert.ok(txt.includes("!$A$1:$D$2</definedName>"));
  assert.ok(txt.includes('<autoFilter ref="A1:B2"/>'), "sheet lain tetap seluruh rentang");
  assert.ok(txt.includes('topLeftCell="C2"'), "freeze");
  assert.ok(txt.includes('numFmtId="3"') && txt.includes('rgb="FF6B7B83"') && txt.includes('rgb="FFE5F0FA"'));
  const cnt = txt.match(/<cellXfs count="(\d+)">/)[1], real = (txt.match(/<cellXfs[\s\S]*?<\/cellXfs>/)[0].match(/<xf /g) || []).length;
  assert.equal(Number(cnt), real, "jumlah cellXfs sesuai");
  const f = txt.match(/<fonts count="(\d+)">/)[1], fr = (txt.match(/<fonts[\s\S]*?<\/fonts>/)[0].match(/<font>/g) || []).length; assert.equal(Number(f), fr);
  const l = txt.match(/<fills count="(\d+)">/)[1], lr = (txt.match(/<fills[\s\S]*?<\/fills>/)[0].match(/<fill>/g) || []).length; assert.equal(Number(l), lr);
});
