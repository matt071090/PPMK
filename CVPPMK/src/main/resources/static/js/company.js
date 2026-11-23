// Metadata for display and exported filenames. Kept independent of DOM and page helpers.
export const company = { name: 'No company', code: '', picGroup:'PPMK', picSource:'file', picUsersFile:'ppmk-users.json', picExcludedCodes:[], addonCatalogs:[], addonRules:[] };
let pending;
export function loadCompany() {
  return pending || (pending = fetch('api/company', { cache: 'no-store' }).then(async r => {
    if (!r.ok) throw new Error('Identitas company belum dapat dimuat. Coba muat ulang.');
    const d = await r.json();
    if (d.code && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.code)) throw new Error('Kode company tidak valid.');
    company.code = d.code || '';
    company.picGroup = d.picGroup || (company.code ? company.code.toUpperCase() : 'PPMK');
    company.picSource = d.picSource || (company.code ? 'none' : 'file');
    company.picUsersFile = d.picUsersFile || (!company.code ? 'ppmk-users.json' : '');
    company.addonCatalogs = Array.isArray(d.addonCatalogs) ? d.addonCatalogs : [];
    company.addonRules = Array.isArray(d.addonRules) ? d.addonRules : [];
    company.picExcludedCodes = Array.isArray(d.picExcludedCodes) ? d.picExcludedCodes : [];
    if (typeof document !== 'undefined') document.documentElement.dataset.company = company.code;
    if (d.name) company.name = d.name;
    return company;
  }).catch(e => { pending = null; throw e; }));
}
export const companyKey = key => company.code && !['theme', 'editor'].includes(key) ? `${company.code}:${key}` : key;
export function companyTitle(title, name = company.name) {
  return !name || name === 'No company' || title.endsWith(` · ${name}`) ? title : `${title} · ${name}`;
}
export function companyFilename(filename, code = company.code) {
  if (!code) return filename;
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? `${filename.slice(0, dot)}-${code}${filename.slice(dot)}` : `${filename}-${code}`;
}
