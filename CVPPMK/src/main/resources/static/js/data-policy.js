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
export const reviewableMenus = pages => pages.filter(p => p.status && !p.empty);

export const blankValue = v => v === null || v === undefined || String(v).trim() === '';
export const emptyDataRow = row => {
  const fields = Object.keys(row).filter(k => k.startsWith('U_'));
  return fields.length > 0 && fields.every(k => blankValue(row[k]));
};

export const hiddenAddonTable = name => company.addonRules.some(rule => rule.hide && rule.prefixes.some(prefix => String(name||'').replace(/^@/,'').toUpperCase().startsWith(prefix.toUpperCase())));
