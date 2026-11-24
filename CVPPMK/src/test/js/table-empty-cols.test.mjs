// Kolom yang kosong di SEMUA baris disembunyikan (layar + Excel milik tabel), bisa dinyalakan lagi lewat toggle per tabel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { blankHtml, emptyColumnKeys, colPrefKey } from '../../main/resources/static/js/table-cols.js';

// ---- logika murni
test('blankHtml: hanya penanda belum diisi, tag kosong, spasi', () => {
  assert.equal(blankHtml('<span class="empty">belum diisi</span>'), true);
  assert.equal(blankHtml(''), true);
  assert.equal(blankHtml(null), true);
  assert.equal(blankHtml('  <span class="x"> &nbsp; </span>'), true);
  assert.equal(blankHtml('0'), false);
  assert.equal(blankHtml('<span class="badge">Tidak</span>'), false);
  assert.equal(blankHtml('<span class="empty">belum diisi</span> A'), false);
});
test('emptyColumnKeys: kosong semua disembunyikan, terisi sebagian tetap, kolom pertama dan keep tidak pernah', () => {
  const cols = [{ key: 'Code' }, { key: 'Name' }, { key: 'Phone' }, { key: 'Tax' }, { key: 'Cat' }];
  const rows = [{ Code: 'A', Name: 'x', Phone: null, Tax: '', Cat: null }, { Code: 'B', Name: null, Phone: null, Tax: null, Cat: '7' }];
  const cell = (c, r) => r[c.key] === null || r[c.key] === '' ? '<span class="empty">belum diisi</span>' : String(r[c.key]);
  assert.deepEqual(emptyColumnKeys(cols, rows, cell), ['Phone', 'Tax']);
  assert.deepEqual(emptyColumnKeys(cols, rows, cell, ['Tax']), ['Phone']);
  const allBlankFirst = [{ Code: null, Name: null, Phone: null, Tax: null, Cat: null }];
  assert.deepEqual(emptyColumnKeys(cols, allBlankFirst, cell), ['Name', 'Phone', 'Tax', 'Cat']);
  assert.deepEqual(emptyColumnKeys(cols, [], cell), []);
});
test('emptyColumnKeys: memakai HTML sel (fmt), nol dan label tetap dihitung terisi', () => {
  const cols = [{ key: 'Code' }, { key: 'N', fmt: v => (v === null ? '<span class="empty">belum diisi</span>' : String(v)) }, { key: 'Flag', fmt: v => `<span class="badge">${v === 'Y' ? 'Ya' : 'Tidak'}</span>` }];
  const rows = [{ Code: 'A', N: 0, Flag: null }, { Code: 'B', N: null, Flag: 'N' }];
  const cell = (c, r) => c.fmt ? c.fmt(r[c.key], r) : String(r[c.key]);
  assert.deepEqual(emptyColumnKeys(cols, rows, cell), []);
});
test('colPrefKey: id tabel dipakai bila ada, kalau tidak stabil dari daftar kolom', () => {
  assert.equal(colPrefKey([{ key: 'a' }], 'ad-udt'), 'ad-udt');
  assert.equal(colPrefKey([{ key: 'a' }, { key: 'b' }]), colPrefKey([{ key: 'a' }, { key: 'b' }]));
  assert.notEqual(colPrefKey([{ key: 'a' }, { key: 'b' }]), colPrefKey([{ key: 'a' }, { key: 'c' }]));
});

