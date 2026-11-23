// One integration scenario: split inventory + fixed STEM PIC; local fixture servers 18635/18637/18638.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const out=new URL('../../../docs/qa-wbi-inventory/',import.meta.url);await mkdir(out,{recursive:true});
const evidence={scenarios:1,checks:[],screenshots:[],errors:[]};
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Jakarta'});
await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
await context.addInitScript(()=>{const D=Date,now=D.parse('2026-11-23T09:00:00+07:00');window.Date=class extends D{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};localStorage.setItem('editor','QA lokal');});
const page=await context.newPage();page.on('pageerror',e=>evidence.errors.push(e.message));
const open=async(path,port=18635)=>{await page.goto(`http://127.0.0.1:${port}/${path}`);await page.waitForFunction(()=>document.querySelector('#view .activity-table')||document.querySelector('#home .m-sched .big'));};
try {
 await open('schedule.html#/ringkasan');assert.match(await page.locator('.progress-line').innerText(),/0 dari 40 kegiatan selesai/);assert.match(await page.locator('.next').innerText(),/Kick Off.*8 hari/);
 assert.equal(await page.locator('.area-table tbody tr').count(),6);assert.equal(await page.locator('#view .timeline-card').count(),12);
 const area=page.locator('.area-table tbody tr');
 assert.match(await area.filter({hasText:'Inventory Produksi / Pabrik / Central Kitchen'}).innerText(),/19:00.*19:00-20:00/s);
 assert.match(await area.filter({hasText:'Inventory Toko / Store'}).innerText(),/22:00.*ASUMSI:.*setelah 22:00/s);
 const nav=await page.locator('#nav [data-tab]').evaluateAll(as=>as.filter(a=>!a.closest('li').hidden).map(a=>a.dataset.tab));assert.deepEqual(nav,['ringkasan','master','stock','balance']);
 evidence.checks.push('40 activities, 6 area rows, 12 milestones and Kick Off +8 days; separate 19:00 and 22:00 inventory rows');
 await open('schedule.html#/stock');assert.equal(await page.locator('#inventory-flows .timeline-shell').count(),2);assert.equal(await page.locator('#inventory-flows .timeline-card').count(),8);
 assert.match(await page.locator('#inventory-flows h3').first().innerText(),/^Produksi \/ Pabrik \/ Central Kitchen$/);assert.equal(await page.locator('#inventory-flows h3').nth(1).innerText(),'Toko / Store');
 const tokoUpload=page.locator('.timeline-card').filter({has:page.locator('b',{hasText:/Upload SAP Toko\/Store/})});assert.match(await tokoUpload.innerText(),/ASUMSI:.*setelah 22:00/s);assert.doesNotMatch(await tokoUpload.innerText(),/22:00-\d/);
 assert.match(await page.locator('.rules').innerText(),/Produksi \/ Pabrik \/ Central Kitchen:.*19:00-20:00.*Toko \/ Store:.*22:00/s);
 assert.equal(await page.locator('[data-pic="inventory"]').count(),0);assert.equal(await page.locator('[data-pic="inventory-toko"]').count(),0);assert.equal(await page.locator('[data-pic="inventory-upload-toko"]').count(),0);
 assert.equal(await page.locator('[data-pic="opname-toko"]').count(),1);assert.match(await page.locator('.activity-table').innerText(),/STEM.*terkunci/s);
 for(const [device,width]of [['desktop',1440],['mobile',390]]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(400);
  await page.evaluate(()=>document.querySelectorAll('body>header,.chat-fab').forEach(e=>e.style.visibility='hidden'));
  for(const [selector,name]of [['#inventory-flows','inventory'],['#view .activity-table','pic-table']]){
   const filename=`${name}-${device}.png`;await page.locator(selector).screenshot({path:new URL(filename,out).pathname});evidence.screenshots.push(filename);
  }
  await page.evaluate(()=>document.querySelectorAll('body>header,.chat-fab').forEach(e=>e.style.visibility=''));
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 evidence.checks.push('Two location timelines retain full seed labels in headings/rules and short card labels; no 390px page overflow; STEM PIC locked');
 const saved=await page.evaluate(()=>fetch('api/schedule').then(r=>r.json()));assert.equal(saved.data.items.filter(i=>i.pic==='STEM').length,8);
 const denied=await page.evaluate(async doc=>{doc.data.items.find(i=>i.id==='inventory-upload-toko').pic='Tidak boleh';return(await fetch('api/schedule',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rev:doc.rev,data:doc.data})})).status;},saved);assert.equal(denied,403);
 const freePic=`Tim Toko ${saved.rev+1}`;await page.locator('[data-pic="opname-toko"]').fill(freePic);await page.locator('[data-pic="opname-toko"]').press('Tab');await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Jadwal tersimpan'));
 const after=await page.evaluate(()=>fetch('api/schedule').then(r=>r.json()));assert.equal(after.data.items.find(i=>i.id==='opname-toko').pic,freePic);assert.equal(after.data.items.find(i=>i.id==='inventory-upload-toko').pic,'STEM');
 evidence.checks.push('Non-admin STEM PIC tampering returns 403; free opname PIC saves without overwriting STEM or other PIC');
 await open('schedule.html#/stock',18638);await page.locator('[data-edit="inventory-upload-toko"]').click();const adminBefore=await page.evaluate(()=>fetch('api/schedule').then(r=>r.json())),adminPic=`STEM pengganti ${adminBefore.rev+1}`;await page.locator('#editor-slot [name="pic"]').fill(adminPic);
 await page.locator('#editor-slot button[type="submit"]').click();await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Jadwal tersimpan'));
 assert.equal((await page.evaluate(()=>fetch('api/schedule').then(r=>r.json()))).data.items.find(i=>i.id==='inventory-upload-toko').pic,adminPic);
 evidence.checks.push('ASSUMPTION: unlocked admin editor can override STEM PIC and save it');
 await open('home.html');assert.match(await page.locator('.m-sched').innerText(),/40 kegiatan/);
 await open('schedule.html#/ringkasan',18637);assert.match(await page.locator('.progress-line').innerText(),/37 kegiatan/);assert.equal(await page.locator('.area-table tbody tr').count(),5);
 await open('schedule.html#/stock',18637);assert.equal(await page.locator('#inventory-flows .timeline-shell').count(),1);assert.match(await page.locator('.rules').innerText(),/Tanpa penerimaan\/pengiriman selama opname/);
 evidence.checks.push('Home totals 40; CV retains 37 activities, 5 area rows and its single original inventory flow');assert.deepEqual(evidence.errors,[]);
} finally {await writeFile(new URL('browser-evidence.json',out),JSON.stringify(evidence,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({scenarios:1,checks:evidence.checks.length,screenshots:evidence.screenshots.length,errors:evidence.errors}));
