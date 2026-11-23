import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REVIEW_MAP, reviewState, resolveStatus, withReview } from '../../main/resources/static/js/pages/schedule-review.js';

const sections = JSON.parse(await readFile(new URL('../../main/resources/static/sections.json', import.meta.url), 'utf8'));
const seed = JSON.parse(await readFile(new URL('../../main/resources/schedule/default.json', import.meta.url), 'utf8'));
const pageIds = new Set(sections.flatMap(c => c.pages.map(p => p.id)));

test('pemetaan: semua id item ada di data awal dan semua halaman ada di sections.json', () => {
  const itemIds = new Set(seed.items.map(i => i.id));
  for (const [item, pages] of Object.entries(REVIEW_MAP)) {
    assert.ok(itemIds.has(item), `item tidak ada: ${item}`);
    for (const p of pages) assert.ok(pageIds.has(p), `halaman tidak ada: ${p}`);
  }
});

test('reviewState: semua ok, ada nok, belum direview, gagal dimuat', () => {
  assert.equal(reviewState(['a', 'b'], { a: { status: 'ok' }, b: { status: 'ok' } }).state, 'ok');
  assert.equal(reviewState(['a', 'b'], { a: { status: 'ok' }, b: { status: 'nok' } }).state, 'nok');
  assert.equal(reviewState(['a', 'b'], { a: { status: 'ok' } }).state, 'none');
  assert.equal(reviewState(['a'], null).state, 'unknown');
  assert.equal(reviewState([], {}), null);
});

test('resolveStatus: ok -> selesai (auto), nok -> proses (auto), none/unknown -> manual', () => {
  const it = { id: 'master-A0', status: 'belum' };
  assert.deepEqual(pick(resolveStatus(it, { coa: { status: 'ok' } })), { status: 'selesai', auto: true });
  assert.deepEqual(pick(resolveStatus(it, { coa: { status: 'nok' } })), { status: 'proses', auto: true });
  assert.deepEqual(pick(resolveStatus(it, {})), { status: 'belum', auto: false });
  assert.deepEqual(pick(resolveStatus({ ...it, status: 'proses' }, null)), { status: 'proses', auto: false });
  assert.deepEqual(pick(resolveStatus({ id: 'tanpa-peta', status: 'selesai' }, { coa: { status: 'ok' } })), { status: 'selesai', auto: false });
});

test('withReview: tidak mengubah data asli, menandai item auto', () => {
  const items = [{ id: 'master-A0', status: 'belum' }, { id: 'x', status: 'belum' }];
  const out = withReview(items, { coa: { status: 'ok' } });
  assert.equal(items[0].status, 'belum');
  assert.equal(out[0].status, 'selesai'); assert.equal(out[0].auto, true);
  assert.equal(out[1], items[1]);
});

function pick(r) { return { status: r.status, auto: r.auto }; }
