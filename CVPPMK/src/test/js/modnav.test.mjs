import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { companyTitle } from '../../main/resources/static/js/company.js';
let JSDOM;
try { ({ JSDOM } = await import(pathToFileURL(process.env.JSDOM_PATH || 'C:/tmp/pd-test-nm/node_modules/jsdom/lib/api.js').href)); } catch {}
const dir = new URL('../../main/resources/static/', import.meta.url);
const script = readFileSync(new URL('js/modnav.js', dir), 'utf8');
const pages = ['index', 'home', 'schedule', 'setup', 'countdoc', 'countdoc-query', 'rpt', 'hana'];
for (const page of pages) test(`${page}: shared module menu always exposes working Schedule URL`, { skip: !JSDOM && 'jsdom tidak tersedia' }, async () => {
  const html = readFileSync(new URL(`${page}.html`, dir), 'utf8');
  assert.equal((html.match(/src="js\/modnav.js"/g) || []).length, 1);
  assert.doesNotMatch(html.match(/<title>(.*?)<\/title>/s)[1], /CVPPMK/);
  assert.doesNotMatch(html, /document\.title\s*=.*CVPPMK/);
  const dom = new JSDOM(html, { url: `http://localhost/wbi/${page}.html`, runScripts: 'outside-only' });
  dom.window.fetch = async () => ({ ok: true, json: async () => ({ unlocked: false, dev: false, configured: true }) });
  dom.window.eval(script);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  await new Promise(resolve => setImmediate(resolve));
  const nav = dom.window.document.querySelector('.modnav');
  assert.ok(nav);
  const schedule = [...nav.querySelectorAll('a')].find(a => a.textContent === 'Schedule');
  assert.equal(schedule.href, 'http://localhost/wbi/schedule.html');
  assert.ok(nav.textContent.includes('Home') && nav.textContent.includes('Project Check List'));
  assert.equal(dom.window.document.querySelectorAll('.modnav').length, 1);
  dom.window.close();
});
test('tab title uses configured company name once, while identity is unavailable it stays neutral', () => {
  assert.equal(companyTitle('Schedule', 'PT Warung Begok Indonesia'), 'Schedule · PT Warung Begok Indonesia');
  assert.equal(companyTitle('Schedule · PT Warung Begok Indonesia', 'PT Warung Begok Indonesia'), 'Schedule · PT Warung Begok Indonesia');
  assert.equal(companyTitle('Setup & Cut Off', 'No company'), 'Setup & Cut Off');
});
