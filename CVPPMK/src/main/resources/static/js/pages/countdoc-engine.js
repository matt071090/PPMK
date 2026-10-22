// Mesin agregasi Count Document: murni (tanpa DOM, tanpa fetch) supaya bisa diuji dengan `node --test`.
// Masukan = respons /api/countdoc/data: { users: [[kode, nama], ...], objects: [id, ...], rows: [[objIdx, userIdx, tanggal|null, counted, status], ...] }
// ditambah meta /api/countdoc/meta: { objects: [{ id, label, group, role, dateKind, approval }] }.
// Prinsip: menghitung aktivitas PEMBUATAN dokumen per dokumen; sengaja TIDAK ada total lintas kelompok/dokumen.

export const NO_DATE = "(tanpa tanggal)";
export const NO_USER = "(tanpa user)";
const SYSTEM_USERS = ["manager", "interface"];

// ---------- tanggal (UTC murni, tanpa zona waktu) ----------
const pad = n => String(n).padStart(2, "0");
export const iso = d => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const parseIso = s => new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)));
export const addDays = (s, n) => { const d = parseIso(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
export const daysBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 864e5);
const mondayOf = s => { const d = parseIso(s), w = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - w); return iso(d); };
const isRealDate = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) && s.slice(0, 4) > "1900";

/** Rentang preset: today/7d/month/lastmonth -> { from, to } (yyyy-MM-dd), now = Date (bisa disuntik untuk tes). */
export function preset(name, now = new Date()) {
  const t = iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  if (name === "today") return { from: t, to: t };
  if (name === "7d") return { from: addDays(t, -6), to: t };
  const y = +t.slice(0, 4), m = +t.slice(5, 7);
  if (name === "month") return { from: `${y}-${pad(m)}-01`, to: t };
  if (name === "lastmonth") {
    const first = new Date(Date.UTC(y, m - 2, 1)), last = new Date(Date.UTC(y, m - 1, 0));
    return { from: iso(first), to: iso(last) };
  }
  return null;
}

/** Granularitas kolom tanggal pivot: maksimum 31 kolom (hari -> minggu -> bulan). */
export function bucketFor(from, to) {
  const days = daysBetween(from, to) + 1;
  if (days <= 31) return "day";
  return Math.ceil(days / 7) + 1 <= 31 ? "week" : "month";
}
export function bucketKey(date, bucket) {
  if (!isRealDate(date)) return NO_DATE;
  const d = date.slice(0, 10);
  return bucket === "day" ? d : bucket === "week" ? mondayOf(d) : d.slice(0, 7);
}
export function bucketKeys(from, to, bucket) {
  const out = [];
  if (bucket === "day") for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  else if (bucket === "week") for (let d = mondayOf(from); d <= to; d = addDays(d, 7)) out.push(d);
  else {
    let y = +from.slice(0, 4), m = +from.slice(5, 7);
    while (`${y}-${pad(m)}` <= to.slice(0, 7)) { out.push(`${y}-${pad(m)}`); if (++m > 12) { m = 1; y++; } }
  }
  return out;
}


