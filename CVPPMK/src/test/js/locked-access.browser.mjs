// Requires an already-installed Playwright and two local preview servers (WBI 18635, CV 18637).
import { pathToFileURL } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const out=new URL('../../../docs/qa-fixes-locked/',import.meta.url);
await mkdir(out,{recursive:true});
const evidence={checks:[],http:[],requests:[],errors:[],screenshots:[]};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
await context.addInitScript(()=>localStorage.setItem('editor','QA lokal'));
const page=await context.newPage();
page.on('pageerror',e=>evidence.errors.push(e.message));
page.on('request',r=>{const p=new URL(r.url()).pathname;if(p.startsWith('/api/'))evidence.requests.push({path:p,method:r.method()});});
const open=async(path,port=18635)=>{await page.goto(`http://127.0.0.1:${port}/${path}`);};
async function probe(path,status,port=18635) {
 const r=await context.request.get(`http://127.0.0.1:${port}${path}`);assert.equal(r.status(),status,path);
 const data=await r.json();evidence.http.push({path,status:r.status(),data});return data;
}
async function paramKeys(hidden) {
 await page.locator('#ad-stem-p [data-show-empty]').check();
 const keys=await page.evaluate(async()=>(await import('./js/ui.js')).exportOf('ad-stem-p').rows.map(r=>r.Key));
 for(const key of ['SAPUSERINT','SAPPWDINT','ITBRACCI','ITBRACCR','ITBRANCHGITYPE','ITBRANCHGRTYPE','ITBRANCHTOLERANCE','SLHOST','ITB_CR_NAME','FILTERITEMBYPROP','INSERTPARAMAUTO'])assert.equal(keys.includes(key),!hidden,key);
 assert.ok(keys.includes('WHTRS'));
 await page.locator('#ad-stem-p input[type=search]').fill('WHTRS');assert.match(await page.locator('#ad-stem-p tbody').innerText(),/WHTRS/);
 await page.locator('#ad-stem-p input[type=search]').fill('');
}
try {
 const access=await probe('/api/setup-access',200);assert.equal(access.unlocked,false);assert.equal(access.dev,false);
 for(const p of ['/api/setup/capabilities','/api/setup/steps','/api/setup/sources','/api/section/template-ref'])await probe(p,403);
 assert.deepEqual(await probe('/api/branch-mode',200),{branchEnabled:false});
 evidence.checks.push('Fresh locked session gets only public false flag while Setup capabilities/steps/sources/template-ref remain 403');
 await open('index.html#/udt');await page.locator('#ad-stem-p').waitFor();await paramKeys(true);
 assert.match(await page.locator('#article').innerText(),/11 item khusus branch disembunyikan \(company tanpa branch\)/);
 assert.equal(await page.evaluate(async()=>(await import('./js/data-policy.js')).capabilities.branchEnabled),false);
 for(const [device,width]of [['desktop',1440],['mobile',390]]){
  await page.setViewportSize({width,height:1000});
  await page.evaluate(()=>document.body.classList.remove('nav-open'));await page.waitForTimeout(400);
  await page.locator('#addon-stem-param').evaluate(h=>scrollTo({top:h.getBoundingClientRect().top+scrollY-130,behavior:'instant'}));
  const name=`locked-stem-params-${device}.png`;await page.screenshot({path:new URL(name,out).pathname});evidence.screenshots.push(name);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 evidence.checks.push('Locked WBI hides all 11 branch keys even with Tampilkan yang kosong on and shows count, at 1440px and 390px');
 await open('index.html#/addon-st-param');await page.locator('#ad-ST_PARAM [data-show-empty]').check();
 const generic=await page.locator('#ad-ST_PARAM').innerText();assert.ok(!generic.includes('SAPUSERINT'));assert.ok(!generic.includes('ITBRACCI'));
 assert.match(await page.locator('#article').innerText(),/2 item khusus branch disembunyikan/);
 evidence.checks.push('Locked generic ST_PARAM also hides its 2 stored branch keys and reports count');
 await open('index.html#/ringkasan');await page.locator('#review').waitFor();
 assert.equal(await page.locator('.kpis a span').filter({hasText:/^Branch$/}).count(),0);
 await open('home.html');await page.locator('.m-check .big').waitFor();
 assert.equal(await page.evaluate(async()=>(await import('./js/data-policy.js')).capabilities.branchEnabled),false);
 evidence.checks.push('Check List summary and Home resolve nonbranch mode before Setup is unlocked');
 await open('schedule.html#/master');await page.locator('[data-pic="master-A0"]').waitFor();
 assert.equal(await page.locator('[data-edit]').count(),0);
 const prev=await page.evaluate(()=>fetch('api/schedule').then(r=>r.json()));const pic=`Tim WBI ${prev.rev+1}`;
 await page.locator('[data-pic="master-A0"]').fill(pic);await page.locator('[data-pic="master-A0"]').press('Tab');
 await page.locator('[data-status="upload-master"]').selectOption('proses');await page.locator('#save').click();
 await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Jadwal tersimpan'));
 assert.equal((await page.evaluate(()=>fetch('api/schedule').then(r=>r.json()))).data.items.find(i=>i.id==='master-A0').pic,pic);
 assert.equal((await probe('/api/setup-access',200)).unlocked,false);
 evidence.checks.push('Locked Schedule still saves PIC/status and keeps the admin editor locked');
 assert.equal((await probe('/api/setup-access',200,18637)).unlocked,false);
 assert.deepEqual(await probe('/api/branch-mode',200,18637),{branchEnabled:true});
 await open('index.html#/udt',18637);await page.locator('#ad-stem-p').waitFor();await paramKeys(false);
 await probe('/api/setup/capabilities',403,18637);
 evidence.checks.push('Locked CV/branch fixture retains branch keys using public true flag');
 for(const [body,status]of [[{branchEnabled:null},200],[{},503]]){
  await page.route('**/api/branch-mode',r=>r.fulfill({status,contentType:'application/json',body:JSON.stringify(body)}));
  await open('index.html#/udt');await page.locator('#ad-stem-p').waitFor();await paramKeys(false);
  assert.equal(await page.evaluate(async()=>(await import('./js/data-policy.js')).capabilities.branchEnabled),null);
  await page.unroute('**/api/branch-mode');
 }
 evidence.checks.push('Unknown flag and public endpoint HTTP failure retain branch checks without falling back to Setup');
 await page.evaluate(async()=>{
  window.__templateAlerts=[];window.alert=m=>window.__templateAlerts.push(m);
  const ui=await import('./js/ui.js'),{PAGES}=await import('./js/pages/upload.js');
  document.querySelector('#article').innerHTML=PAGES['upload-templates'].render();ui.flushMounts();
 });
 const requestStart=evidence.requests.length;await page.locator('[data-tpl="0"]').click();
 await page.waitForFunction(()=>window.__templateAlerts.length>0);
 assert.match(await page.evaluate(()=>window.__templateAlerts[0]),/Setup terkunci/);
 const templateRequests=evidence.requests.slice(requestStart).map(r=>r.path);
 assert.ok(templateRequests.includes('/api/branch-mode'));assert.ok(templateRequests.includes('/api/section/template-ref'));
 evidence.checks.push('Upload templates read the public flag; their existing protected reference data still denies locked access');
 assert.deepEqual(evidence.requests.filter(r=>r.path.startsWith('/api/setup/')),[]);
 assert.deepEqual(evidence.errors,[]);
 evidence.checks.push('Check List/Home/Schedule make zero protected Setup requests and have zero JavaScript exceptions');
} finally {await writeFile(new URL('browser-evidence.json',out),JSON.stringify(evidence,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({checks:evidence.checks.length,screenshots:evidence.screenshots.length,errors:evidence.errors}));
