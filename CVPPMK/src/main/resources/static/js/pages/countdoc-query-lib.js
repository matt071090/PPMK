// Logika murni halaman "Daftar Query" Count Document (tanpa DOM): status jalan, kelompok, sort/filter/paging tabel hasil, CSV.
// Dipisah dari countdoc-query.js supaya bisa dites di node tanpa browser.
import { toCsv } from "./countdoc-engine.js";

export const SLOW_MS = 8000;

/** Status jalan query (hanya di memori/sessionStorage klien). Simbol + teks, bukan hanya warna. */
export const RUN_STATES = {
  belum: { sym: "○", label: "Belum" },
  ok: { sym: "✓", label: "OK" },
  kosong: { sym: "∅", label: "Kosong" },
  gagal: { sym: "✕", label: "Gagal" },
  lambat: { sym: "◷", label: "Lambat" },
  terpotong: { sym: "✂", label: "Terpotong" },
  tidak_tersedia: { sym: "⊘", label: "Tidak tersedia" }
};

/** Status cek manual (disimpan di server). */
export const CHECK_STATES = {
  belum: { sym: "○", label: "Belum" },
  cocok: { sym: "✓", label: "Cocok" },
  selisih: { sym: "≠", label: "Selisih" },
  perlu_perbaikan: { sym: "!", label: "Perlu perbaikan" }
};

/** Turunkan status jalan dari respons POST /query/run. Prioritas: error > kosong > terpotong > lambat > ok. */
export function deriveRun(resp) {
  const ms = Number(resp && resp.ms) || 0;
  if (!resp) return { state: "gagal", ms: 0, rows: 0 };
  if (resp.error) return { state: resp.error === "tidak_tersedia" ? "tidak_tersedia" : "gagal", ms, rows: 0, code: resp.code || null, reason: resp.error };
  const rows = Array.isArray(resp.rows) ? resp.rows.length : Number(resp.rowCount) || 0;
  const state = rows === 0 ? "kosong" : resp.truncated ? "terpotong" : ms >= SLOW_MS ? "lambat" : "ok";
  return { state, ms, rows };
}

export const fmtMs = ms => ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1).replace(".", ",")} dtk`;

/** Kelompokkan query menurut `group` (urutan kemunculan di manifest) setelah disaring. */
export function groupQueries(queries, pred) {
  const order = [], map = new Map();
  for (const q of queries) {
    if (pred && !pred(q)) continue;
    if (!map.has(q.group)) { map.set(q.group, []); order.push(q.group); }
    map.get(q.group).push(q);
  }
  return order.map(g => ({ group: g, items: map.get(g) }));
}

/** Pencarian daftar: label, id, sumber tabel, kelompok (tanpa membedakan huruf besar/kecil). */
export function matchesQuery(q, text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return true;
  return [q.label, q.id, q.source, q.group].some(s => String(s || "").toLowerCase().includes(t));
}

// ---------- tabel hasil ----------
const cmpText = (a, b) => String(a).localeCompare(String(b), "id", { numeric: true, sensitivity: "base" });

/** Urut stabil menurut tipe kolom ("num" | "date" | "text"); null/kosong selalu di akhir, apa pun arahnya. dir: "asc" | "desc" | null (null = urutan asli). */
export function sortRows(rows, col, type, dir) {
  const idx = rows.map((r, i) => i);
  if (col == null || col < 0 || !dir) return rows.slice();
  const sign = dir === "desc" ? -1 : 1;
  const isNull = v => v === null || v === undefined || v === "";
  idx.sort((i, j) => {
    const a = rows[i][col], b = rows[j][col];
    const na = isNull(a), nb = isNull(b);
    if (na || nb) return na && nb ? i - j : na ? 1 : -1;
    const c = type === "num" ? (Number(a) - Number(b)) : type === "date" ? (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0) : cmpText(a, b);
    return c ? c * sign : i - j;
  });
  return idx.map(i => rows[i]);
}

/** Filter global: sel mana pun memuat teks (tanpa membedakan huruf besar/kecil). */
export function filterRows(rows, text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return rows;
  return rows.filter(r => r.some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(t)));
}

export const PAGE_SIZES = [25, 50, 100, 250];

/** Paging klien. page berbasis 0 dan dijepit ke rentang yang sah. */
export function paginate(total, page, size) {
  const s = PAGE_SIZES.includes(size) ? size : 50;
  const pages = Math.max(1, Math.ceil(total / s));
  const p = Math.min(Math.max(0, page | 0), pages - 1);
  const from = total === 0 ? 0 : p * s;
  return { page: p, pages, size: s, from, to: Math.min(total, from + s) };
}

/** Matriks header + baris (angka tetap angka) untuk CSV/Excel. */
export const toMatrix = (columns, rows) => [columns.map(c => c.name), ...rows];

/** CSV: pemisah ";", BOM, awalan = + - @ dinetralkan (lihat csvCell di countdoc-engine.js). */
export const csvOf = (columns, rows) => toCsv(toMatrix(columns, rows));

export const slugName = s => String(s).normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "query";

/** Simpan/muat status jalan ke string JSON (sessionStorage); data rusak diabaikan. */
export function loadRuns(raw) {
  try {
    const o = JSON.parse(raw);
    const out = {};
    if (o && typeof o === "object") for (const k of Object.keys(o)) {
      const v = o[k];
      if (v && RUN_STATES[v.state] && v.state !== "belum") out[k] = { state: v.state, ms: Number(v.ms) || 0, rows: Number(v.rows) || 0, code: v.code || null };
    }
    return out;
  } catch { return {}; }
}
