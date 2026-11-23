// Sambungan status Schedule <-> Review di aplikasi utama (api/review). Fungsi murni di-export supaya bisa diuji node.
// Item master data yang punya halaman Review otomatis mengikuti status Review halaman itu:
//   semua halaman "Sesuai" -> item dianggap selesai; ada yang "Belum sesuai" -> proses; selain itu pakai status manual.
// Pemetaan ini ASUMSI awal (id item Schedule -> id halaman di sections.json); ubah di sini bila ada yang kurang pas.

export const REVIEW_MAP = {
  'master-A0': ['coa'],
  'master-A1': ['tax'],
  'master-A2': ['payment-terms'],
  'master-A3': ['gl-determination'],
  'master-A4': ['fixed-asset'],
  'master-B0': ['item-groups'],
  'master-B1': ['business-partners'],
  'master-B2': ['business-partners'],
  'master-B3': ['sales-employee'],
  'master-C0': ['cost-center'],
  'master-C1': ['cost-center'],
  'master-C2': ['banks', 'house-bank'],
  'master-C3': ['warehouses'],
  'master-D0': ['business-partners'],
  'master-D1': ['items'],
  'master-E0': ['udo', 'udt', 'udf']
};

export const REVIEW_LABEL = { ok: 'Sesuai', nok: 'Belum sesuai', none: 'Belum direview' };

/** Status gabungan beberapa halaman Review. reviewPages = isi `pages` dari GET api/review, atau null bila gagal dimuat. */
export function reviewState(pageIds, reviewPages) {
  if (!Array.isArray(pageIds) || !pageIds.length) return null;
  if (!reviewPages || typeof reviewPages !== 'object') return { state: 'unknown', pages: pageIds.map(id => ({ id, status: 'unknown' })) };
  const pages = pageIds.map(id => {
    const r = reviewPages[id];
    const s = r && (r.status === 'ok' || r.status === 'nok') ? r.status : 'none';
    return { id, status: s, by: r && r.by || '', at: r && r.at || '' };
  });
  const state = pages.some(p => p.status === 'nok') ? 'nok' : pages.every(p => p.status === 'ok') ? 'ok' : 'none';
  return { state, pages };
}

/** Status yang dipakai Schedule: {status, auto, review}. auto=true bila ditentukan Review (bukan input manual). */
export function resolveStatus(item, reviewPages, map = REVIEW_MAP) {
  const review = reviewState(map[item.id], reviewPages);
  if (!review || review.state === 'unknown' || review.state === 'none') return { status: item.status, auto: false, review };
  return { status: review.state === 'ok' ? 'selesai' : 'proses', auto: true, review };
}

/** Salinan daftar item dengan status sudah mengikuti Review (data asli tidak diubah / tidak disimpan). */
export function withReview(items, reviewPages, map = REVIEW_MAP) {
  return items.map(it => {
    const r = resolveStatus(it, reviewPages, map);
    return r.auto ? Object.assign({}, it, { status: r.status, auto: true, review: r.review }) : (r.review ? Object.assign({}, it, { review: r.review }) : it);
  });
}

export async function loadReview(fetchImpl = fetch) {
  try {
    const r = await fetchImpl('api/review', { cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.pages && typeof d.pages === 'object' ? d.pages : {};
  } catch { return null; }
}

/** Tautan ke halaman Review di aplikasi utama (index.html). */
export const reviewHref = id => `index.html#/${encodeURIComponent(id)}`;
