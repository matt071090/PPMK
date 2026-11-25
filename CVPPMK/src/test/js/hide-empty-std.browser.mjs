// Verifikasi browser (fixture lokal, tanpa SAP/kredensial): halaman/blok SAP standar 0 baris disembunyikan di WBI, CV identik dengan sebelumnya.
// Pakai Playwright + Chrome yang sudah ada; tidak memasang paket apa pun.
//   PLAYWRIGHT_MODULE=C:/nvm4w/nodejs/node_modules/n8n/node_modules/playwright-core CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" \
//   BASELINE_STATIC=<folder static dari commit sebelum perubahan> SHOT_DIR=C:/tmp/ss-hide0 node src/test/js/hide-empty-std.browser.mjs
// BASELINE_STATIC diisi lewat: git archive 0a6d499 CVPPMK/src/main/resources/static | tar -x -C <dir>
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const pw = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || 'C:/nvm4w/nodejs/node_modules/n8n/node_modules/playwright-core/index.js').href);
const chromium = pw.chromium || pw.default.chromium;
const SERVER = fileURLToPath(new URL('./preview-server.mjs', import.meta.url));
const BASE = process.env.BASELINE_STATIC; assert.ok(BASE, 'BASELINE_STATIC wajib diisi');
const SHOTS = process.env.SHOT_DIR || 'C:/tmp/ss-hide0';
await mkdir(SHOTS, { recursive: true });
const procs = [];
const start = (port, env) => new Promise((res, rej) => {
  const p = spawn(process.execPath, [SERVER], { env: { ...process.env, PREVIEW_PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  procs.push(p); p.stdout.on('data', d => String(d).includes('Preview fixtures') && res()); p.on('error', rej);
});
const S = { // port -> keterangan
  new_wbi_empty: [18701, { PREVIEW_COMPANY: 'wbi', PREVIEW_STD: 'empty' }],
  old_wbi_empty: [18702, { PREVIEW_COMPANY: 'wbi', PREVIEW_STD: 'empty', PREVIEW_STATIC_ROOT: BASE }],
  new_cv_empty: [18703, { PREVIEW_COMPANY: 'cv', PREVIEW_STD: 'empty' }],
  old_cv_empty: [18704, { PREVIEW_COMPANY: 'cv', PREVIEW_STD: 'empty', PREVIEW_STATIC_ROOT: BASE }],
  new_wbi_data: [18705, { PREVIEW_COMPANY: 'wbi', PREVIEW_STD: 'data' }],
  new_wbi_error: [18706, { PREVIEW_COMPANY: 'wbi', PREVIEW_STD: 'error' }],
  new_cv_data: [18707, { PREVIEW_COMPANY: 'cv', PREVIEW_STD: 'data' }],
  old_cv_data: [18708, { PREVIEW_COMPANY: 'cv', PREVIEW_STD: 'data', PREVIEW_STATIC_ROOT: BASE }],
  new_wbi_branch: [18709, { PREVIEW_COMPANY: 'wbi', PREVIEW_STD: 'empty', PREVIEW_BRANCH_MODE: 'Y' }],
};
await Promise.all(Object.values(S).map(([port, env]) => start(port, env)));
const url = (k, path) => `http://127.0.0.1:${S[k][0]}/${path}`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const results = [], errors = [];
const ok = (name, fn) => { fn(); results.push(name); };
const newPage = async (w = 1440, h = 1000) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message)); return { ctx, page };
};
const open = async (page, k, hash) => { await page.goto(url(k, `index.html${hash}`)); await page.locator('#nav .nav-group, #nav .progress-box').first().waitFor(); await page.waitForFunction(() => !document.querySelector('#article .skeleton')); await page.waitForTimeout(600); };
const navIds = page => page.locator('#nav a[data-id]').evaluateAll(a => a.map(x => x.dataset.id));
const nav = async (page) => (await page.locator('#nav').innerText());
const text = page => page.locator('#article').innerText();
const rv = page => page.locator('#rv-count').innerText();
try {
  // ---------- WBI, semua 0 baris
  const { page } = await newPage();
  await open(page, 'old_wbi_empty', '#/ringkasan');
  const beforeIds = await navIds(page), beforeRv = await rv(page), beforeSum = await text(page);
  assert.ok(beforeIds.includes('payment-methods'), 'baseline: Payment Methods masih ada');
  assert.match(beforeSum, /Belum ada payment method/); assert.match(beforeSum, /Belum ada shipping type/);
  await open(page, 'new_wbi_empty', '#/ringkasan');
  const ids = await navIds(page), sum = await text(page), rvNew = await rv(page), sb = await nav(page);
  ok('sidebar: Payment Methods, Freight, Landed Cost hilang saat 0 baris', () => { for (const id of ['payment-methods', 'freight', 'landed-cost']) assert.ok(!ids.includes(id), id); });
  ok('sidebar: halaman inti 0 baris tetap tampil (Payment Terms, Item Group)', () => { for (const id of ['payment-terms', 'item-groups', 'coa', 'business-partners', 'fixed-asset', 'warehouses']) assert.ok(ids.includes(id), id); });
  ok('sidebar: hitungan terpisah "3 menu SAP standar kosong disembunyikan" + toggle', () => { assert.match(sb, /Tampilkan menu SAP standar kosong/); assert.match(sb, /Tampilkan menu Add-on kosong/); assert.match(sb, /3 menu SAP standar kosong disembunyikan/); });
  const den = s => +s.split('/')[1];
  ok('Menu sudah sesuai: penyebut berkurang 3 (menu tersembunyi tidak dihitung)', () => assert.equal(den(rvNew), den(beforeRv) - 3, `${beforeRv} -> ${rvNew}`));
  ok('Ringkasan: INFO "belum ada" untuk halaman/blok tersembunyi hilang, tidak ada tautan ke halaman tersembunyi', () => {
    assert.doesNotMatch(sum, /Belum ada payment method/); assert.doesNotMatch(sum, /Belum ada shipping type/); assert.doesNotMatch(sum, /Buka Payment Methods/);
  });
  assert.equal(await page.locator('#article a[href="#/payment-methods"], #article a[href="#/freight"], #article a[href="#/landed-cost"]').count(), 0);
  await page.goto(url('new_wbi_empty', 'index.html#/payment-methods')); await page.waitForTimeout(400);
  ok('tautan langsung ke halaman tersembunyi jatuh ke Ringkasan (tidak error)', async () => { });
  assert.match(await page.locator('#article h1').innerText(), /Ringkasan/);

  // ---------- Business Partner
  await open(page, 'old_wbi_empty', '#/business-partners');
  const bpBefore = await text(page); assert.match(bpBefore, /Shipping Type/);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${SHOTS}/before-bp-1440.png`, fullPage: true });
  await open(page, 'new_wbi_empty', '#/business-partners');
  let bp = await text(page);
  ok('BP: blok Shipping Type tidak dirender, tabel kosong dan INFO hilang', async () => { });
  assert.doesNotMatch(bp, /Shipping Type\s*#/); assert.equal(await page.locator('#article h2#shipping').count(), 0); assert.doesNotMatch(bp, /Belum ada shipping type/);
  assert.match(bp, /4 blok kosong disembunyikan: Shipping Type, Excel Bank Accounts, Excel Payment Run, Excel Branch Assignment/);
  assert.match(await page.locator('#article button[data-export]').first().innerText(), /Excel \(7 sheet\)/);
  assert.equal(await page.locator('#article .md-pane').first().innerText().then(t => /Payment Run/.test(t)), false);
  await page.screenshot({ path: `${SHOTS}/after-bp-1440.png`, fullPage: true });
  // toggle di catatan halaman: tampil lagi, tersimpan per browser
  await page.locator('#article [data-std-toggle]').check(); await page.waitForLoadState(); await page.locator('#article h2#shipping').waitFor();
  bp = await text(page);
  ok('BP: toggle menampilkan lagi blok + INFO, sheet kembali 10, catatan "ditampilkan"', () => { assert.match(bp, /Belum ada shipping type/); assert.match(bp, /4 blok kosong ditampilkan/); });
  assert.match(await page.locator('#article button[data-export]').first().innerText(), /Excel \(10 sheet\)/);
  assert.ok((await navIds(page)).includes('payment-methods'), 'toggle menampilkan menu kosong di sidebar');
  assert.equal(await page.locator('#std-show-empty').isChecked(), true);
  assert.match(await nav(page), /3 menu SAP standar kosong ditampilkan/);
  const shownRv = await rv(page);
  ok('menu kosong yang ditampilkan lewat toggle tetap tidak dihitung di "Menu sudah sesuai"', () => assert.equal(shownRv, rvNew));
  await page.screenshot({ path: `${SHOTS}/after-bp-toggle-on-1440.png`, fullPage: true });
  await open(page, 'new_wbi_empty', '#/payment-methods');
  assert.match(await page.locator('#article h1').innerText(), /Payment Methods/);
  await page.setViewportSize({ width: 1440, height: 2000 }); await page.locator('aside.sidebar').screenshot({ path: `${SHOTS}/after-sidebar-toggle-on-1440.png` });
  await page.locator('#std-show-empty').uncheck(); await page.waitForLoadState(); await page.locator('#nav').waitFor();
  assert.ok(!(await navIds(page)).includes('payment-methods'), 'toggle dimatikan: hilang lagi');

  // ---------- Fixed Asset
  await open(page, 'new_wbi_empty', '#/fixed-asset');
  const fa = await text(page), faTitles = await page.locator('#article details.grp summary b').allInnerTexts();
  assert.ok(faTitles.includes('Asset Class') && faTitles.length >= 5, faTitles.join('|'));
  ok('Fixed Asset: Project, SP Notif, Location, Distribution Rule, master aset 0 baris disembunyikan; bagian inti tetap', () => {
    assert.match(fa, /5 blok kosong disembunyikan/);
    assert.deepEqual(faTitles.filter(x => ['Project', 'SP yang memblok Capitalization', 'Location', 'Cost Center (Distribution Rule)'].includes(x)), []);
    assert.equal(0, 0);
    assert.match(fa, /Asset Class/); assert.match(fa, /Numbering Series Capitalization/);
  });
  assert.equal(await page.locator('#article h2#assets').count(), 0);
  await page.screenshot({ path: `${SHOTS}/after-fixed-asset-1440.png`, fullPage: true });
  await open(page, 'old_wbi_empty', '#/fixed-asset'); assert.match(await text(page), /SP yang memblok Capitalization/);
  await page.screenshot({ path: `${SHOTS}/before-fixed-asset-1440.png`, fullPage: true });

  // ---------- WBI dengan branch: sheet Branch Assignment tetap
  await open(page, 'new_wbi_branch', '#/business-partners');
  ok('WBI dengan branch: sheet Branch Assignment 0 baris tetap ada (kosongnya masalah)', async () => { });
  assert.match(await page.locator('#article button[data-export]').first().innerText(), /Excel \(8 sheet\)/);
  assert.match(await text(page), /3 blok kosong disembunyikan/);

  // ---------- WBI ada data
  await open(page, 'new_wbi_data', '#/business-partners');
  const dIds = await navIds(page);
  ok('data ada: menu dan blok tampil, tanpa catatan dan tanpa toggle sidebar', () => { for (const id of ['payment-methods', 'freight', 'landed-cost']) assert.ok(dIds.includes(id), id); });
  assert.equal(await page.locator('#std-show-empty').count(), 0); assert.equal(await page.locator('#article [data-std-toggle]').count(), 0);
  assert.equal(await page.locator('#article h2#shipping').count(), 1);
  assert.match(await page.locator('#article button[data-export]').first().innerText(), /Excel \(10 sheet\)/);
  await open(page, 'new_wbi_data', '#/fixed-asset'); assert.equal(await page.locator('#article [data-std-toggle]').count(), 0); assert.equal(await page.locator('#article h2#assets').count(), 1);
  assert.match(await text(page), /SP yang memblok Capitalization/);

  // ---------- WBI query galat
  await open(page, 'new_wbi_error', '#/ringkasan');
  const eIds = await navIds(page);
  ok('galat muat: menu tidak disembunyikan', () => { for (const id of ['payment-methods', 'freight', 'landed-cost']) assert.ok(eIds.includes(id), id); });
  await open(page, 'new_wbi_error', '#/payment-methods'); assert.match(await text(page), /Query gagal/); assert.match(await text(page), /galat demo/);
  await open(page, 'new_wbi_error', '#/business-partners'); assert.equal(await page.locator('#article h2#shipping').count(), 1); assert.match(await text(page), /Query gagal/);
  await open(page, 'new_wbi_error', '#/fixed-asset'); assert.match(await text(page), /OPRJ|Project/); assert.equal(await page.locator('#article [data-std-toggle]').count(), 0);

  // ---------- CV: sidebar dan halaman identik dengan sebelumnya
  const cmp = async (mode, routes) => {
    const a = await newPage(), b = await newPage(); let n = 0;
    for (const r of routes) {
      await open(a.page, `old_cv_${mode}`, r); await open(b.page, `new_cv_${mode}`, r);
      const [na, nb] = [await a.page.locator('#nav').innerHTML(), await b.page.locator('#nav').innerHTML()];
      assert.equal(nb, na, `CV ${mode} sidebar ${r}`);
      const [aa, ab] = [await a.page.locator('#article').innerHTML(), await b.page.locator('#article').innerHTML()];
      assert.equal(ab, aa, `CV ${mode} halaman ${r}`);
      const [ma, mb] = [await a.page.locator('#toc-list').innerHTML(), await b.page.locator('#toc-list').innerHTML()];
      assert.equal(mb, ma, `CV ${mode} daftar isi ${r}`); n++;
    }
    await a.ctx.close(); await b.ctx.close(); return n;
  };
  const routes = ['#/ringkasan', '#/payment-methods', '#/freight', '#/landed-cost', '#/business-partners', '#/fixed-asset', '#/payment-terms', '#/item-groups', '#/warehouses', '#/coa'];
  const nEmpty = await cmp('empty', routes), nData = await cmp('data', routes);
  ok(`CV: sidebar + halaman + daftar isi identik byte-per-byte (${nEmpty} rute data kosong, ${nData} rute data berisi)`, () => { });
  assert.equal(await page.locator('#std-show-empty').count(), 0);

  // ---------- screenshot sebelum/sesudah: sidebar (desktop + HP) dan Business Partner HP
  for (const [dev, w, h] of [['1440', 1440, 2300], ['390', 390, 2300]]) {
    for (const [phase, k] of [['before', 'old_wbi_empty'], ['after', 'new_wbi_empty']]) {
      await page.setViewportSize({ width: w, height: h });
      await open(page, k, '#/business-partners');
      if (w < 800) { await page.locator('#menu-btn').click(); await page.waitForTimeout(350); }
      await page.locator('aside.sidebar').screenshot({ path: `${SHOTS}/${phase}-sidebar-${dev}.png` });
      if (w < 800) await page.keyboard.press('Escape');
    }
  }
  for (const [phase, k] of [['before', 'old_wbi_empty'], ['after', 'new_wbi_empty']]) {
    await page.setViewportSize({ width: 390, height: 900 }); await open(page, k, '#/business-partners');
    await page.screenshot({ path: `${SHOTS}/${phase}-bp-390.png`, fullPage: true });
  }
  assert.deepEqual(errors, [], 'tidak ada galat JS di halaman');
  console.log(JSON.stringify({ lulus: results.length, pemeriksaan: results, errors }, null, 1));
} finally {
  await browser.close(); procs.forEach(p => p.kill());
}
