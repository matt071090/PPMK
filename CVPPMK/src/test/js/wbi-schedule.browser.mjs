// Local fixture only. Start preview-server on 18635 (WBI) and 18637 (PREVIEW_COMPANY=cv).
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const out=new URL('../../../docs/qa-wbi-schedule/',import.meta.url);await mkdir(out,{recursive:true});
const evidence={checks:[],screenshots:[],errors:[],seedCounts:{wbi:35,cv:37},date:'2026-11-23'};
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Jakarta'});
await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
await context.addInitScript(()=>{
 const OriginalDate=Date,now=OriginalDate.parse('2026-11-23T09:00:00+07:00');
 window.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 localStorage.setItem('editor','QA lokal');
});
const page=await context.newPage();page.on('pageerror',e=>evidence.errors.push(e.message));
const open=async(path,port=18635)=>{await page.goto(`http://127.0.0.1:${port}/${path}`);await page.waitForFunction(()=>document.querySelector('#view .activity-table')||document.querySelector('#home .m-sched .big'));};
const nav=()=>page.locator('#nav [data-tab]').evaluateAll(as=>as.filter(a=>!a.closest('li').hidden).map(a=>a.dataset.tab));
const topics=async()=>{
 await page.locator('.chat-fab').click();const values=await page.locator('[aria-label="Pilih topik diskusi"] option').evaluateAll(os=>os.map(o=>o.value));
 await page.locator('.chat-panel [aria-label="Tutup"]').click();return values;
};
try {
 await open('schedule.html#/ringkasan');
 assert.deepEqual(await nav(),['ringkasan','master','stock','balance']);
 assert.match(await page.locator('.progress-line').innerText(),/0 dari 35 kegiatan selesai/);
 assert.match(await page.locator('.next').innerText(),/Kick Off.*8 hari/);
 assert.equal(await page.locator('.area-table tbody tr').count(),5);
 assert.equal(await page.locator('#view .timeline-card').count(),10);
 assert.doesNotMatch(await page.locator('#view').innerText(),/Training|Farm Aquatic/i);
 assert.ok(!(await topics()).includes('tab:training'));
 const opname=page.locator('.timeline-card').filter({has:page.locator('b',{hasText:/^Stock Opname$/})});
 assert.match(await opname.locator('.timeline-note').innerText(),/Pabrik dan Toko/);
 evidence.checks.push('WBI: 35 activities, 10 milestones, 5 area rows, 8 days to Kick Off; no Training tab, topic or milestone');
 for(const [device,width]of [['desktop',1440],['mobile',390]]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(400);
  await page.locator('.progress-line').evaluate(e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-160,behavior:'instant'}));
  const name=`wbi-summary-${device}.png`;await page.screenshot({path:new URL(name,out).pathname});evidence.screenshots.push(name);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await open('schedule.html#/master');
 await page.locator('.stage[data-group="E"]').evaluate(e=>e.open=true);
 assert.match(await page.locator('.stage[data-group="E"]').innerText(),/Add-On Master Data \(STEM, Retail, iReapBiz\)/);
 assert.doesNotMatch(await page.locator('#view').innerText(),/Farm|Training/i);
 evidence.checks.push('WBI phase E uses STEM, Retail and iReapBiz');
 await open('schedule.html#/stock');
 const hitung=page.locator('.timeline-card').filter({has:page.locator('b',{hasText:/^Hitung fisik$/})});
 assert.match(await hitung.locator('.timeline-note').innerText(),/Pabrik dan Toko.*Hitung fisik oleh Tim WBI, tanpa penerimaan\/pengiriman/);
 assert.match(await page.locator('.rules').innerText(),/Pabrik dan Toko/);
 const row=page.locator('.activity-table tbody tr').filter({has:page.locator('b',{hasText:/^Stock Opname$/})});
 assert.match(await row.locator('.item-date').innerText(),/29 Des 2026.*31 Des 2026/);
 await row.locator('summary').click();assert.match(await row.innerText(),/Pabrik dan Toko/);
 for(const [device,width]of [['desktop',1440],['mobile',390]]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(400);
  await hitung.evaluate(e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-140,behavior:'instant'}));
  const name=`wbi-stock-${device}.png`;await page.screenshot({path:new URL(name,out).pathname});evidence.screenshots.push(name);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 evidence.checks.push('Stock Opname 29-31 Dec covers Pabrik dan Toko in activity note, inventory timeline card and rules at 1440/390px');
 await open('schedule.html#/training');assert.equal(new URL(page.url()).hash,'#/ringkasan');assert.deepEqual(await nav(),['ringkasan','master','stock','balance']);
 evidence.checks.push('Old WBI training URL falls back to Ringkasan without an empty Training page');
 await open('home.html');assert.match(await page.locator('.m-sched').innerText(),/35 kegiatan/);
 assert.equal(await page.locator('a[href*="training"]').count(),0);
 evidence.checks.push('WBI Home totals use 35 activities without a Training link');
 await page.setViewportSize({width:1440,height:1000});
 await open('schedule.html#/ringkasan',18637);assert.match(await page.locator('.progress-line').innerText(),/0 dari 37 kegiatan selesai/);
 assert.deepEqual(await nav(),['ringkasan','master','training','stock','balance']);assert.ok((await topics()).includes('tab:training'));
 await open('schedule.html#/training',18637);assert.equal(new URL(page.url()).hash,'#/training');assert.match(await page.locator('.activity-table').innerText(),/Training/);
 await open('schedule.html#/stock',18637);assert.doesNotMatch(await page.locator('.timeline-note').first().innerText(),/Pabrik dan Toko/);
 assert.match(await page.locator('.rules').innerText(),/Tanpa penerimaan\/pengiriman selama opname/);
 evidence.checks.push('CV retains 37 activities, 5 tabs, Training topic/page and unchanged stock rules');
 assert.deepEqual(evidence.errors,[]);
} finally {await writeFile(new URL('browser-evidence.json',out),JSON.stringify(evidence,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({checks:evidence.checks.length,screenshots:evidence.screenshots.length,errors:evidence.errors}));
