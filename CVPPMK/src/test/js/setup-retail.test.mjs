import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
globalThis.document = { addEventListener() {} };
const { compare, payload } = await import('../../main/resources/static/js/pages/setup.js');
const steps = JSON.parse(readFileSync(new URL('../../main/resources/setup/retail-steps.json', import.meta.url)));
const evidence = JSON.parse(readFileSync(new URL('../../../docs/qa-wbi/retail-metadata.json', import.meta.url))).entities;
const step = id => ({ ...steps.find(s => s.id === id), branchEnabled: false });
const empty = { columns: [], rows: [] };
const source = s => Object.fromEntries(s.fields.map(f => [f, (s.numeric || []).includes(f) ? '1' : 'Value']));
const table = src => ({ columns: ['_key', ...Object.keys(src)], rows: [['1', ...Object.values(src)]] });

for (const raw of steps) test(`${raw.id}: same-company source compares equal and verified payload is typed`, () => {
  const s = step(raw.id), src = source(s);
  // Use JSON.stringify so quotes and former delimiter characters are preserved literally.
  if (s.children) src._Detail = JSON.stringify([{ U_WCCode: 'WC1', U_WCDesc: 'A | ^ " quote', U_Seq: 2 }]);
  const same = compare(s, { target: table(src), sourceRows: [{ ...src }] }, {}).rows[0];
  assert.equal(same.status, 'same');
  const row = compare(s, { target: empty, sourceRows: [src] }, {}).rows[0];
  assert.equal(row.status, 'new');
  const out = payload(s, row, {}).data;
  for (const f of s.numeric) if (!s.omitOnCreate?.includes(f)) assert.equal(typeof out[f], 'number');
  if (s.omitOnCreate) for (const f of s.omitOnCreate) assert.equal(f in out, false);
  for (const f of Object.keys(out)) assert.ok(evidence[s.entity].fields.some(p => p.Name === f));
  if (s.children) assert.deepEqual(out.ST_UDRTDCollection, JSON.parse(src._Detail));
});

test('Retail Route rejects changed detail even when header changes too', () => {
  const s = step('st-udroute'), src = { ...source(s), _Detail: '[{"U_WCCode":"NEW","U_Seq":1}]' };
  for (const name of [src.Name, 'Old name']) {
    const old = { ...src, Name: name, _Detail: '[{"U_WCCode":"OLD","U_Seq":1}]' };
    const row = compare(s, { target: table(old), sourceRows: [src] }, {}).rows[0];
    assert.equal(row.status, 'error'); assert.match(row.errors.join(' '), /Detail beda/);
  }
  const row = compare(s, { target: table({ ...src, Name: 'Old name' }), sourceRows: [src] }, {}).rows[0];
  assert.equal(row.status, 'diff'); assert.deepEqual(payload(s, row, {}).data, { Name: src.Name });
});

test('malformed Route JSON is an error before sending', () => {
  const s = step('st-udroute');
  for (const value of ['not JSON', '{}']) {
    const row = compare(s, { target: empty, sourceRows: [{ ...source(s), _Detail: value }] }, {}).rows[0];
    assert.equal(row.status, 'error'); assert.match(row.errors.join(' '), /array JSON/);
  }
});

test('auto increment Rule Transfer matches business fields rather than source Code', () => {
  const s = step('stem-ruletransfer'), src = source(s);
  const row = compare(s, { target: table({ ...src, Code: '987' }), sourceRows: [src] }, {}).rows[0];
  assert.equal(row.status, 'same');
  const blank = { Name: 'Missing rule' };
  assert.equal(compare(s, { target: empty, sourceRows: [blank] }, {}).rows[0].status, 'error');
});
