// Daftar Item (Master Data > 3.2 Item) dipaging (default 10, pilihan 10/25/50/100/Semua) hanya untuk company dengan aturan "item-paging" (WBI). CV tidak berubah.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
{ const store = new Map(); globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)) };
  globalThis.document = { addEventListener() {}, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] }; }
const S = '../../main/resources/static/';
const { company } = await import(S + 'js/company.js');
const { pageWindow, pageSlice } = await import(S + 'js/paging.js');
const { PAGES } = await import(S + 'js/pages/modules.js');
const cfg = JSON.parse(readFileSync(new URL('../../main/resources/company/wbi.json', import.meta.url), 'utf8'));
const src = readFileSync(new URL(S + 'js/pages/modules.js', import.meta.url), 'utf8');

test('pageWindow: 2.352 item @50 = 48 halaman; halaman terakhir 2.351-2.352; halaman di luar rentang dijepit', () => {
  const rows = Array.from({ length: 2352 }, (_, i) => i);
  const p1 = pageWindow(rows, 1, 50);
  assert.deepEqual([p1.pages, p1.from, p1.to, p1.rows.length], [48, 1, 50, 50]);
  const last = pageWindow(rows, 48, 50);
  assert.deepEqual([last.from, last.to, last.rows.length], [2351, 2352, 2]);
  assert.equal(pageWindow(rows, 99, 50).page, 48);
  assert.equal(pageWindow(rows, 0, 50).page, 1);
  const none = pageWindow([], 3, 50);
  assert.deepEqual([none.pages, none.page, none.from, none.to], [1, 1, 0, 0]);
  assert.equal(pageSlice(rows, 1, 50).rows.length, 50);          // pager tabel lama tidak berubah
  assert.equal(pageSlice(rows, 1, 33).size, 25);                 // whitelist tabel lama tetap
});
test('config WBI punya aturan item-paging', () => { assert.ok(cfg.rules.includes('item-paging')); });

const items = Array.from({ length: 120 }, (_, i) => ({ 'Item No.': 'I' + i, Description: 'Item ' + i, 'Item Group': 'G', Status: 'Active', 'Inventory Item': 'Y' }));
const render = () => PAGES.items.render({ items: { columns: ['Item No.', 'Description', 'Item Group', 'Status', 'Inventory Item'], rows: items.map(i => ['Item No.', 'Description', 'Item Group', 'Status', 'Inventory Item'].map(c => i[c])), udf: [] } });
test('WBI: daftar item punya pager; CV tidak', () => {
  company.rules = cfg.rules;
  assert.match(render(), /<nav class="md-pager"[^>]*aria-label="Halaman daftar item"/);
  assert.match(render(), /md-pager-bottom/);   // pager kedua di bawah daftar, satu kolom sticky dengan daftar
  company.rules = [];
  assert.ok(!render().includes('md-pager'));
});
test('listDetail: ukuran halaman satu konstanta, Export Excel tetap memuat semua item, reset ke halaman 1 saat filter berubah', () => {
  assert.match(src, /const ITEM_PAGE_SIZE = 10, ITEM_PAGE_SIZES = \[10, 25, 50, 100, 0\];/);
  assert.match(src, /data-psize/);                                              // dropdown 'Tampilkan' di pager bawah
  assert.match(src, /exportButton\(autoCols\(d\.items\), items, "Item"/);        // semua item, bukan halaman aktif
  assert.match(src, /pageWindow\(hit, keep === true \? page : 1, size\)/);       // hanya tombol halaman yang menjaga page
  assert.match(src, /q\.oninput = \(\) => apply\(\);/);                          // cari/filter -> apply() tanpa keep = halaman 1
});