// ---------- kelompok dokumen: warna tetap per nama (kelompok tak dikenal = Lainnya) ----------
// ink/bar/tint = tema terang; dInk (ink sekaligus batang) / dTint = tema gelap. Dipakai CSS (lewat atribut data-g=kode) dan cetak (hex terang).
export const GROUPS = [
  { code: "APR", name: "Approval", ink: "#3B3F9E", bar: "#5558D6", tint: "#EBEBFA", dInk: "#9A9EF5", dTint: "#30374A" },
  { code: "BNK", name: "Banking", ink: "#174F93", bar: "#2A7FD4", tint: "#E5F0FA", dInk: "#66AEF5", dTint: "#273A4A" },
  { code: "FRM", name: "Farm", ink: "#1F6B24", bar: "#3F9A2E", tint: "#E8F3E6", dInk: "#6FCF5A", dTint: "#29402E" },
  { code: "FIN", name: "Finance", ink: "#7A5900", bar: "#A87A00", tint: "#F5EFE0", dInk: "#E6B93A", dTint: "#3E3C29" },
  { code: "INV", name: "InventoryMovement", ink: "#0A6478", bar: "#0E96B5", tint: "#E2F2F6", dInk: "#3FC4E0", dTint: "#203E47" },
  { code: "MST", name: "MasterData", ink: "#4A5866", bar: "#7D8C9B", tint: "#EFF1F3", dInk: "#9FB0C0", dTint: "#313B41" },
  { code: "PRD", name: "Production", ink: "#A14308", bar: "#E8741C", tint: "#FCEEE4", dInk: "#F0894A", dTint: "#40342C" },
  { code: "PUR", name: "Purchasing", ink: "#7A3A9E", bar: "#A85FD0", tint: "#F5ECF9", dInk: "#C58AF0", dTint: "#38344A" },
  { code: "QC", name: "QC", ink: "#5F6F10", bar: "#5F6F10", tint: "#ECEEE2", dInk: "#B5CF3A", dTint: "#354029" },
  { code: "SAL", name: "Sales", ink: "#A3285F", bar: "#E0508F", tint: "#FBEAF2", dInk: "#F478B0", dTint: "#40313E" },
  { code: "SHP", name: "Shopfloor", ink: "#0B6B5A", bar: "#1AA68A", tint: "#E4F4F1", dInk: "#3FD0B0", dTint: "#20403E" },
  { code: "TMB", name: "Timbangan", ink: "#7A4A2A", bar: "#A8744A", tint: "#F5EEE9", dInk: "#D09A6A", dTint: "#3A3731" },
  { code: "LNY", name: "Lainnya", ink: "#5B6B73", bar: "#9AA7AE", tint: "#EEF1F2", dInk: "#6F7F87", dTint: "#252E33" }
];
const gKey = s => String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]/g, "");
const GROUP_BY = new Map(GROUPS.map(g => [gKey(g.name), g]));
export const OTHER_GROUP = GROUPS[GROUPS.length - 1];
/** Info warna kelompok menurut nama (longgar terhadap spasi/huruf besar); tak dikenal -> Lainnya. */
export const groupInfo = name => GROUP_BY.get(gKey(name)) || OTHER_GROUP;
/** Campur warna hex dengan dasar (pct = persen warna): dipakai heat di cetak (tanpa color-mix/variabel tema). */
export function mixHex(hex, pct, base = "#ffffff") {
  const c = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), a = c(hex), b = c(base);
  return "#" + a.map((v, i) => Math.round(v * pct / 100 + b[i] * (100 - pct) / 100).toString(16).padStart(2, "0")).join("");
}
/** Bucket heat 0..5: 0 = kosong; t=sqrt(nilai/maks) dalam lima kelas sama lebar (0-.2 ... .8-1). */
export function heatBucket(v, max) {
  if (!v || v <= 0 || !max) return 0;
  return Math.min(5, Math.floor(Math.min(1, Math.sqrt(v / max)) / 0.2) + 1);
}

// ---------- normalisasi data ----------
/** Ubah respons ringkas jadi baris datar { obj, objId, group, user, userCode, userName, date, counted, status, ... }. */
export function normalize(resp, meta) {
  const byId = new Map(((meta && meta.objects) || []).map(o => [o.id, o]));
  const objs = (resp.objects || []).map(id => { const o = byId.get(id) || { id, label: id, group: "Lainnya", role: "", dateKind: "", approval: false }; return { ...o, groupRaw: o.group, group: groupInfo(o.group).name }; });
  const users = (resp.users || []).map(u => ({ code: u[0] == null ? "" : String(u[0]), name: u[1] == null ? "" : String(u[1]) }));
  const rows = [];
  for (const r of resp.rows || []) {
    const o = objs[r[0]], u = users[r[1]];
    if (!o || !u) continue;
    rows.push({
      obj: r[0], objId: o.id, group: o.group, role: o.role, dateKind: o.dateKind, approval: !!o.approval,
      user: r[1], userCode: u.code, userName: u.name,
      date: isRealDate(r[2]) ? String(r[2]).slice(0, 10) : null, counted: Number(r[3]) || 0, status: r[4] == null ? "" : String(r[4])
    });
  }
  return { objects: objs, users, rows };
}

