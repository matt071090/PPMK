// Regresi halaman Schedule (data realistis: 40 kegiatan, 28 user SAP; 1640/1440/390 px) yang lolos dari tes tata letak sebelumnya:
// A. kartu hero + KPI berjajar (bukan menumpuk) dan teks hitungan mundur punya jarak;
// B. banner 'Mode lihat' dan kolom password admin tidak ada;
// C. daftar saran PIC muncul saat klik/fokus, tidak terpotong wadah, bisa dipilih dengan mouse dan keyboard, ketik bebas tetap diterima.
// Jalankan preview fixture (npm run preview) lalu: node src/test/js/schedule-regression.browser.mjs
// Env: PLAYWRIGHT_MODULE, CHROME_PATH, PREVIEW_PORT (default 18635).
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const pw=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');const chromium=pw.chromium||pw.default.chromium;
const port=process.env.PREVIEW_PORT||18635;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const failures=[];
try {
 const context=await browser.newContext({viewport:{width:1640,height:900},timezoneId:'Asia/Jakarta'});
 const writes=[];
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='127.0.0.1')return r.abort();if(r.request().method()!=='GET'&&!/\/api\/schedule\/chat/.test(u.pathname)){writes.push(r.request().method()+' '+u.pathname);}return r.continue();});
 await context.addInitScript(()=>{const D=Date,now=D.parse('2026-12-01T09:00:00+07:00');window.Date=class extends D{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};try{localStorage.clear();}catch{}});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const width of [1640,1440,390]) {
  await page.setViewportSize({width,height:900});
  await page.goto('about:blank');await page.goto(`http://127.0.0.1:${port}/schedule.html#/ringkasan`);
  await page.waitForSelector('.activity-table .pic-input',{timeout:20000});await page.waitForTimeout(500);
  const rows=await page.locator('.activity-table tbody tr').count();
  if(rows<15)failures.push(`${width}px: hanya ${rows} baris kegiatan Ringkasan (harus 15)`);
  if(!/dari 40 kegiatan/.test(await page.locator('.progress-line').innerText()))failures.push(`${width}px: jadwal bukan 40 kegiatan`);
  // A. hero + KPI
  const a=await page.evaluate(()=>{const out=[],g=s=>document.querySelector(s),r=e=>e.getBoundingClientRect();
   const hero=g('.hero'),cd=g('.countdown'),kpis=[...document.querySelectorAll('.kpi')];
   if(getComputedStyle(hero).display!=='grid')out.push('hero bukan grid');
   if(kpis.length!==4)out.push('KPI harus 4 kotak');
   const tops=new Set(kpis.map(k=>Math.round(r(k).top)));
   if(innerWidth>=900){
    if(tops.size!==1)out.push('KPI tidak satu baris: '+[...tops]);
    if(r(kpis[0]).left<r(cd).right)out.push('KPI tidak di sebelah kanan kartu hitungan mundur');
    if(Math.abs(r(kpis[0]).top-r(cd).top)>40)out.push('KPI tidak sejajar dengan kartu hitungan mundur');
    if(r(kpis[0]).width>400)out.push('KPI terlalu lebar: '+Math.round(r(kpis[0]).width));
   } else if(tops.size!==2)out.push('HP: KPI harus 2x2, baris: '+tops.size);
   const s=cd.querySelector('strong'),sp=cd.querySelector('span'),sm=cd.querySelector('small');
   if(r(sp).top<r(s).bottom-1||r(sm).top<r(sp).bottom)out.push('teks hitungan mundur menempel/menumpuk');
   if(parseFloat(getComputedStyle(cd).paddingLeft)<8)out.push('kartu hitungan mundur tanpa padding');
   const prog=g('.progress-line progress');if(!prog||r(prog).height<4)out.push('bar progres hilang');
   return out;});
  for(const p of a)failures.push(`${width}px A: ${p}`);
  // B. banner
  const b=await page.evaluate(()=>{const out=[],v=document.querySelector('#view');
   if(v.querySelector('.lock-note,#unlock-form,#unlock-pw'))out.push('banner/kolom password masih ada');
   if(/Mode lihat|Buka kunci|Password admin/i.test(v.innerText))out.push('teks banner masih tampil');
   if(!document.querySelector('a.mod-admin[href="setup.html"]'))out.push('menu Masuk admin tidak ada');
   return out;});
  for(const p of b)failures.push(`${width}px B: ${p}`);
  // C. daftar PIC
  const input=page.locator('.activity-table .pic-input:not([disabled])').first();
  await input.scrollIntoViewIfNeeded();await input.click();await page.waitForTimeout(400);
  const c=await page.evaluate(()=>{const out=[],pop=document.querySelector('.pic-pop');
   if(!pop||pop.hidden||getComputedStyle(pop).display==='none')return ['daftar PIC tidak muncul'];
   const r=pop.getBoundingClientRect(),cs=getComputedStyle(pop);
   if(cs.position!=='absolute'&&cs.position!=='fixed')out.push('daftar PIC tidak diposisikan ('+cs.position+')');
   if(r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1)out.push('daftar PIC keluar layar '+JSON.stringify([r.left,r.top,r.right,r.bottom].map(Math.round)));
   const opts=[...pop.querySelectorAll('li[data-v]')].map(l=>l.dataset.v);
   if(!opts.includes('STEM'))out.push('opsi STEM tidak ada');
   if(opts.length<12)out.push('saran user kurang: '+opts.length);
   if(!pop.querySelector('li.hint'))out.push('petunjuk tidak ada');
   // tidak terpotong wadah: titik di tengah dan di dekat tepi bawah daftar harus milik daftar itu
   for(const [fx,fy] of [[.5,.1],[.5,.5],[.5,.95]]){const el=document.elementFromPoint(r.left+r.width*fx,Math.min(innerHeight-2,r.top+Math.min(r.height,innerHeight-r.top)*fy));if(!el||!pop.contains(el))out.push('daftar PIC terpotong/tertutup di '+fx+','+fy+' oleh '+(el?el.tagName+'.'+el.className:'-'));}
   return out;});
  for(const p of c)failures.push(`${width}px C: ${p}`);
  // pilih dengan keyboard (ArrowDown + Enter) lalu ketik bebas
  await input.press('ArrowDown');await input.press('ArrowDown');await input.press('Enter');await page.waitForTimeout(200);
  const picked=await input.inputValue();if(picked!=='STEM')failures.push(`${width}px C: pilih dengan keyboard seharusnya STEM, hasil '${picked}'`);
  await input.fill('');await input.type('Rekan Baru');await input.press('Enter');await page.waitForTimeout(200);
  if((await input.inputValue())!=='Rekan Baru')failures.push(`${width}px C: ketik bebas tidak diterima`);
  // pilih dengan mouse
  const input2=page.locator('.activity-table .pic-input:not([disabled])').nth(1);await input2.scrollIntoViewIfNeeded();await input2.click();await page.waitForTimeout(300);
  const opt=page.locator('.pic-pop li[data-v]:visible').nth(2);if(await opt.count()){const v=await opt.getAttribute('data-v');await opt.click();await page.waitForTimeout(200);if(!(await input2.inputValue()))failures.push(`${width}px C: pilih dengan mouse tidak mengisi PIC (${v})`);}
  else failures.push(`${width}px C: tidak ada opsi untuk diklik mouse`);
 }
 if(errors.length)failures.push('galat JS: '+errors.slice(0,3).join(' | '));
 if(writes.length)failures.push('tulis ke server tidak diharapkan: '+writes.slice(0,3).join(','));
 await context.close();
} finally { await browser.close(); }
assert.deepEqual([...new Set(failures)],[],[...new Set(failures)].join('\n'));
console.log('schedule regression ok');
