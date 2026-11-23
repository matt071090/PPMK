// Pure Setup branch rules, shared by comparison, Excel templates and payload construction.
export const isBranchField = field => /branch|bpl|businessplace/i.test(field);
const empty = value => value == null || (typeof value === 'string' && value.trim() === '');
export function branchErrors(value, path = '') {
  if (Array.isArray(value)) return value.flatMap((v, i) => branchErrors(v, `${path}[${i}]`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([field, v]) => isBranchField(field)
    ? empty(v) || (typeof v === 'object' && Object.keys(v).length === 0) ? [] : [`${path}${field} tidak berlaku: company tujuan tidak memakai branch. Kosongkan input branch.`]
    : branchErrors(v, `${path}${field}.`));
}
export function stripBranchFields(value) {
  if (Array.isArray(value)) return value.map(stripBranchFields);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([field]) => !isBranchField(field)).map(([k, v]) => [k, stripBranchFields(v)]));
}
export function branchStep(step, enabled) {
  if (enabled !== false) return { ...step, branchEnabled: enabled };
  return { ...step, branchEnabled: false,
    required: (step.required || []).filter(f => !isBranchField(f)),
    lookups: (step.lookups || []).filter(l => l.step !== 'branches' && !isBranchField(l.field)),
    requires: (step.requires || []).filter(f => f !== 'Branch'),
    ...(step.id === 'company-details' ? { title: 'Company Details', note: 'Company tujuan tidak memakai branch.' } : {}),
    ...(['warehouses', 'asset-classes', 'st-shift'].includes(step.id) ? { note: 'Company tujuan tidak memakai branch. Kosongkan seluruh kolom branch pada data sumber.' } : {}) };
}
export function branchTemplate(template, enabled) {
  if (!template || enabled !== false) return template;
  return { ...template, branchEnabled: false, sheets: template.sheets.filter(s => s.name !== 'Branch').map(s => ({ ...s, fields: s.fields.filter(f => !isBranchField(f.field)) })),
    note: 'Company tujuan tidak memakai branch. Kolom dan assignment branch tidak digunakan.' };
}
