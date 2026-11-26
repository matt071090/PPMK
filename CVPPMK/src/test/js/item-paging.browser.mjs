// Verifikasi browser paging Daftar Item di app yang sudah jalan (read-only, tanpa kredensial di skrip ini).
//   PLAYWRIGHT_MODULE=C:/nvm4w/nodejs/node_modules/n8n/node_modules/playwright-core/index.js CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe" \
//   APP_URL=http://localhost:8091/wbi/ SHOT_DIR=D:/STEM/WBI-build/bukti-paging node src/test/js/item-paging.browser.mjs
import { pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const pw = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE || 'C:/nvm4w/nodejs/node_modules/n8n/node_modules/playwright-core/index.js').href);
const chromium = pw.chromium || pw.default.chromium;
const APP = process.env.APP_URL || 'http://localhost:8091/wbi/', SHOTS = process.env.SHOT_DIR || 'C:/tmp/ss-paging';
await mkdir(SHOTS, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1050 } });
await page.goto(APP + 'index.html#/items');
await page.locator('#item-v .md-item').first().waitFor({ timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#article .skeleton'));
await page.waitForTimeout(800);
const box = page.locator('#item-v');
const visible = () => box.locator('.md-item:not([hidden])').count();
const count = () => box.locator('.md-count').innerText();
const pager = () => box.locator('.md-pager').first().innerText();
const total = await box.locator('.md-item').count();
const shot = async n => { await box.scrollIntoViewIfNeeded(); await page.evaluate(() => document.querySelector('#item-v').scrollIntoView()); await page.screenshot({ path: `${SHOTS}/${n}.png` }); };
const out = {};
out.total = total; out.p1Visible = await visible(); out.p1Count = await count(); out.p1Pager = (await pager()).replace(/\s+/g, ' ');
assert.equal(out.p1Visible, 10);   // default 10 per halaman
const firstName = await box.locator('.md-item:not([hidden]) .md-name').first().innerText();
await shot('1-default-10');
await box.locator('[data-pg="1"]').first().click();
out.p2Visible = await visible(); out.p2Pager = (await pager()).replace(/\s+/g, ' ');
out.selectedStillShown = await box.locator('.md-pane h3').first().innerText();   // detail item terpilih (dari halaman 1) tetap
assert.equal(out.selectedStillShown.trim(), firstName.trim());
assert.notEqual(await box.locator('.md-item:not([hidden]) .md-name').first().innerText(), firstName);
await shot('2-halaman-2');
await box.locator('select[data-psize]').selectOption('25');
out.size25 = [await visible(), (await pager()).replace(/\s+/g, ' ')]; assert.equal(out.size25[0], 25); assert.match(out.size25[1], /Halaman 1 dari/);
await shot('5-pilih-25');
await box.locator('select[data-psize]').selectOption('0');
out.sizeAll = [await visible(), await box.locator('.md-pager-bottom').innerText()]; assert.equal(out.sizeAll[0], 2352);
await page.evaluate(() => { document.querySelector('#item-v .md-list').scrollTop = 99999; });
await shot('6-pilih-semua');
await box.locator('select[data-psize]').selectOption('10');
assert.equal(await visible(), 10);
await box.locator('[data-pg="1"]').first().click();
await box.locator('[data-pg="-1"]').first().click();
assert.match(await pager(), /Halaman 1 dari/);
// cari -> halaman 1, hitungan benar
await box.locator('[data-pg="1"]').first().click();
await box.locator('input[type=search]').fill('a');
out.afterSearchPager = (await pager()).replace(/\s+/g, ' '); out.afterSearchCount = await count();
assert.match(out.afterSearchPager, /Halaman 1 dari/);
await box.locator('input[type=search]').fill('');
await box.locator('input[type=search]').fill(firstName.slice(0, 6));
out.nameSearchCount = await count(); out.nameSearchVisible = await visible();
await shot('3-setelah-cari');
await box.locator('input[type=search]').fill('zzzz-tidak-ada');
out.noMatchCount = await count(); out.noMatchPane = await box.locator('.md-pane').innerText();
await box.locator('input[type=search]').fill('');
// chip non-inventory + sembunyikan inactive
await box.locator('.chip', { hasText: 'Inventory item' }).first().click();
out.chipInvCount = await count(); out.chipInvPager = (await pager()).replace(/\s+/g, ' ');
await box.locator('[data-chk="0"]').check();
out.inactiveHiddenCount = await count();
out.exportBtn = await page.locator('#article .xbtn').first().innerText();
// halaman di-scroll ke tengah daftar: kedua pager harus terlihat di viewport
await box.locator('input[type=search]').fill(''); await box.locator('[data-chk="0"]').uncheck();
await page.evaluate(() => { const l = document.querySelector('#item-v .md-left'); window.scrollBy(0, l.getBoundingClientRect().top - 114); document.querySelector('#item-v .md-list').scrollTop = 1200; });
await page.waitForTimeout(400);
out.pagersInViewport = await page.evaluate(() => [...document.querySelectorAll('#item-v .md-pager')].map(n => { const r = n.getBoundingClientRect(), top = document.elementFromPoint(r.left + 20, r.top + r.height / 2); return r.top >= 0 && r.bottom <= innerHeight && n.contains(top); }));
assert.deepEqual(out.pagersInViewport, [true, true]);
await page.screenshot({ path: `${SHOTS}/4-scroll-tengah-pager-terlihat-1920.png` });
console.log(JSON.stringify(out, null, 1));
await browser.close();
