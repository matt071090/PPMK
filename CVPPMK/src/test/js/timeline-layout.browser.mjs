// Garis waktu Schedule (SATU sumbu menerus, geser di dalam wadah) di 1440/1024/390 px:
// tanpa tumpang tindih, kartu satu sisi sama tinggi, teks tidak terpotong, semua titik satu garis, warna per kategori, legenda, petunjuk geser, fokus keyboard.
// Jalankan preview fixture (npm run preview) lalu: node src/test/js/timeline-layout.browser.mjs
// Env: PLAYWRIGHT_MODULE (jalur modul playwright), CHROME_PATH (browser), PREVIEW_PORT (default 18635).
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const pw=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');const chromium=pw.chromium||pw.default.chromium;
const port=process.env.PREVIEW_PORT||18635;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const failures=[];
try {
 for(const today of ['2026-11-23','2026-12-01','2026-12-20','2027-01-10']) {
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Jakarta'});
  await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await context.addInitScript(d=>{const D=Date,now=D.parse(d+'T09:00:00+07:00');window.Date=class extends D{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}};try{localStorage.clear();}catch{}},today);
  const page=await context.newPage();
  for(const tab of ['ringkasan','stock','balance','master']) for(const width of [1440,1024,390]) {
   await page.setViewportSize({width,height:1000});
   await page.goto(`http://127.0.0.1:${port}/schedule.html#/${tab}`);
   await page.waitForSelector('#view .timeline-shell');await page.waitForTimeout(300);
   await page.evaluate(()=>document.querySelectorAll('.chat-fab').forEach(e=>e.style.visibility='hidden'));
   const check=async()=>page.evaluate(({tab})=>{
    const out=[],shell=document.querySelector('#view .timeline-shell'),wrap=shell.closest('.timeline-wrap'),desktop=innerWidth>=640;
    const rect=e=>e.getBoundingClientRect(),shown=e=>{const r=rect(e);return r.width>0&&r.height>0;};
    if(document.documentElement.scrollWidth>innerWidth+1)out.push('halaman bergeser ke samping');
    if(!desktop&&shell.scrollWidth>shell.clientWidth+1)out.push('HP: garis waktu bergeser ke samping');
    const items=[...shell.querySelectorAll('.timeline-card,.timeline-date,.timeline-dot,.timeline-today')].filter(shown);
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
     const a=rect(items[i]),b=rect(items[j]);
     if(!(a.right<=b.left+.5||b.right<=a.left+.5||a.bottom<=b.top+.5||b.bottom<=a.top+.5))out.push(`tumpang tindih: ${items[i].className} dan ${items[j].className}`);
    }
    const lis=[...shell.querySelectorAll('.timeline > li')];
    if(desktop){
     const ys=lis.map(l=>{const r=rect(l.querySelector('.timeline-dot'));return r.top+r.height/2;});
     if(Math.max(...ys)-Math.min(...ys)>1)out.push('titik tidak satu garis (sumbu tunggal)');
     const axis=getComputedStyle(shell.querySelector('.timeline'),'::before');
     if(axis.height!=='2px')out.push('sumbu menerus tidak ada');
     for(const side of ['above','below']){const hs=lis.filter(l=>l.classList.contains(side)).map(l=>rect(l.querySelector('.timeline-card')).height);if(hs.length&&Math.max(...hs)-Math.min(...hs)>1)out.push('tinggi kartu '+side+' tidak seragam');}
     if(getComputedStyle(shell).scrollSnapType.indexOf('x')<0)out.push('scroll-snap tidak aktif');
     if(shell.scrollWidth>shell.clientWidth+1&&wrap.querySelector('.tl-scroll').hidden)out.push('petunjuk geser tidak tampil padahal bisa digeser');
    }
    for(const n of shell.querySelectorAll('.timeline-card,.timeline-note,.timeline-card b'))if(n.scrollHeight>n.clientHeight+1||n.scrollWidth>n.clientWidth+1)out.push('teks terpotong: '+n.textContent.trim().slice(0,30));
    if(lis.some(l=>!/\bcat-[a-z]+\b/.test(l.className)))out.push('titik tanpa kategori');
    if(tab==='ringkasan'){
     const colors=new Set(lis.map(l=>getComputedStyle(l.querySelector('.timeline-card')).backgroundImage.split(')')[0]+getComputedStyle(l.querySelector('.timeline-date')).color));
     if(colors.size<4)out.push('warna kategori kurang beragam: '+colors.size);
     if(!wrap.querySelector('.tl-legend li'))out.push('legenda kategori tidak ada');
    }
    const first=shell.querySelector('.timeline-card');first.focus();if(document.activeElement!==first)out.push('kartu tidak bisa difokus');
    if(shell.tabIndex<0)out.push('wadah geser tidak bisa difokus keyboard');
    return out;
   },{tab});
   for(const p of await check())failures.push(`${today} ${tab} ${width}px: ${p}`);
   // setelah digeser ke ujung kanan, tata letak tetap bersih
   await page.evaluate(()=>{const s=document.querySelector('#view .timeline-shell');s.scrollLeft=s.scrollWidth;});await page.waitForTimeout(150);
   for(const p of await check())failures.push(`${today} ${tab} ${width}px (geser ke ujung): ${p}`);
  }
  await context.close();
 }
} finally { await browser.close(); }
assert.deepEqual([...new Set(failures)],[],[...new Set(failures)].join('\n'));
console.log('timeline layout ok');
