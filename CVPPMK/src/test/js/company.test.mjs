import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { companyFilename, companyKey, company } from '../../main/resources/static/js/company.js';
import { withFixedPic } from '../../main/resources/static/js/pages/schedule.js';

for (const ext of ['csv','json','png','xlsx','zip']) test(`export filename ${ext}: CV unchanged; WBI named`, () => {
  assert.equal(companyFilename(`schedule.${ext}`, ''), `schedule.${ext}`);
  assert.equal(companyFilename(`schedule.${ext}`, 'wbi'), `schedule-wbi.${ext}`);
});
test('browser data keys isolated; old CV keys preserved', () => {
  company.code=''; assert.equal(companyKey('cdq-runs'),'cdq-runs');
  company.code='wbi'; assert.equal(companyKey('cdq-runs'),'wbi:cdq-runs'); assert.equal(companyKey('theme'),'theme');
  company.code='';
});
test('WBI PIC starts empty in UI as well as seed', () => {
  const items=[{id:'upload-master',pic:'',status:'belum'}];
  assert.equal(withFixedPic(items,false)[0].pic,'');
  assert.equal(withFixedPic(items)[0].pic,'STEM');
  assert.equal(items[0].pic,'');
});
test('every HTML page uses identical STEM favicon tags', () => {
  const dir=new URL('../../main/resources/static/',import.meta.url);
  const tags=page=>(page.match(/<link[^>]+rel="(?:icon|apple-touch-icon)"[^>]*>/g)||[]).join('\n');
  const expected=tags(readFileSync(new URL('setup.html',dir),'utf8'));
  assert.equal(expected.split('\n').length,3);
  for (const path of readdirSync(dir).filter(p=>p.endsWith('.html'))) assert.equal(tags(readFileSync(new URL(path,dir),'utf8')),expected,path);
});
