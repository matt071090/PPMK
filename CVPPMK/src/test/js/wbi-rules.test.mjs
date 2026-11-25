import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';
// Aturan Check List khusus WBI (config "rules"): ID TKU kosong = info (bawaan 000000), numbering series membaca prefix. CV identik.
{const store=new Map();globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))};globalThis.document={addEventListener(){},getElementById(){return null;}};}
const STATIC='../../main/resources/static/';
const {company}=await import(STATIC+'js/company.js');
const {PAGES}=await import(STATIC+'js/pages/general.js');
const ui=await import(STATIC+'js/ui.js');
const cfg=JSON.parse(readFileSync(new URL('../../main/resources/company/wbi.json',import.meta.url),'utf8'));
const wbi=()=>{company.rules=cfg.rules;};const cv=()=>{company.rules=[];};
const tbl=(columns,rows=[])=>({columns,rows});

test('config WBI mengaktifkan tiga aturan, CV tidak punya',()=>{assert.deepEqual(cfg.rules,['idtku-default','series-prefix','item-paging']);cv();assert.deepEqual(company.rules,[]);});

// ---- ID TKU
const compD=tku=>({company:{...tbl(['Street','City','Phone1','E_Mail','AliasName','TaxIdNum','U_STEM_IDTKU','RevOffice'],[['Jl A','Kota','1','a@b.c','ALS','01.234',tku,'KPP']]),udf:[{col:'U_STEM_IDTKU'}]}});
const chk=d=>PAGES['company-details'].checks(d);
test('WBI: ID TKU kosong bukan peringatan, jadi info "memakai bawaan 000000"',()=>{
  wbi();const c=chk(compD(null));
  assert.ok(!c.some(([lv])=>lv==='warn'),JSON.stringify(c));
  assert.ok(c.some(([lv,m])=>lv==='info'&&m.includes('000000')));
  assert.match(PAGES['company-details'].render(compD(null)),/memakai bawaan 000000/);
});
test('WBI: ID TKU terisi tampil apa adanya, tanpa info; NPWP kosong tetap peringatan',()=>{
  wbi();assert.deepEqual(chk(compD('1234567890123456')),[]);
  const d=compD('1');d.company.rows[0][5]=null;assert.ok(chk(d).some(([lv,m])=>lv==='warn'&&m.includes('NPWP')));
});
test('CV: ID TKU kosong tetap peringatan Accounting Data dan tanpa teks bawaan',()=>{
  cv();const c=chk(compD(null));
  assert.ok(c.some(([lv,m])=>lv==='warn'&&m.includes('ID TKU')),JSON.stringify(c));
  assert.ok(!PAGES['company-details'].render(compD(null)).includes('memakai bawaan'));
});

// ---- Numbering Series
const S=(Series,SeriesName,ObjectCode,InitialNum,LastNum,Prefix,Suffix='',DocSubType='C')=>[Series,SeriesName,ObjectCode,DocSubType,'N',InitialNum,InitialNum,LastNum,null,'WBI','26','N','',Prefix,Suffix];
const COLS=['Series','SeriesName','ObjectCode','DocSubType','IsManual','InitialNum','NextNumber','LastNum','BPLId','BPLName','Indicator','Locked','Remark','Prefix','Suffix'];
const serD=rows=>({series:tbl(COLS,rows)});
const bad=d=>PAGES['document-numbering'].checks(d);
const SAME=[S(1,'BPC1','2',1,999,'C-1'),S(2,'BPC2','2',1,999,'C-2'),S(3,'BPC3','2',1,999,'C-3'),
  S(10,'PROD49','202',1000,1999,''),S(11,'PROD50','202',1500,2500,'')];
test('WBI: range sama dengan prefix berbeda tidak bentrok; PROD tanpa prefix yang tumpang tindih tetap terdeteksi',()=>{
  wbi();const html=PAGES['document-numbering'].render(serD(SAME));
  assert.match(html,/Range nomor bentrok dengan PROD50/);assert.match(html,/Range nomor bentrok dengan PROD49/);
  assert.ok(!/bentrok dengan BPC/.test(html));
  assert.match(bad(serD(SAME))[0][1],/^2 numbering series/);
});
test('CV: perilaku lama, prefix tidak dibaca (series BP berrange sama tetap dianggap bentrok)',()=>{
  cv();const html=PAGES['document-numbering'].render(serD(SAME));
  assert.match(html,/Range nomor bentrok dengan BPC/);
  assert.match(bad(serD(SAME))[0][1],/^5 numbering series/);
});
test('WBI: prefix sama + range tumpang tindih tetap bentrok',()=>{
  wbi();const r=[S(1,'BPC1','2',1,999,'C-'),S(2,'BPC2','2',500,1500,'C-')];
  assert.match(bad(serD(r))[0][1],/^2 numbering series/);
});