export const isSystemUser = u => SYSTEM_USERS.includes(String(u.userCode || u.code || "").toLowerCase());

/** Filter di klien. opts: includeSystem, includeApproval, groups[], objects[], users[] (indeks), statuses[] (kosong/undefined = semua). */
export function filterRows(rows, opts = {}) {
  const set = a => (a && a.length ? new Set(a) : null);
  const g = set(opts.groups), o = set(opts.objects), u = set(opts.users), s = set(opts.statuses);
  return rows.filter(r =>
    (opts.includeSystem || !isSystemUser(r)) &&
    (opts.includeApproval || !r.approval) &&
    (!g || g.has(r.group)) && (!o || o.has(r.objId)) && (!u || u.has(r.user)) && (!s || s.has(r.status)));
}

// ---------- samarkan nama ----------
/** Peta indeks user -> nama tampil. anonymize: User 1..n urut jumlah (terbanyak = User 1); user sistem -> "Integrasi". Tidak disimpan. */
export function displayNames(rows, users, anonymize, label = "User") {
  const total = new Map();
  for (const r of rows) total.set(r.user, (total.get(r.user) || 0) + r.counted);
  const map = new Map();
  if (!anonymize) {
    users.forEach((u, i) => map.set(i, u.name || u.code || NO_USER));
    return map;
  }
  const order = [...total.keys()].filter(i => !isSystemUser(users[i])).sort((a, b) => total.get(b) - total.get(a) || a - b);
  order.forEach((i, n) => map.set(i, `${label} ${n + 1}`));
  users.forEach((u, i) => { if (!map.has(i)) map.set(i, isSystemUser(u) ? "Integrasi" : `${label} ${order.length + 1}`); });
  return map;
}

/** Peta indeks user -> { name, code }. Disamarkan: "User n" tanpa kode. */
export function displayUsers(rows, users, anonymize, label = "User") {
  const names = displayNames(rows, users, anonymize, label), map = new Map();
  users.forEach((u, i) => map.set(i, { name: names.get(i), code: anonymize ? "" : (u.code || "") }));
  return map;
}
const nameOf = (users, i) => { const u = users.get(i); return u && typeof u === "object" ? u.name : u; };
const byName = (a, b) => String(a).localeCompare(String(b), "id", { numeric: true, sensitivity: "base" });

/** Cari baris: cocok bila teks ada di nama dokumen, kelompok, atau nama/kode user yang TAMPIL (users = Map indeks -> {name, code}). */
export function searchRows(rows, q, users) {
  const t = String(q || "").trim().toLowerCase();
  if (!t) return rows;
  return rows.filter(r => {
    const u = users && users.get(r.user);
    return [r.objId, r.group, u && u.name, u && u.code].some(x => x && String(x).toLowerCase().includes(t));
  });
}

/** Jam "HH.MM" (waktu lokal) untuk "Diambil pada". */
export const fmtTime = d => `${pad(d.getHours())}.${pad(d.getMinutes())}`;

// ---------- agregasi ----------
export function kpis(rows) {
  const users = new Set(), objs = new Set(), days = new Set();
  let total = 0;
  for (const r of rows) {
    if (!r.counted) continue;
    total += r.counted; users.add(r.user); objs.add(r.objId);
    if (r.date) days.add(r.date);
  }
  return { documents: total, activeUsers: users.size, objectsUsed: objs.size, activeDays: days.size };
}

export function topUsers(rows, names, limit = 10) {
  const t = new Map();
  for (const r of rows) t.set(r.user, (t.get(r.user) || 0) + r.counted);
  return [...t].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, limit)
    .map(([user, n]) => ({ user, name: names.get(user), counted: n }));
}

