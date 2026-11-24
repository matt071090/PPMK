// Tombol Diskusi menempel di tepi kanan dan tidak menutupi apa pun: di area tombol, elemen teratas selain tombol adalah lajur kosong konten (main.content).
// Jalankan: preview fixture umum (PREVIEW_PORT, default 18635) dan preview admin untuk Setup (SETUP_PORT, default 18636, PREVIEW_ADMIN=1).
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const pw=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');const chromium=pw.chromium||pw.default.chromium;
const port=process.env.PREVIEW_PORT||18635,setupPort=process.env.SETUP_PORT||18636;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const failures=[];
try {
 const context=await browser.newContext({viewport:{width:1440,height:900},timezoneId:'Asia/Jakarta'});
 await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 const page=await context.newPage();
 for(const [url,p] of [['schedule.html#/ringkasan',port],['schedule.html#/stock',port],['schedule.html#/master',port],['setup.html',setupPort]]) for(const width of [1440,1024,390]) {
  await page.setViewportSize({width,height:900});
  await page.goto(`http://127.0.0.1:${p}/${url}`);await page.waitForSelector('.chat-fab');await page.waitForTimeout(800);
  const total=await page.evaluate(()=>document.documentElement.scrollHeight);
  for(let y=0;y<=total;y+=500) {
   await page.evaluate(y=>window.scrollTo(0,y),y);await page.waitForTimeout(80);
   const bad=await page.evaluate(()=>{
    const fab=document.querySelector('.chat-fab'),r=fab.getBoundingClientRect(),out=[];
    if(!document.body.classList.contains('has-chat-dock'))out.push('lajur konten untuk tombol tidak aktif');
    if(r.right>innerWidth+1||r.left<0)out.push('tombol keluar layar');
    if(fab.tabIndex<0)out.push('tombol tidak bisa difokus');
    fab.style.visibility='hidden';
    const content=document.querySelector('main.content');
    for(let i=0;i<=4;i++)for(let j=0;j<=6;j++){
     const el=document.elementFromPoint(r.left+1+(r.width-2)*i/4,r.top+1+(r.height-2)*j/6);
     if(el&&el!==content&&!/^(HTML|BODY)$/.test(el.tagName)&&!el.classList.contains('shell')&&!el.classList.contains('chat-fab'))out.push('menutupi: '+el.tagName.toLowerCase()+'.'+String(el.className).slice(0,30)+' "'+(el.textContent||'').trim().slice(0,20)+'"');
    }
    fab.style.visibility='';
    return [...new Set(out)];
   });
   for(const b of bad)failures.push(`${url} ${width}px y=${y}: ${b}`);
  }
 }
 await context.close();
} finally { await browser.close(); }
assert.deepEqual([...new Set(failures)],[],[...new Set(failures)].join('\n'));
console.log('fab dock ok');