// ---- tabel (HTML), toggle tersimpan, ekspor
const store = new Map(), handlers = {};
globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) };
globalThis.document = { addEventListener: (t, fn) => { (handlers[t] ||= []).push(fn); }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
const UI = await import('../../main/resources/static/js/ui.js');
const cols = [{ key: 'Code', label: 'Kode' }, { key: 'Name', label: 'Nama' }, { key: 'Npwp', label: 'NPWP' }, { key: 'Phone', label: 'Telepon' }, { key: 'Qty', label: 'Jumlah', num: 1 }];
const rows = [{ Code: 'W1', Name: 'Gudang 1', Npwp: null, Phone: null, Qty: '3' }, { Code: 'W2', Name: null, Npwp: '', Phone: '0812', Qty: '0' }];
const th = html => [...html.matchAll(/<th([^>]*)>([^<]*)<\/th>/g)].map(m => [m[2], /col-empty/.test(m[1])]);

test('table: kolom kosong semua diberi col-empty + catatan jumlah + toggle; kolom terisi sebagian tetap tampil', () => {
  store.clear();
  const html = UI.table(cols, rows, { xid: 'wh-t' });
  assert.deepEqual(th(html), [['Kode', false], ['Nama', false], ['NPWP', true], ['Telepon', false], ['Jumlah', false]]);
  assert.match(html, /1 kolom kosong disembunyikan/);
  assert.match(html, /data-empty-cols="wh-t"/);
  assert.match(html, /class="table-wrap hide-empty-cols"[^>]*data-colpref="wh-t"/);
  assert.match(html, /<td class="col-empty"><span class="empty">belum diisi<\/span><\/td>/);
});
test('table: kolom yang dipakai aturan temuan (keep) tetap tampil walau kosong semua', () => {
  store.clear();
  const html = UI.table(cols, rows, { xid: 'wh-k', keep: ['Npwp'] });
  assert.deepEqual(th(html).filter(([, h]) => h), []);
  assert.doesNotMatch(html, /kolom kosong disembunyikan/);
});
test('table: kolom pertama tidak pernah disembunyikan; tanpa baris tidak ada yang disembunyikan', () => {
  store.clear();
  assert.equal(th(UI.table(cols, [{ Code: null, Name: null, Npwp: null, Phone: null, Qty: null }], { xid: 'a' }))[0][1], false);
  assert.doesNotMatch(UI.table(cols, [], { xid: 'b' }), /kolom kosong disembunyikan/);
});
test('toggle: tersimpan per browser per tabel, render ulang dan ekspor ikut', () => {
  store.clear();
  const html = UI.table(cols, rows, { xid: 'wh-e' });
  const x = UI.exportOf('wh-e');
  assert.deepEqual(UI.exportColsOf(x).map(c => c.key), ['Code', 'Name', 'Phone', 'Qty']); // Excel tanpa kolom kosong
  assert.deepEqual(UI.exportRows(UI.exportColsOf(x), [])[0], ['Kode', 'Nama', 'Telepon', 'Jumlah']);
  const change = handlers.change[0];
  change({ target: { closest: () => ({ dataset: { emptyCols: 'wh-e' }, checked: true }) } });
  assert.equal(store.get('show-empty:cols:wh-e'), '1');
  const again = UI.table(cols, rows, { xid: 'wh-e' });
  assert.match(again, /data-empty-cols="wh-e" checked/);
  assert.doesNotMatch(again, /hide-empty-cols/);
  assert.deepEqual(UI.exportColsOf(UI.exportOf('wh-e')).map(c => c.key), ['Code', 'Name', 'Npwp', 'Phone', 'Qty']); // toggle menyala: Excel memuat semuanya
  change({ target: { closest: () => ({ dataset: { emptyCols: 'wh-e' }, checked: false }) } });
  assert.equal(store.get('show-empty:cols:wh-e'), '0');
  assert.ok(html.includes('hide-empty-cols'));
});
test('tabel berhalaman: kolom kosong ditentukan dari seluruh data, bukan halaman aktif', () => {
  store.clear();
  const many = Array.from({ length: 40 }, (_, i) => ({ Code: 'C' + i, Name: 'n' + i, Npwp: null, Phone: i === 39 ? '08' : null, Qty: '1' }));
  const html = UI.table(cols, many, { xid: 'pg-t' });
  assert.match(html, /id="pg\d+"/);
  assert.deepEqual(UI.exportColsOf(UI.exportOf('pg-t')).map(c => c.key), ['Code', 'Name', 'Phone', 'Qty']);
  assert.equal(UI.exportOf('pg-t').rows.length, 40);
});
const newest = () => { const ids = [...Array(300).keys()].map(i => 'x' + (i + 1)).filter(k => UI.exportOf(k)); return UI.exportOf(ids.at(-1)); };
test('export lepas: kolom kosong di semua baris tidak ikut Excel, toggle halaman menyalakan kembali (Item)', () => {
  store.clear();
  UI.exportButton(cols, rows, 'Item', { prefKey: 'fields:item-v' });
  const x = newest();
  assert.equal(x.cols, cols);
  assert.deepEqual(UI.exportColsOf(x).map(c => c.key), ['Code', 'Name', 'Phone', 'Qty']);
  assert.deepEqual(UI.exportRows(UI.exportColsOf(x), [])[0], ['Kode', 'Nama', 'Telepon', 'Jumlah']);
  store.set('show-empty:fields:item-v', '1');                      // toggle 'Tampilkan field kosong' menyala
  assert.deepEqual(UI.exportColsOf(x).map(c => c.key), cols.map(c => c.key));
});
test('export lepas tanpa kunci toggle tetap lengkap (tidak ada jalan menyalakan kembali)', () => {
  store.clear();
  UI.exportButton(cols, rows, 'Lain');
  assert.deepEqual(UI.exportColsOf(newest()).map(c => c.key), cols.map(c => c.key));
});
test('exportSheets: tiap sheet menghitung kolom kosongnya sendiri; kolom pertama dan keep tetap; toggle menyalakan semua', () => {
  store.clear();
  const sheetA = { name: 'General', cols, rows };
  const sheetB = { name: 'Alamat', cols: [{ key: 'Code', label: 'Kode' }, { key: 'Street', label: 'Jalan' }, { key: 'Zip', label: 'Pos' }], rows: [{ Code: 'A', Street: 'x', Zip: null }] };
  UI.exportSheets([sheetA, sheetB], 'BP Master Data', { prefKey: 'fields:bp' });
  let x = newest();
  assert.deepEqual(UI.exportSheetCols(x, sheetA).map(c => c.key), ['Code', 'Name', 'Phone', 'Qty']);
  assert.deepEqual(UI.exportSheetCols(x, sheetB).map(c => c.key), ['Code', 'Street']);
  UI.exportSheets([sheetA], 'BP', { prefKey: 'fields:bp', keep: ['Npwp'] });
  x = newest();
  assert.deepEqual(UI.exportSheetCols(x, sheetA).map(c => c.key), ['Code', 'Name', 'Npwp', 'Phone', 'Qty']);
  store.set('show-empty:fields:bp', '1');
  assert.deepEqual(UI.exportSheetCols(x, sheetB).map(c => c.key), ['Code', 'Street', 'Zip']);
});
test('export tabel Users/Addon memakai kunci toggle tabelnya (cols:users, cols:ad-<kode>)', () => {
  const g = readFileSync(new URL('../../main/resources/static/js/pages/general.js', import.meta.url), 'utf8');
  const a = readFileSync(new URL('../../main/resources/static/js/pages/addon.js', import.meta.url), 'utf8');
  assert.match(g, /prefKey: "cols:users"/); assert.match(g, /prefId: "users"/);
  assert.ok(a.includes("exportSheets(sheets, objTitle(o), { prefKey:")); assert.ok(a.includes("cols:ad-"));
});
