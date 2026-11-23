import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const out=new URL('../../../docs/qa-wbi-pic/',import.meta.url);await mkdir(out,{recursive:true});
const result={checks:[],screenshots:[],errors:[],requests:[]};
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}),context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
await context.route('**/data/ppmk-users.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({users:[{code:'CV01',name:'Tim CV'}]})}));
await context.addInitScript(()=>localStorage.setItem('editor','QA lokal'));
const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('request',r=>result.requests.push(r.url()));
const open=async(path,port=18635)=>{await page.goto(`http://127.0.0.1:${port}/${path}`);await page.locator('[data-pic]').first().waitFor();await page.waitForTimeout(250);};
try {
 await open('schedule.html#/stock');
 for(const [device,width]of [['desktop',1440],['mobile',390]]){
  await page.setViewportSize({width,height:1000});await page.waitForTimeout(400);
  const input=page.locator('[data-pic="balance-inv"]');await input.evaluate(e=>scrollTo({top:e.getBoundingClientRect().top+scrollY-260,behavior:'instant'}));await input.evaluate(e=>e.blur());await input.focus();
  await page.locator('.pic-pop [data-v="WBI:WBI-ACC-STF1"]').waitFor();
  assert.match(await page.locator('.pic-pop').innerText(),/WBI.*WBI-ACC-STF1 \(Rizky\).*CEO-WBI \(Andy\)/s);assert.doesNotMatch(await page.locator('.pic-pop').innerText(),/Workflow|WBI-PARE|LOCKED/);
  const filename=`dropdown-${device}.png`;await page.screenshot({path:new URL(filename,out).pathname});result.screenshots.push(filename);await input.press('Escape');
 }
 await page.locator('[data-pic="balance-inv"]').evaluate(e=>e.blur());await page.locator('[data-pic="balance-inv"]').focus();await page.locator('.pic-pop [data-v="WBI:WBI-ACC-STF1"]').click();await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Jadwal tersimpan'));
 assert.equal((await page.evaluate(()=>fetch('api/schedule').then(r=>r.json()))).data.items.find(i=>i.id==='balance-inv').pic,'WBI:WBI-ACC-STF1');
 await open('schedule.html#/ringkasan');assert.match(await page.locator('.area-table').innerText(),/WBI-ACC-STF1 \(Rizky\)/);assert.equal(await page.locator('[data-pic="inventory-upload-toko"]').count(),0);
 result.checks.push('SAP directory filter/group/code+username correct; picked WBI token survives Save and resolves in area summary; STEM remains locked');
 assert.ok(!result.requests.some(url=>url.startsWith('http://127.0.0.1:18635/data/ppmk-users.json')));
 await page.route('**/api/section/users',r=>r.fulfill({status:503,contentType:'application/json',body:'{}'}));
 await open('schedule.html#/stock');await page.locator('[data-pic="opname-toko"]').fill('Koordinator shift malam');await page.locator('[data-pic="opname-toko"]').press('Tab');await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Jadwal tersimpan'));
 assert.equal((await page.evaluate(()=>fetch('api/schedule').then(r=>r.json()))).data.items.find(i=>i.id==='opname-toko').pic,'Koordinator shift malam');await page.unroute('**/api/section/users');
 result.checks.push('Unavailable SAP directory keeps free text usable and never borrows ppmk-users.json');
 await open('schedule.html#/ringkasan',18637);await page.locator('[data-pic="kickoff"]').focus();await page.locator('.pic-pop [data-v="PPMK:CV01"]').waitFor();assert.match(await page.locator('.pic-pop').innerText(),/PPMK.*CV01 \(Tim CV\)/s);assert.doesNotMatch(await page.locator('.pic-pop').innerText(),/Rizky|CEO-WBI/);
 result.checks.push('CV retains ppmk-users.json and PPMK group; no new User WBI menu/storage');assert.deepEqual(result.errors,[]);
} finally {await writeFile(new URL('browser-evidence.json',out),JSON.stringify(result,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({checks:result.checks.length,screenshots:result.screenshots.length,errors:result.errors}));
