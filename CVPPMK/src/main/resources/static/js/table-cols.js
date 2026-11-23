// Kolom tabel yang kosong di SEMUA baris dianggap tidak dipakai dan disembunyikan (tampilan dan Excel).
// Murni logika, tanpa DOM: dipakai ui.js dan tes. Temuan/review tidak memakai ini; mereka dihitung dari data.

// Sel dianggap kosong bila HTML-nya hanya penanda "belum diisi" atau teks kosong.
export const blankHtml = html => String(html ?? "")
  .replace(/<span class="empty">[^<]*<\/span>/g, "")
  .replace(/<[^>]*>/g, "")
  .replace(/&nbsp;| /g, " ")
  .trim() === "";

// Kunci kolom yang disembunyikan. cell(col, row) -> HTML sel persis seperti yang dirender tabel.
// Kolom pertama (identitas/kunci) dan kolom di `keep` (dipakai aturan temuan) tidak pernah disembunyikan.
// Tanpa baris data tidak ada yang disembunyikan.
export function emptyColumnKeys(cols, rows, cell, keep = []) {
  if (!rows || !rows.length) return [];
  const kept = new Set(keep);
  return cols.slice(1).filter(c => !kept.has(c.key) && rows.every(r => blankHtml(cell(c, r)))).map(c => c.key);
}

// Kunci preferensi per tabel yang stabil antar render: id tabel bila ada, kalau tidak dari daftar kolom.
export function colPrefKey(cols, id) {
  if (id) return String(id);
  let h = 5381;
  for (const ch of cols.map(c => c.key).join("|")) h = ((h << 5) + h + ch.charCodeAt(0)) >>> 0;
  return `t${h.toString(36)}`;
}
