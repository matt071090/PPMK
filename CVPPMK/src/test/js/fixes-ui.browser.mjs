// Uses an existing Playwright installation; never installs packages or contacts SAP.
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const out=new URL('../../../docs/qa-fixes-1/',import.meta.url);
await mkdir(new URL('screenshots/',out),{recursive:true});
const evidence={checks:[],pages:[],errors:[]};
const check=(name,fn)=>{fn(); evidence.checks.push(name);};
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
await context.addInitScript(()=>localStorage.setItem('editor','QA lokal'));
await context.route('**/api/section/coa',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({generatedAt:'2026-11-23T12:00:00',results:{accounts:{columns:['AcctCode','AcctName','GroupMask','Levels','Postable','ActType','ActCurr','LocManTran','Finanse','Branches'],rows:[['110100','Persediaan','1',5,'Y','N','IDR','N','N',null]],ms:1}}})}));
const page=await context.newPage();
page.on('pageerror',e=>evidence.errors.push(e.message));
const open=async(path,port=18635)=>{await page.goto(`http://127.0.0.1:${port}/${path}`); await page.waitForTimeout(250);};
try {
 await open('index.html#/udt');await page.locator('#udt-t .data-pager').waitFor();

 assert.equal(await page.locator('#udt-t tbody > tr').count(),25);
 assert.match(await page.locator('#udt-t [data-empty-count]').innerText(),/112/);
 evidence.checks.push('UDT: 25 visible of 60 filled / 172 total');
 await page.locator('#udt-t [data-page-next]').click();
 assert.match(await page.locator('#udt-t .data-pager').innerText(),/26-50 dari 60/);
 await page.locator('#udt-t input[type=search]').fill('ST_TABEL_059');
 assert.equal(await page.locator('#udt-t tbody > tr').count(),1);
 assert.match(await page.locator('#udt-t tbody').innerText(),/ST_TABEL_059/);
 evidence.checks.push('Paging next, search from page 2 resets and finds row 59');
 await page.locator('#udt-t input[type=search]').fill('');
 await page.locator('#udt-t [data-page-size]').selectOption('50');assert.equal(await page.locator('#udt-t tbody > tr').count(),50);
 await page.locator('#udt-t [data-show-empty]').check();
 assert.equal(await page.locator('#udt-t tbody > tr').count(),25);
 await page.reload();await page.locator('#udt-t .data-pager').waitFor();assert.equal(await page.locator('#udt-t [data-show-empty]').isChecked(),true);
 assert.match(await page.locator('#udt-t .data-pager').innerText(),/dari 172/);
 evidence.checks.push('Page size 50; empty toggle persists after reload, restores 172 rows');
 const exp=await page.evaluate(async()=>{const ui=await import('./js/ui.js');return ui.exportOf('udt-t').rows.length;});assert.equal(exp,172);
 await page.locator('#udt-t input[type=search]').fill('ST_TABEL_0');
 assert.equal(await page.evaluate(async()=>(await import('./js/ui.js')).exportOf('udt-t').rows.length),99);
 const downloading=page.waitForEvent('download');await page.locator('#udt-t [data-export]').click();const dl=await downloading;
 await dl.saveAs(new URL('filtered-udt.xlsx',out).pathname);
 const fileBase64=(await readFile(new URL('filtered-udt.xlsx',out))).toString('base64');
 const exportedRows=await page.evaluate(async b64=>{const {readXlsx}=await import('./js/xlsx-read.js');const f=new File([Uint8Array.from(atob(b64),c=>c.charCodeAt(0))],'filter.xlsx');return(await readXlsx(f))[0].rows.length;},fileBase64);
 assert.equal(exportedRows,100);
 evidence.checks.push('Downloaded XLSX has 99 filtered data rows + header while only 25 rows are visible');
 await open('index.html#/udt');await page.locator('#ad-stem-p').waitFor();
 await page.locator('#ad-stem-p [data-show-empty]').check();
 const params=await page.locator('#ad-stem-p').innerText();assert.ok(!params.includes('SAPUSERINT'));assert.ok(!params.includes('ITBRACCI'));assert.ok(params.includes('WHTRS'));
 assert.match(await page.locator('#article').innerText(),/11 item khusus branch disembunyikan/);
 evidence.checks.push('Nonbranch STEM catalog hides 11 branch keys even with empty toggle on, retains WHTRS');
 await open('index.html#/addon-st-param');await page.locator('#ad-ST_PARAM').waitFor();
 await page.locator('#ad-ST_PARAM [data-show-empty]').check();assert.ok(!(await page.locator('#ad-ST_PARAM').innerText()).includes('SAPUSERINT'));
 evidence.checks.push('Generic ST_PARAM also hides branch keys');
 await open('index.html#/ringkasan');await page.locator('#review').waitFor();
 assert.equal(await page.locator('.kpis a').filter({has:page.locator('span', {hasText:/^Branch$/})}).count(),0);
 const menuCount=await page.locator('#rv-count').innerText();
 assert.equal(await page.locator('#nav [data-id="addon-stem-unused"]').count(),0);
 await page.locator('#addon-show-empty').check();await page.waitForLoadState();await page.locator('#nav [data-id="addon-stem-unused"]').waitFor({state:'attached'});
 assert.equal(await page.locator('#rv-count').innerText(),menuCount);
 evidence.checks.push('Summary hides Branch KPI; showing empty Addon menu does not change review denominator');

 await open('index.html#/addon-st_udrth'.replace('st_udrth','st-udrth')); // slug uses hyphens
 await page.locator('#ad-ST_UDRTH input[type=search]').waitFor();
 await page.locator('#ad-ST_UDRTH input[type=search]').fill('PENCARIAN CHILD TERAKHIR');
 assert.match(await page.locator('#ad-ST_UDRTH tbody').innerText(),/RT060/);
 const sheets=await page.evaluate(async()=>{const ui=await import('./js/ui.js');const b=[...document.querySelectorAll('[data-export]')].find(b=>ui.exportOf(b.dataset.export)?.sheets);return ui.exportOf(b.dataset.export).sheets.map(s=>s.rows.length);});
 assert.deepEqual(sheets,[1,3]);evidence.checks.push('Child search finds last parent across pages; Excel sheets contain entire matching header and child set');
 await open('schedule.html#/master');await page.locator('[data-pic]').first().waitFor();
 assert.equal(await page.locator('[data-edit]').count(),0);
 assert.equal(await page.locator('input[type=date],textarea[name=note]').count(),0);
 const scheduleBefore=await page.evaluate(()=>fetch('/api/schedule').then(r=>r.json()));
 const chosenPic=`Tim WBI ${scheduleBefore.rev+1}`;
 await page.locator('[data-pic="upload-master"]').fill(chosenPic);await page.locator('[data-pic="upload-master"]').press('Tab');
 await page.locator('[data-status="upload-master"]').selectOption('proses');
 await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Jadwal tersimpan'));
 const saved=await page.evaluate(()=>fetch('/api/schedule').then(r=>r.json()));
 assert.equal(saved.data.items.find(i=>i.id==='upload-master').pic,chosenPic);
 assert.equal(saved.data.items.some(i=>i.id==='training'),false);
 assert.equal(saved.data.items.find(i=>i.id==='fa').pic,'');
 assert.equal(saved.data.items.find(i=>i.id==='upload-master').status,'proses');
 evidence.checks.push('Non-admin WBI saves free PIC + status; untouched STEM items remain blank; dates/note editor inaccessible');
 await open('schedule.html#/training',18637);await page.locator('.pic-fixed').first().waitFor();
 assert.equal(await page.locator('[data-pic="training-1"]').count(),0);assert.match(await page.locator('.pic-fixed').first().innerText(),/STEM/);
 await open('index.html#/udt',18637);await page.locator('#ad-stem-p').waitFor();await page.locator('#ad-stem-p [data-show-empty]').check();
 assert.match(await page.locator('#ad-stem-p').innerText(),/SAPUSERINT/);assert.match(await page.locator('#ad-stem-p').innerText(),/ITBRACCI/);
 evidence.checks.push('Legacy empty company / branch fixture retains fixed STEM PIC and branch keys');
 await open('index.html#/warehouses',18637);assert.match(await page.locator('#article .kpis').innerText(),/Branch/);
 await open('index.html#/business-partners',18637);assert.match(await page.locator('#article').innerText(),/BP aktif belum di-assign ke branch/);
 evidence.checks.push('Branch fixture retains Warehouse Branch KPI and BP branch warning');
 await page.route('**/api/schedule/access',r=>r.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await open('schedule.html#/master');await page.locator('[data-pic]').first().waitFor();assert.equal(await page.locator('[data-edit]').count(),0);
 await page.unroute('**/api/schedule/access');evidence.checks.push('Access lookup failure keeps dates/notes locked');
 const routes=['index.html#/udo','index.html#/udt','index.html#/udf','index.html#/saved-queries','index.html#/addon-st-param','index.html#/addon-st-udrth','index.html#/ringkasan','index.html#/warehouses','index.html#/business-partners','index.html#/users','index.html#/coa','home.html','schedule.html#/master'];
 for(const phase of ['before','after'])for(const [device,width]of [['desktop',1440],['mobile',390]]){
  await page.setViewportSize({width,height:1000});
  await page.evaluate(()=>localStorage.clear());
  for(const path of routes){
   await open(path,phase==='before'?18636:18635);
   await page.waitForTimeout(150);
   const slug=(path.split('#/')[1]||'home').replace(/[^a-z0-9-]/g,'-');
   const shot=`screenshots/${phase}-${slug}-${device}.png`;
   await page.screenshot({path:new URL(shot,out).pathname,fullPage:false});
   const state=await page.evaluate(()=>({title:document.title,body:document.body.innerText.slice(0,240),error:document.querySelector('#article > .error')?.innerText||'',width:document.documentElement.scrollWidth,viewport:innerWidth}));
   evidence.pages.push({phase,path,device,screenshot:shot,...state});
   if(phase==='after'){assert.equal(state.error,'',path);assert.ok(state.width<=width,`${path} overflows: ${state.width}>${width}`);}
  }
 }
 for(const [device,width]of [['desktop',1440],['mobile',390]]){
  await page.setViewportSize({width,height:1000});
  for(const phase of ['before','after']){
   await open('index.html#/udt',phase==='before'?18636:18635);await page.locator('#udt-t').waitFor();
   if(phase==='after')await page.locator('#udt-t .data-pager').scrollIntoViewIfNeeded();
   else await page.locator('#udt-t tbody > tr').nth(24).scrollIntoViewIfNeeded();
   const shot=`screenshots/${phase}-udt-pager-${device}.png`;await page.screenshot({path:new URL(shot,out).pathname});evidence.pages.push({phase,device,screenshot:shot,focus:'UDT page controls'});
   await page.locator('#addon-stem-param').scrollIntoViewIfNeeded();
   const paramShot=`screenshots/${phase}-stem-params-${device}.png`;await page.screenshot({path:new URL(paramShot,out).pathname});evidence.pages.push({phase,device,screenshot:paramShot,focus:'STEM parameter section'});
  }
 }
 assert.equal(evidence.errors.length,0,JSON.stringify(evidence.errors));
 evidence.checks.push('All 13 routes render at 1440 and 390px without page overflow or JavaScript exceptions');
} finally {await writeFile(new URL('browser-evidence.json',out),JSON.stringify(evidence,null,2));await browser.close();}
console.log(JSON.stringify({checks:evidence.checks,screenshots:evidence.pages.length,errors:evidence.errors}));
