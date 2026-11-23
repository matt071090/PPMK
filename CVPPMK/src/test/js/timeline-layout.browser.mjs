// Tata letak garis waktu di 1440/1024/390 px: tidak ada tumpang tindih, kartu satu baris sama tinggi, teks tidak terpotong, tanpa geser samping.
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
   const problems=await page.evaluate(()=>{
    const out=[],shell=document.querySelector('#view .timeline-shell');
    const rect=e=>e.getBoundingClientRect(),shown=e=>{const r=rect(e);return r.width>0&&r.height>0;};
    if(shell.scrollWidth>shell.clientWidth+1)out.push('geser samping di garis waktu');
    if(document.documentElement.scrollWidth>innerWidth+1)out.push('halaman bergeser ke samping');
    const items=[...shell.querySelectorAll('.timeline-card,.timeline-date,.timeline-dot,.timeline-today')].filter(shown);
    for(let i=0;i<items.length;i++)for(let j=i+1;j<items.length;j++){
     const a=rect(items[i]),b=rect(items[j]);
     if(!(a.right<=b.left+.5||b.right<=a.left+.5||a.bottom<=b.top+.5||b.bottom<=a.top+.5))out.push(`tumpang tindih: ${items[i].className} dan ${items[j].className}`);
    }
    const rows=new Map();
    for(const c of shell.querySelectorAll('.timeline-card')){if(!shown(c))continue;const r=rect(c);const k=Math.round(r.top);rows.set(k,[...(rows.get(k)||[]),r.height]);}
    if(innerWidth>=640)for(const [k,h] of rows)if(Math.max(...h)-Math.min(...h)>1)out.push(`tinggi kartu tidak seragam di baris y=${k}`);
    for(const n of shell.querySelectorAll('.timeline-card,.timeline-note,.timeline-card b'))if(n.scrollHeight>n.clientHeight+1||n.scrollWidth>n.clientWidth+1)out.push('teks terpotong: '+n.textContent.trim().slice(0,30));
    return out;
   });
   for(const p of problems)failures.push(`${today} ${tab} ${width}px: ${p}`);
  }
  await context.close();
 }
} finally { await browser.close(); }
assert.deepEqual(failures,[],failures.join('\n'));
console.log('timeline layout ok');
