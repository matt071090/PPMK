import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scheduleTabs,progress,groupProgress,timelineMilestones,nextMilestone,countdown,cardNote,withFixedPic,areaStatus,timelineTodayIndex,inventoryLocations,combinedInventoryFlow,inventoryFlow,balanceTimeline,shortInventoryTitle,isInventoryActivity} from '../../main/resources/static/js/pages/schedule.js';
const read=name=>JSON.parse(readFileSync(new URL(`../../main/resources/schedule/${name}.json`,import.meta.url)));
const wbi=read('default-wbi'),cv=read('default'),get=id=>wbi.items.find(i=>i.id===id);
const stemIds=['upload-master','inventory-upload','inventory-upload-toko','ap-ar','fa','gl'];
test('WBI has 40 activities, 18 milestones, 16 master and 6 balance; no Training/Farm',()=>{
 assert.equal(wbi.items.length,40);assert.equal(cv.items.length,37);assert.doesNotMatch(JSON.stringify(wbi),/training|farm/i);
 assert.deepEqual(Object.fromEntries(['milestone','master','balance'].map(s=>[s,wbi.items.filter(i=>i.section===s).length])),{milestone:18,master:16,balance:6});
 assert.equal(new Set(wbi.items.map(i=>i.id)).size,40);
 assert.equal(get('master-E0').title,'Add-On Master Data (STEM, Retail, iReapBiz)');
});
test('Pabrik times retained; Toko deadline 22:00 and upload starts at 24:00 without changing the date',()=>{
 assert.equal(get('balance-inv').handoverTime,'19:00');assert.equal(get('balance-inv').uploadTime,'19:00-20:00');
 assert.equal(get('balance-inv-toko').handoverTime,'22:00');assert.equal(get('balance-inv-toko').uploadTime,'24:00');
 assert.match(get('inventory-toko').note,/31 Desember 2026 pukul 22:00/);
 assert.match(get('inventory-upload-toko').note,/pukul 24:00.*pukul 22:00/);
 for(const id of ['opname','cutoff','inventory','inventory-upload']){
  assert.equal(get(id).startDate,get(id+'-toko').startDate);assert.equal(get(id).endDate,get(id+'-toko').endDate);
  assert.match(get(id).title,/Produksi \/ Pabrik \/ Central Kitchen/);assert.match(get(id+'-toko').title,/Toko \/ Store/);
 }
 assert.ok(wbi.rules.some(r=>r.startsWith('Produksi / Pabrik / Central Kitchen:')));
 assert.ok(wbi.rules.some(r=>r.startsWith('Toko / Store:')));assert.doesNotMatch(JSON.stringify(wbi),/Pabrik dan Toko/);
});
test('retained dates match CV, new location uses same dates, CV Training remains intact',()=>{
 for(const item of wbi.items){const old=cv.items.find(i=>i.id===item.id);if(old)for(const k of Object.keys(old).filter(k=>/Date$|Time$/.test(k)))assert.equal(item[k],old[k],`${item.id}.${k}`);assert.equal(item.status,'belum');assert.equal(item.pic,stemIds.includes(item.id)?'STEM':'');}
 assert.equal(cv.items.find(i=>i.id==='training').startDate,'2026-12-14');assert.match(cv.items.find(i=>i.id==='master-E0').title,/Farm Aquatic/);
});
test('WBI 4 tabs and CV 5 tabs; progress/areas/master groups and Kick Off remain consistent',()=>{
 assert.deepEqual(Object.keys(scheduleTabs(wbi.items)),['ringkasan','master','stock','balance']);assert.ok(scheduleTabs(cv.items).training);
 assert.deepEqual(progress(wbi.items),{done:0,total:40,percent:0});assert.deepEqual(groupProgress(wbi.items).map(g=>g.total),[5,4,4,2,1]);
 for(const sec of ['milestone','master','balance'])assert.equal(areaStatus(wbi.items.filter(i=>i.section===sec),'2026-11-23'),'belum');
 assert.equal(nextMilestone(wbi.items,'2026-11-23').id,'kickoff');assert.equal(countdown(get('kickoff').startDate,'2026-11-23'),8);
 assert.equal(timelineMilestones(wbi.items).length,12);assert.equal(timelineMilestones(cv.items).length,11);
 assert.ok(Number.isFinite(timelineTodayIndex(timelineMilestones(wbi.items),'2026-12-30')));
});
test('location labels originate in seed; one combined flow preserves all distinct times',()=>{
 const locations=inventoryLocations(wbi.items);assert.equal(locations.length,2);
 assert.equal(locations[0].label,'Produksi / Pabrik / Central Kitchen');assert.equal(locations[0].shortLabel,'Produksi/Pabrik');assert.equal(locations[1].shortLabel,'Toko/Store');
 for(const l of locations)assert.equal(inventoryFlow(l).length,4);
 assert.equal(inventoryFlow(locations[0])[2].time,'19:00');assert.equal(inventoryFlow(locations[1])[2].time,'22:00');assert.equal(inventoryFlow(locations[1])[3].time,'24:00');
 assert.deepEqual(combinedInventoryFlow(wbi.items).map(e=>e.time||''),['','','19:00','19:00-20:00','22:00','24:00']);
 assert.equal(combinedInventoryFlow(wbi.items).length,6);assert.match(combinedInventoryFlow(wbi.items)[0].title,/Produksi\/Pabrik · Toko\/Store/);
 assert.equal(shortInventoryTitle(get('opname').title,wbi.items),'Stock Opname Produksi/Pabrik');
 assert.equal(balanceTimeline(wbi.items).length,8);assert.equal(balanceTimeline(cv.items).length,6);
 for(const id of ['opname-toko','cutoff-toko','inventory-toko','inventory-upload-toko'])assert.equal(isInventoryActivity(id),true);
});
test('shared fixed-PIC projection locks only seed-marked STEM activities and preserves admin override',()=>{
 const ids=wbi.items.filter(i=>i.pic==='STEM').map(i=>i.id);assert.deepEqual(ids.sort(),[...stemIds].sort());
 const projected=withFixedPic(wbi.items,true,ids,true);assert.equal(projected.filter(i=>i.picFixed).length,6);assert.equal(projected.find(i=>i.id==='opname').picFixed,undefined);
 const override=withFixedPic([{id:'inventory-upload-toko',pic:'STEM pengganti'}],true,ids,true)[0];assert.equal(override.pic,'STEM pengganti');assert.equal(override.picFixed,true);
});