/** Tren harian dari `from` s/d `to`; hari tanpa data = 0. Baris tanpa tanggal tidak ikut. Lebih dari 62 hari dikelompokkan lewat bucketFor. */
export function trend(rows, from, to, maxDays = 62) {
  const bucket = daysBetween(from, to) + 1 <= maxDays ? "day" : bucketFor(from, to);
  const keys = bucketKeys(from, to, bucket), m = new Map(keys.map(k => [k, 0]));
  for (const r of rows) {
    if (!r.date) continue;
    const k = bucketKey(r.date, bucket);
    if (m.has(k)) m.set(k, m.get(k) + r.counted);
  }
  return { bucket, points: keys.map(k => ({ key: k, value: m.get(k) })) };
}

/**
 * Pivot Kelompok > Dokumen x kolom (tanggal atau user). Tanpa total lintas kelompok.
 * by: "date" | "user". Hasil: { cols:[{key,label}], groups:[{group, objects:[{id,label,cells:{key:n},total}], subtotal:{cells,total}}], colTotals tidak ada lintas kelompok }
 * "Total kolom per dokumen" = total baris tiap dokumen; subtotal per kelompok = jumlah dokumen dalam kelompok itu.
 */
export function pivot(rows, { by = "date", from, to, bucket, names, objectOrder } = {}) {
  let cols;
  const colOf = r => (by === "date" ? bucketKey(r.date, bucket) : String(r.user));
  const sums = new Map();
  for (const r of rows) {
    if (!r.counted) continue;
    const k = colOf(r);
    let o = sums.get(r.objId); if (!o) sums.set(r.objId, o = { id: r.objId, obj: r.obj, group: r.group, cells: new Map() });
    o.cells.set(k, (o.cells.get(k) || 0) + r.counted);
  }
  if (by === "date") {
    const keys = bucketKeys(from, to, bucket);
    const hasNull = [...sums.values()].some(o => o.cells.has(NO_DATE));
    const extra = new Set();
    for (const o of sums.values()) for (const k of o.cells.keys()) if (k !== NO_DATE && !keys.includes(k)) extra.add(k); // jaga invarian bila ada tanggal di luar rentang
    cols = keys.concat([...extra].sort()).map(k => ({ key: k, label: k })).concat(hasNull ? [{ key: NO_DATE, label: NO_DATE }] : []);
  } else {
    const t = new Map();
    for (const o of sums.values()) for (const [k, n] of o.cells) t.set(k, (t.get(k) || 0) + n);
    cols = [...t.keys()].sort((a, b) => (names ? (nameOf(names, +a) === NO_USER) - (nameOf(names, +b) === NO_USER) || byName(nameOf(names, +a), nameOf(names, +b)) : 0) || +a - +b)
      .map(k => ({ key: k, label: names ? nameOf(names, +k) : k, code: names && typeof names.get(+k) === "object" ? names.get(+k).code : "" }));
  }
  const order = new Map((objectOrder || []).map((id, i) => [id, i]));
  const groups = new Map();
  for (const o of sums.values()) {
    const cells = {}; let total = 0;
    for (const [k, n] of o.cells) { cells[k] = n; total += n; }
    let g = groups.get(o.group); if (!g) groups.set(o.group, g = { group: o.group, objects: [], subtotal: { cells: {}, total: 0 } });
    g.objects.push({ id: o.id, label: o.id, obj: o.obj, cells, total });
    for (const k in cells) g.subtotal.cells[k] = (g.subtotal.cells[k] || 0) + cells[k];
    g.subtotal.total += total;
  }
  const out = [...groups.values()];
  for (const g of out) g.objects.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9) || a.obj - b.obj);
  out.sort((a, b) => a.group.localeCompare(b.group));
  return { cols, groups: out };
}

/** Jumlah semua sel pivot (untuk invarian: harus sama dengan jumlah Counted sumber). */
export const pivotSum = p => p.groups.reduce((t, g) => t + g.subtotal.total, 0);
export const sumCounted = rows => rows.reduce((t, r) => t + r.counted, 0);

/** Baris Tabel (datar) diurutkan: dokumen, tanggal, user. */
export function tableRows(rows, names) {
  return rows.filter(r => r.counted).map(r => ({
    group: r.group, objId: r.objId, role: r.role, dateKind: r.dateKind, date: r.date || NO_DATE,
    user: names.get(r.user), status: r.status, counted: r.counted
  })).sort((a, b) => a.group.localeCompare(b.group) || a.objId.localeCompare(b.objId) || a.date.localeCompare(b.date) || a.user.localeCompare(b.user));
}

