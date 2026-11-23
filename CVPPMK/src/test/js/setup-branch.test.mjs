import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
globalThis.document = { addEventListener() {} };
const { compare, payload, excelRows, templateSheet } = await import('../../main/resources/static/js/pages/setup.js');
import { branchStep, branchTemplate, branchErrors, stripBranchFields } from '../../main/resources/static/js/pages/setup-branch.js';
import { TEMPLATES, buildTemplate } from '../../main/resources/static/js/templates.js';

const steps = JSON.parse(readFileSync(new URL('../../main/resources/setup/steps.json', import.meta.url)));
const byId = id => steps.find(s => s.id === id);
const lookup = { 'branches|Name': new Map([['KEDIRI', '1']]) };
const inputs = { empty: '', zero: 0, valid: 'Kediri', unknown: 'TidakAda' };
const base = id => id === 'warehouses' ? { WarehouseCode: 'GDG01', WarehouseName: 'Gudang utama' }
  : id === 'asset-classes' ? { Code: 'MESIN', Description: 'Mesin' }
  : { Document: '13', DocumentSubType: '--', Name: 'IN26', PeriodIndicator: '2026', InitialNumber: '1' };
const emptyTarget = { columns: [], rows: [] };

for (const id of ['warehouses', 'asset-classes', 'document-numbering']) {
  for (const branches of [true, false]) for (const [kind, branch] of Object.entries(inputs)) for (const update of [false, true]) {
    test(`${id}: branches=${branches}, ${kind}, ${update ? 'update' : 'create'}`, () => {
      const step = branchStep(byId(id), branches), src = { ...base(id), _Branch: branch };
      const target = update ? { columns: ['_key', ...Object.keys(src)], rows: [['7', ...Object.entries(src).map(([k,v]) => k === '_Branch' ? 'Lama' : k === 'InitialNumber' ? '2' : k === 'WarehouseName' || k === 'Description' ? 'Nama lama' : v)]] } : emptyTarget;
      const row = compare(step, { target, sourceRows: [src] }, lookup).rows[0];
      const valid = branches ? kind === 'valid' || (id === 'document-numbering' && kind === 'empty') : kind === 'empty';
      assert.equal(row.status, valid ? update ? 'diff' : 'new' : 'error');
      if (!valid) { assert.ok(row.errors.length); return; }
      const out = payload(step, row, lookup);
      assert.equal(out.action, update ? 'update' : 'create');
      const branchField = id === 'warehouses' ? 'BusinessPlaceID' : 'BPLID';
      assert.equal(out.data[branchField], branches && kind === 'valid' ? 1 : undefined);
      assert.equal(Object.keys(out.data).some(k => k.startsWith('_')), false);
    });
  }
}

for (const branches of [true, false]) for (const [kind, value] of Object.entries(inputs)) {
  test(`Shift retains legacy branch behavior / strips non-branch: ${branches} ${kind}`, () => {
    const step = branchStep(byId('st-shift'), branches);
    const row = compare(step, { target: emptyTarget, sourceRows: [{ Code: 'PAGI', Name: 'Pagi', U_BRANCH: value }] }).rows[0];
    assert.equal(row.status, !branches && kind !== 'empty' ? 'error' : 'new');
    if (row.status === 'new') {
      const data = payload(step, row, {}).data;
      assert.equal(data.U_BRANCH, branches && kind !== 'empty' ? String(value) : undefined);
    }
  });
}

test('null and whitespace are empty; numeric and string zero remain meaningful', () => {
  for (const value of [null, '', '  ', undefined]) assert.deepEqual(branchErrors({ _Branch: value }), []);
  for (const value of [0, '0']) assert.equal(branchErrors({ _Branch: value }).length, 1);
});

test('all nested BPL/branch properties are stripped, even null/empty', () => {
  assert.deepEqual(stripBranchFields({ CardCode: 'C1', BPBranchAssignment: [], Child: [{ BPLID: null, BusinessPlaceID: '', U_BRANCH: null, Name: 'A' }] }),
    { CardCode: 'C1', Child: [{ Name: 'A' }] });
  assert.equal(branchErrors({ Child: [{ BPLID: 0 }] }).length, 1);
});

test('unknown mode blocks both comparison and payload', () => {
  const step = branchStep(byId('warehouses'), null), src = { ...base('warehouses'), _Branch: 'Kediri' };
  const row = compare(step, { target: emptyTarget, sourceRows: [src] }, lookup).rows[0];
  assert.equal(row.status, 'error');
  assert.throws(() => payload(step, row, lookup), /belum dapat dipastikan/);
});

for (const [id, no] of [['warehouses', '09'], ['asset-classes', '15']]) for (const branches of [true, false]) {
  test(`T${no}: branch required only for branch company; Excel parsing: ${branches}`, async () => {
    const step = branchStep(byId(id), branches), raw = TEMPLATES.find(t => t.no === no), tpl = branchTemplate(raw, branches);
    const fs = tpl.sheets[0].fields;
    assert.equal(fs.some(f => /BusinessPlaceID|BPLID/.test(f.field) && f.req), branches);
    const values = fs.map(f => base(id)[f.field] || (f.field === 'BPLID' || f.field === 'BusinessPlaceID' ? 'Kediri' : ''));
    const parsed = await excelRows(step, tpl, [{ name: tpl.sheets[0].name, rows: [fs.map(f=>f.label), fs.map(f=>f.field), values] }]);
    assert.deepEqual(parsed.rows[0]._errors, []);
    const sheet = templateSheet(step, tpl, parsed.rows);
    assert.equal(sheet.rows[1].some(f => /BusinessPlaceID|BPLID/.test(f)), branches);
    assert.equal(raw.sheets[0].fields.some(f => /BusinessPlaceID|BPLID/.test(f.field) && f.req), true);
  });
}

test('old Excel with nonempty branch is rejected before any branch reference fetch', async () => {
  const tpl = TEMPLATES.find(t => t.no === '09'), step = branchStep(byId('warehouses'), false), fs = tpl.sheets[0].fields;
  for (const branch of [0, 'Kediri', 'TidakAda']) {
    const parsed = await excelRows(step, tpl, [{ name: 'Warehouse', rows: [[], fs.map(f => f.field), fs.map(f => f.field === 'BusinessPlaceID' ? branch : base('warehouses')[f.field] || '')] }]);
    assert.equal(parsed.rows[0]._errors.length, 1);
  }
});

test('BP and user templates drop branch assignment sheets for non-branch company', () => {
  for (const no of ['11', '23']) {
    const tpl = TEMPLATES.find(t => t.no === no);
    assert.ok(tpl.sheets.some(s => s.name === 'Branch'));
    assert.equal(branchTemplate(tpl, false).sheets.some(s => s.name === 'Branch'), false);
  }
});

test('T09 workbook excludes branch UDFs too, retaining ordinary UDFs', () => {
  const tpl = branchTemplate(TEMPLATES.find(t => t.no === '09'), false);
  const out = buildTemplate(tpl, { udf: [{ TableID: 'OWHS', AliasID: 'BRANCH', Descr: 'Branch' }, { TableID: 'OWHS', AliasID: 'ZONE', Descr: 'Zona' }], udfv: {} }, 'QA');
  assert.ok(out.blob.size > 0);
});

test('duplicate series remain errors when moving from branch to non-branch', () => {
  const step = branchStep(byId('document-numbering'), false);
  const rows = compare(step, { target: emptyTarget, sourceRows: [base('document-numbering'), base('document-numbering')] }).rows;
  assert.equal(rows[1].status, 'error');
  assert.match(rows[1].errors.join(), /Duplikat/);
});
