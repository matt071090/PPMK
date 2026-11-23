import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scheduleTabs,progress,groupProgress,timelineMilestones,nextMilestone,countdown,cardNote,withTrainingRollup,areaStatus,timelinePosition,validRange} from '../../main/resources/static/js/pages/schedule.js';
const read=name=>JSON.parse(readFileSync(new URL(`../../main/resources/schedule/${name}.json`,import.meta.url)));
const wbi=read('default-wbi'),cv=read('default');
test('WBI seed: 35 activities, no training or Farm, Retail title and both stock locations',()=>{
 assert.equal(wbi.items.length,35);assert.equal(cv.items.length,37);
 assert.doesNotMatch(JSON.stringify(wbi),/training|farm/i);
 assert.equal(wbi.items.find(i=>i.id==='master-E0').title,'Add-On Master Data (STEM, Retail, iReapBiz)');
 assert.match(wbi.items.find(i=>i.id==='opname').note,/Pabrik dan Toko/);
 assert.ok(wbi.rules.some(rule=>rule.includes('Pabrik dan Toko')));
 assert.deepEqual(Object.fromEntries(['milestone','master','balance'].map(s=>[s,wbi.items.filter(i=>i.section===s).length])),{milestone:14,master:16,balance:5});
 assert.equal(new Set(wbi.items.map(i=>i.id)).size,35);
});
test('every retained WBI date/time equals CV; CV training and Farm title remain intact',()=>{
 for(const item of wbi.items){
  const original=cv.items.find(i=>i.id===item.id);assert.ok(original,item.id);
  for(const field of Object.keys(original).filter(k=>/Date$|Time$/.test(k)))assert.equal(item[field],original[field],`${item.id}.${field}`);
  assert.ok(validRange(item.startDate,item.endDate));assert.equal(item.pic,'');assert.equal(item.status,'belum');
 }
 assert.equal(cv.items.find(i=>i.id==='training').startDate,'2026-12-14');
 assert.equal(cv.items.find(i=>i.id==='training-1').section,'training');
 assert.match(cv.items.find(i=>i.id==='master-E0').title,/Farm Aquatic/);
});
test('tabs follow document sections: four for WBI, five for CV or existing legacy document',()=>{
 assert.deepEqual(Object.keys(scheduleTabs(wbi.items)),['ringkasan','master','stock','balance']);
 assert.deepEqual(Object.keys(scheduleTabs(cv.items)),['ringkasan','master','training','stock','balance']);
 assert.equal(scheduleTabs(cv.items).training,'Training');
 assert.equal(scheduleTabs(wbi.items).training,undefined);
});
test('WBI progress, A-E groups and area summaries do not need a training section',()=>{
 assert.deepEqual(progress(wbi.items),{done:0,total:35,percent:0});
 assert.equal(withTrainingRollup(wbi.items),wbi.items);
 assert.deepEqual(groupProgress(wbi.items).map(g=>g.total),[5,4,4,2,1]);
 for(const section of ['milestone','master','balance'])assert.equal(areaStatus(wbi.items.filter(i=>i.section===section),'2026-11-23'),'belum');
});
test('WBI timeline has 10 milestones, Kick Off still 8 days away, Stock Opname card keeps location note',()=>{
 const timeline=timelineMilestones(wbi.items);
 assert.deepEqual(timeline.map(i=>i.id),['kickoff','upload-master','verify','opname','inventory','golive','ap-ar','fa','gl','final']);
 assert.equal(nextMilestone(wbi.items,'2026-11-23').id,'kickoff');
 assert.equal(countdown(nextMilestone(wbi.items,'2026-11-23').startDate,'2026-11-23'),8);
 const note=cardNote(timeline.find(i=>i.id==='opname').note);
 assert.equal(note,'Pabrik dan Toko. Hitung fisik oleh Tim WBI, tanpa penerimaan/pengiriman.');assert.ok(note.length<=90);
 assert.ok(Number.isFinite(timelinePosition(timeline,'2026-12-30')));
 assert.equal(timelineMilestones(cv.items).length,11);
});