// ---------- CSV ----------
/** Netralkan injeksi rumus (= + - @ di awal) dan kutip bila perlu; pemisah ";". */
export function csvCell(v) {
  if (typeof v === "number") return String(v).replace(".", ",");
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (matrix) => "﻿" + matrix.map(r => r.map(csvCell).join(";")).join("\r\n") + "\r\n";

/** Total semua kelompok per kolom (baris "Total semua"). Lintas jenis dokumen: bukan ukuran kinerja. */
export function grandTotal(p) {
  const cells = {}; let total = 0;
  for (const g of p.groups) { for (const k in g.subtotal.cells) cells[k] = (cells[k] || 0) + g.subtotal.cells[k]; total += g.subtotal.total; }
  return { cells, total };
}

/**
 * Matriks pivot (header + baris) untuk CSV/Excel; angka sebagai angka.
 * Bawaan: sel 0 tampil 0, subtotal berlabel "Subtotal X". opts.compact: sel 0 jadi kosong dan label "Total X" (mirip pivot Excel);
 * opts.grand: tambah baris "Total semua" di akhir.
 */
export function pivotMatrix(p, firstHeads = ["Kelompok", "Dokumen"], opts = {}) {
  const v = n => (n || opts.compact ? (n || "") : 0);
  const out = [[...firstHeads, ...p.cols.map(c => c.label), "Total"]];
  for (const g of p.groups) {
    for (const o of g.objects) out.push([g.group, o.id, ...p.cols.map(c => v(o.cells[c.key])), o.total]);
    out.push([g.group, (opts.compact ? "Total " : "Subtotal ") + g.group, ...p.cols.map(c => v(g.subtotal.cells[c.key])), g.subtotal.total]);
  }
  if (opts.grand) { const t = grandTotal(p); out.push(["", "Total semua", ...p.cols.map(c => v(t.cells[c.key])), t.total]); }
  return out;
}

/**
 * Bentuk "Dokumen per hari" (mirip pivot Excel Query1): Kelompok | No | Dokumen | kolom tanggal | Grand Total.
 * Hanya baris dokumen (tanpa subtotal supaya filter Excel bersih; Kelompok terisi tiap baris, No urut 1..n) + baris "Total keseluruhan" terakhir. Sel 0 kosong.
 */
export function docMatrix(p) {
  const out = [["Kelompok", "No", "Dokumen", ...p.cols.map(c => c.label), "Grand Total"]]; let n = 0;
  for (const g of p.groups) for (const o of g.objects) out.push([g.group, ++n, o.id, ...p.cols.map(c => o.cells[c.key] || ""), o.total]);
  const t = grandTotal(p);
  out.push(["", "", "Total keseluruhan", ...p.cols.map(c => t.cells[c.key] || ""), t.total]);
  return out;
}

// ---------- ringkasan untuk laporan yang dibagikan (murni) ----------
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
/** Angka dengan titik ribuan (gaya Indonesia), deterministik tanpa bergantung ICU. */
export const fmtNum = n => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
/** "2026-10-18" -> "18 Okt 2026" (withYear=false -> "18 Okt"). */
export const fmtDateId = (s, withYear = true) => `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]}${withYear ? " " + s.slice(0, 4) : ""}`;
/** Periode ringkas: "1-21 Okt 2026", "28 Sep - 5 Okt 2026", "21 Okt 2026". */
export function fmtPeriod(from, to) {
  if (from === to) return fmtDateId(from);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${+from.slice(8, 10)}-${fmtDateId(to)}`;
  if (from.slice(0, 4) === to.slice(0, 4)) return `${fmtDateId(from, false)} - ${fmtDateId(to)}`;
  return `${fmtDateId(from)} - ${fmtDateId(to)}`;
}

/** Jumlah dokumen per kelompok: [{group, documents, objectsUsed, pct}] urut jumlah turun. Jumlah documents = total baris. */
export function groupStats(rows) {
  const m = new Map(); let total = 0;
  for (const r of rows) {
    if (!r.counted) continue;
    total += r.counted;
    let g = m.get(r.group); if (!g) m.set(r.group, g = { group: r.group, documents: 0, objs: new Set() });
    g.documents += r.counted; g.objs.add(r.objId);
  }
  return [...m.values()].sort((a, b) => b.documents - a.documents || a.group.localeCompare(b.group))
    .map(g => ({ group: g.group, documents: g.documents, objectsUsed: g.objs.size, pct: total ? g.documents / total * 100 : 0 }));
}

/** Jenis dokumen terbanyak: [{id, group, counted}] (limit teratas). Jumlahnya selalu <= total. */
export function topObjects(rows, limit = 10) {
  const m = new Map();
  for (const r of rows) {
    if (!r.counted) continue;
    let o = m.get(r.objId); if (!o) m.set(r.objId, o = { id: r.objId, group: r.group, counted: 0 });
    o.counted += r.counted;
  }
  return [...m.values()].sort((a, b) => b.counted - a.counted || a.id.localeCompare(b.id)).slice(0, limit);
}

/** Aktivitas per pengguna: [{user, name, counted, activeDays, objectsUsed}] urut jumlah turun (bukan peringkat kinerja). */
export function userStats(rows, names) {
  const m = new Map();
  for (const r of rows) {
    if (!r.counted) continue;
    let u = m.get(r.user); if (!u) m.set(r.user, u = { user: r.user, name: names.get(r.user), counted: 0, days: new Set(), objs: new Set() });
    u.counted += r.counted; u.objs.add(r.objId); if (r.date) u.days.add(r.date);
  }
  return [...m.values()].sort((a, b) => b.counted - a.counted || a.user - b.user)
    .map(u => ({ user: u.user, name: u.name, counted: u.counted, activeDays: u.days.size, objectsUsed: u.objs.size }));
}

/** Hari tersibuk (abaikan baris tanpa tanggal); seri -> tanggal paling awal. null bila tidak ada. */
export function busiestDay(rows) {
  const m = new Map();
  for (const r of rows) if (r.counted && r.date) m.set(r.date, (m.get(r.date) || 0) + r.counted);
  let best = null;
  for (const [date, count] of m) if (!best || count > best.count || (count === best.count && date < best.date)) best = { date, count };
  return best;
}

/** Kalimat kesimpulan 2-3 baris dari data; hanya fakta jumlah, tanpa klaim kinerja. */
export function buildSummary(rows, from, to) {
  const k = kpis(rows), per = fmtPeriod(from, to);
  if (!k.documents) return `Pada ${per} belum ada dokumen yang tercatat untuk filter ini.`;
  let s = `Pada ${per} tercatat ${fmtNum(k.documents)} dokumen oleh ${fmtNum(k.activeUsers)} pengguna di ${fmtNum(k.objectsUsed)} jenis dokumen.`;
  const b = busiestDay(rows), g = groupStats(rows), parts = [];
  if (b && k.activeDays > 1) parts.push(`hari tersibuk ${fmtDateId(b.date, false)} (${fmtNum(b.count)} dokumen)`);
  else if (b) parts.push(`seluruhnya tercatat pada ${fmtDateId(b.date)}`);
  if (g.length > 1) parts.push(`kelompok terbanyak: ${g[0].group} (${fmtNum(g[0].documents)})`);
  else if (g.length) parts.push(`seluruhnya di kelompok ${g[0].group}`);
  if (parts.length) { const t = parts.join("; "); s += " " + t.charAt(0).toUpperCase() + t.slice(1) + "."; }
  return s;
}

// ---------- redesain: urut, grafik bertumpuk, kartu user ----------
/** Urutkan dokumen DI DALAM tiap kelompok menurut kolom key ("total", "doc", atau kunci kolom). dir: "desc" | "asc" | null (asli). */
export function sortPivot(p, key, dir) {
  if (!dir || !key) return p;
  const sgn = dir === "asc" ? 1 : -1;
  for (const g of p.groups) {
    const idx = new Map(g.objects.map((o, i) => [o, i]));
    const val = o => (key === "total" ? o.total : o.cells[key] || 0);
    g.objects.sort((a, b) => (key === "doc" ? sgn * byName(a.id, b.id) : sgn * (val(a) - val(b))) || idx.get(a) - idx.get(b));
  }
  return p;
}

/** Bagian per kelompok -> segmen batang bertumpuk: < minPct digabung ke Lainnya, lebar minimal minPx. */
export function stackSegments(parts, total, { width = 140, minPct = 3, minPx = 2 } = {}) {
  const big = [], rest = { group: OTHER_GROUP.name, n: 0 };
  for (const x of parts) {
    if (!x.n) continue;
    if (x.group === OTHER_GROUP.name || (total && x.n / total * 100 < minPct)) rest.n += x.n; else big.push({ group: x.group, n: x.n });
  }
  big.sort((a, b) => b.n - a.n || a.group.localeCompare(b.group));
  if (rest.n) big.push(rest);
  return big.map(x => ({ ...x, pct: total ? x.n / total * 100 : 0, px: Math.max(minPx, total ? x.n / total * width : 0) }));
}

/** Kartu per user (abjad nama): jumlah, hari aktif, segmen kelompok, daftar jenis dokumen. users = Map indeks -> {name, code}. */
export function userCards(rows, users) {
  const m = new Map();
  for (const r of rows) {
    if (!r.counted) continue;
    let u = m.get(r.user); if (!u) m.set(r.user, u = { user: r.user, counted: 0, days: new Set(), groups: new Map(), objs: new Map() });
    u.counted += r.counted; if (r.date) u.days.add(r.date);
    u.groups.set(r.group, (u.groups.get(r.group) || 0) + r.counted);
    u.objs.set(r.objId, (u.objs.get(r.objId) || 0) + r.counted);
  }
  return [...m.values()].map(u => {
    const info = users.get(u.user) || {};
    return { user: u.user, name: info.name, code: info.code || "", counted: u.counted, activeDays: u.days.size,
      segments: stackSegments([...u.groups].map(([group, n]) => ({ group, n })), u.counted),
      objects: [...u.objs].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n || a.id.localeCompare(b.id)) };
  }).sort((a, b) => byName(a.name, b.name) || a.user - b.user);
}

/** Tren bertumpuk: topN kelompok terbesar + Lainnya (sisa + kelompok Lainnya). Jumlah segmen = total titik. */
export function stackedTrend(rows, from, to, maxDays = 62, topN = 8) {
  const tr = trend(rows, from, to, maxDays), tot = new Map();
  for (const r of rows) if (r.counted) tot.set(r.group, (tot.get(r.group) || 0) + r.counted);
  const ranked = [...tot].filter(([g]) => g !== OTHER_GROUP.name).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, topN).map(x => x[0]);
  const top = new Set(ranked), pts = new Map(tr.points.map(p => [p.key, { key: p.key, total: p.value, segs: {} }]));
  for (const r of rows) {
    if (!r.counted || !r.date) continue;
    const pt = pts.get(bucketKey(r.date, tr.bucket)); if (!pt) continue;
    const g = top.has(r.group) ? r.group : OTHER_GROUP.name;
    pt.segs[g] = (pt.segs[g] || 0) + r.counted;
  }
  const hasOther = [...pts.values()].some(p => p.segs[OTHER_GROUP.name]);
  const groups = ranked.concat(hasOther ? [OTHER_GROUP.name] : []);
  return { bucket: tr.bucket, groups, points: [...pts.values()],
    totals: groups.map(g => ({ group: g, n: [...pts.values()].reduce((t, p) => t + (p.segs[g] || 0), 0) })) };
}

/** Granularitas kolom matriks slide: hari bila muat maxCols, kalau tidak minggu, lalu bulan. */
export function slideBucket(from, to, maxCols = 16) {
  const days = daysBetween(from, to) + 1;
  if (days <= maxCols) return "day";
  return Math.ceil(days / 7) + 1 <= maxCols ? "week" : "month";
}