test('WBI seed and shared schedule UI contain client-facing language only; midnight retains Dec 31',()=>{
 assert.doesNotMatch(JSON.stringify(wbi),/asumsi|Fakhri|koordinator|TODO|FIXME|worker/i);
 assert.doesNotMatch(readFileSync(new URL('../../main/resources/static/js/pages/schedule.js',import.meta.url),'utf8'),/asumsi|Fakhri|koordinator|TODO|FIXME|worker/i);
 assert.equal(get('inventory-upload-toko').startDate,'2026-12-31');assert.equal(countdown(get('inventory-upload-toko').endDate,'2026-12-31'),0);
});

test('all handovers are free; legacy saved STEM value does not lock a handover',()=>{
 const ids=wbi.items.filter(i=>i.pic==='STEM').map(i=>i.id);
 for(const it of wbi.items.filter(i=>/^Serah /i.test(i.title))) {assert.equal(it.pic,'');assert.ok(!ids.includes(it.id));}
 for(const id of ['inventory','inventory-toko']){
  assert.equal(get(id).pic,'');
  const row=withFixedPic([{id,pic:'STEM'}],true,ids,true)[0];assert.equal(row.pic,'STEM');assert.equal(row.picFixed,undefined);
 }
});
test('only six upload milestones are STEM; combined timeline labels keep CV ownership',()=>{
 assert.equal(stemIds.length,6);
 for(const id of stemIds){assert.match(get(id).title,/^Upload /);assert.equal(get(id).pic,'STEM');if(cv.items.some(i=>i.id===id))assert.equal(cv.items.find(i=>i.id===id).pic,'STEM');}
 for(const it of wbi.items.filter(i=>i.section==='balance'))assert.equal(it.pic,'');
});
