// Panel detail master-detail (Item, Business Partner): field kosong disembunyikan, dihitung, toggle tersimpan per browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const store = new Map(), handlers = {};
globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) };
globalThis.document = { addEventListener: (t, fn) => { (handlers[t] ||= []).push(fn); }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
const { fieldList } = await import('../../main/resources/static/js/pages/modules.js');
const css = readFileSync(new URL('../../main/resources/static/css/app.css', import.meta.url), 'utf8');
const src = readFileSync(new URL('../../main/resources/static/js/pages/modules.js', import.meta.url), 'utf8');

test('fieldList: field terisi tampil sebagai baris, yang kosong dihitung di data-blank dan bisa disembunyikan', () => {
  const html = fieldList([['Tel 1', '0812'], ['Tel 2', null], ['Fax', ''], ['E-Mail', 'a@b.c']]);
  assert.match(html, /Tel 1/); assert.match(html, /E-Mail/);
  assert.match(html, /<p class="md-blank" data-blank="2">Belum diisi: Tel 2, Fax<\/p>/);
  assert.equal(fieldList([['A', '1']]).includes('data-blank'), false);          // semua terisi: tidak ada catatan
  assert.match(fieldList([['A', null], ['B', null]]), /data-blank="2"/);          // semua kosong
  assert.match(css, /\.md-pane\.hide-empty-fields \[data-blank\] \{ display: none; \}/);
});
test('listDetail: catatan "N field kosong disembunyikan" + toggle "Tampilkan field kosong", daftar kiri tidak berubah', () => {
  assert.match(src, /field kosong \$\{shown \? "ditampilkan" : "disembunyikan"\}/);
  assert.match(src, /Tampilkan field kosong/);
  assert.match(src, /prefId: "bp"/);                                   // Customer dan Vendor berbagi satu toggle
  assert.match(src, /const items = rows\.map\(\(r, i\) => `<button type="button" class="md-item/); // daftar kiri tetap
});
test('toggle field kosong tersimpan per browser (fields:<id>)', () => {
  const change = handlers.change.at(-1);
  change({ target: { closest: () => ({ dataset: { emptyFields: 'fields:item-v' }, checked: true }) } });
  assert.equal(store.get('show-empty:fields:item-v'), '1');
  change({ target: { closest: () => ({ dataset: { emptyFields: 'fields:item-v' }, checked: false }) } });
  assert.equal(store.get('show-empty:fields:item-v'), '0');
});
