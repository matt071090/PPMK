import { company } from './company.js';
// Public display flag uses the same server reader as Setup, without requiring its unlock session.
// Unknown preserves checks; this flag never grants permission to upload.
export const capabilities = { branchEnabled: null };
export async function loadCapabilities() {
  try {
    const r = await fetch('api/branch-mode', { cache: 'no-store' });
    if (!r.ok) throw new Error('Mode branch belum tersedia');
    const d = await r.json();
    capabilities.branchEnabled = typeof d.branchEnabled === 'boolean' ? d.branchEnabled : null;
  } catch { capabilities.branchEnabled = null; }
  return capabilities;
}
export const nonBranch = () => capabilities.branchEnabled === false;
// Explicit ownership: mixed-use fields (e.g. ITR type) remain applicable.
const BRANCH_UDFS = new Set(['OWTQ.STEM_FRBRWHS','OWTQ.STEM_TOBR','OWTQ.STEM_TOBRWHS',
  'OWTR.STEM_TOBR','OWTR.STEM_DOCSTATUS','OWTR.STEM_ITBGUID','WTR1.STEM_OPENQTY',
  'OIGE.STEM_ITBGUID','OIGN.STEM_ITBGUID','OWTR.STEM_ITTYPE']);
export function branchOnly(kind, r) {
  if (kind === 'PARAMS') return ['Interbranch', 'Branch'].includes(r[1]) || r[0] === 'INSERTPARAMAUTO';
  if (kind === 'TABLES') return r[0] === 'STEM_TIBRANCHH';
  if (kind === 'UDFS') return r[1] === 'BRANCH' || BRANCH_UDFS.has(`${r[0]}.${r[1].toUpperCase()}`);
  return false;
}
export const applicable = (kind, rows) => nonBranch() ? rows.filter(r => !branchOnly(kind, r)) : rows;
export const branchNotice = n => n ? `<p class="sec-lead">${n} item khusus branch disembunyikan (company tanpa branch).</p>` : '';
export const emptyPreference = id => { try { return localStorage.getItem(`show-empty:${id}`) === '1'; } catch { return false; } };
export const saveEmptyPreference = (id, show) => { try { localStorage.setItem(`show-empty:${id}`, show ? '1' : '0'); } catch {} };
export const addonHasData = o => o.rowCount !== 0; // Unknown is visible, never infer zero from unavailable metadata.
export const reviewableMenus = pages => pages.filter(p => p.status && !p.empty && !p.retired);

export const blankValue = v => v === null || v === undefined || String(v).trim() === '';
export const emptyDataRow = row => {
  const fields = Object.keys(row).filter(k => k.startsWith('U_'));
  return fields.length > 0 && fields.every(k => blankValue(row[k]));
};

export const hiddenAddonTable = name => company.addonRules.some(rule => rule.hide && rule.prefixes.some(prefix => String(name||'').replace(/^@/,'').toUpperCase().startsWith(prefix.toUpperCase())));

// Item yang dicabut (mis. Cut off 2027) ditandai oleh rule company: retired + prefixes (tabel/UDO) atau fields ("TABEL.U_FIELD").
// Disembunyikan secara bawaan, tidak masuk temuan maupun hitungan review; bisa dilihat lewat toggle yang tersimpan per browser.
const upper = v => String(v || '').replace(/^@/, '').toUpperCase();
const retiredRules = () => company.addonRules.filter(rule => rule.retired);
export const retiredAddonTable = name => retiredRules().some(rule => (rule.prefixes || []).some(prefix => prefix && upper(name).startsWith(prefix.toUpperCase())));
export const retiredAddonField = (table, field) => retiredRules().some(rule => (rule.fields || []).some(f => upper(f) === `${upper(table)}.${upper(field)}`));
export const retiredAddonObject = o => !!o && (retiredAddonTable(o.code) || (o.tables || []).some(t => retiredAddonTable(t.name)));
export const retiredPreference = () => { try { return localStorage.getItem('show-retired:addon') === '1'; } catch { return false; } };
export const saveRetiredPreference = show => { try { localStorage.setItem('show-retired:addon', show ? '1' : '0'); } catch {} };
export const RETIRED_LABEL = 'Dicabut (Cut off 2027)';
// Catatan di atas daftar: jumlah item dicabut + toggle yang sama dengan sidebar. n = 0 (company tanpa rule) tidak menampilkan apa pun.
export const retiredNotice = (n, show = retiredPreference()) => n ? `<p class="sec-lead retired-note"><label><input type="checkbox" data-retired-toggle${show ? ' checked' : ''}> Tampilkan yang dicabut</label> <span class="muted">· ${n} item dicabut (Cut off 2027) ${show ? 'ditampilkan' : 'disembunyikan'}</span></p>` : '';
export const retiredBadge = '<span class="badge retired">Dicabut</span>';

// Halaman/blok SAP standar yang kosong disembunyikan: "tidak ada data = tidak masuk web". Berbasis config company (hideWhenEmpty,
// allowlist eksplisit; halaman inti seperti COA, Item, Warehouse tidak pernah masuk daftar). Entri "id-halaman" = satu menu,
// "id-halaman/id-blok" = satu blok di dalam halaman (id blok = kunci hasil query). Tanpa config (CV) tidak ada yang disembunyikan.
// Hanya disembunyikan kalau datanya termuat tanpa galat dan 0 baris; data yang gagal dimuat tetap tampil beserta galatnya.
const hideListed = key => (company.hideWhenEmpty || []).includes(key);
export const stdEmptyPreference = () => emptyPreference('std-empty');
export const saveStdEmptyPreference = show => saveEmptyPreference('std-empty', show);
export const resultEmpty = r => !!r && !r.error && Array.isArray(r.rows) && r.rows.length === 0;
export const pageEmpty = (results, keys) => {
  const list = keys ? keys.map(k => (results || {})[k]) : Object.values(results || {});
  return list.length > 0 && list.every(resultEmpty);
};
export const hidesPage = id => hideListed(id);
// Halaman terdaftar yang seluruh datanya termuat dan 0 baris (belum memperhitungkan toggle "Tampilkan yang kosong").
export const stdEmptyPage = (id, results) => hideListed(id) && pageEmpty(results);
// Blok di dalam halaman. Dicatat per render supaya catatan "N blok kosong disembunyikan" tahu apa yang disembunyikan; idempotent per blok.
const tally = { hidden: new Map(), shown: new Map() };
export const resetBlockTally = () => { tally.hidden.clear(); tally.shown.clear(); };
export function blockHidden(pageId, blockId, result, label = blockId) {
  if (!hideListed(`${pageId}/${blockId}`) || !resultEmpty(result)) return false;
  const show = stdEmptyPreference();
  (show ? tally.shown : tally.hidden).set(blockId, label);
  return !show;
}
const escText = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function blockNotice() {
  const show = tally.shown.size > 0, labels = [...(show ? tally.shown : tally.hidden).values()];
  if (!labels.length) return '';
  return `<p class="sec-lead retired-note std-empty-note"><label><input type="checkbox" data-std-toggle${show ? ' checked' : ''}> Tampilkan yang kosong</label> <span class="muted">· ${labels.length} blok kosong ${show ? 'ditampilkan' : 'disembunyikan'}: ${escText(labels.join(', '))}</span></p>`;
}
