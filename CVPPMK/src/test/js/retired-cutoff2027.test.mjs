import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';
// Issue "Hapus keperluan Cut off 2027": item dicabut disembunyikan di WBI (config-driven), CV tidak berubah sedikit pun.
// Daftar (searchable) baru digambar saat mount, jadi render halaman diuji dengan jsdom (dilewati bila tidak ada, seperti tes countdoc).
import {pathToFileURL}from'node:url';
let JSDOM;try{({JSDOM}=await import(pathToFileURL(process.env.JSDOM_PATH||'C:/tmp/pd-test-nm/node_modules/jsdom/lib/api.js').href));}catch{}
const skip=!JSDOM&&'jsdom tidak tersedia';
if(JSDOM){const dom=new JSDOM('<!doctype html><body><article id="a"></article></body>',{url:'http://localhost/'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;}
else{const store=new Map();globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))};globalThis.document={addEventListener(){},getElementById(){return null;}};}
const J=u=>JSON.parse(readFileSync(new URL(u,import.meta.url),'utf8'));
const {company}=await import('../../main/resources/static/js/company.js');
const policy=await import('../../main/resources/static/js/data-policy.js');
const {activeAddons,ADDONS}=await import('../../main/resources/static/js/pages/addon-data.js');
const {addonPages}=await import('../../main/resources/static/js/pages/addon.js');
const {extendPages,tableRows,udfRows}=await import('../../main/resources/static/js/pages/addon-sections.js');
const {PAGES}=await import('../../main/resources/static/js/pages/modules.js');
const {flushMounts}=await import('../../main/resources/static/js/ui.js');
const mount=html=>{document.body.innerHTML='<article id="a"></article>';const a=document.getElementById('a');a.innerHTML=html;flushMounts();return a;};
const config=J('../../main/resources/company/wbi.json'),mapping=J('../../main/resources/addon-mapping-wbi.json');
const wbi=(show=false)=>{company.addonCatalogs=config.addons.catalogs;company.addonRules=mapping.rules;policy.capabilities.branchEnabled=true;policy.saveRetiredPreference(show);};
const cv=()=>{company.addonCatalogs=[];company.addonRules=[];policy.capabilities.branchEnabled=true;policy.saveRetiredPreference(false);};
const table=(columns,rows)=>({columns,rows});
const RET_UDO=['ST_MR_DOCWEB','ST_VOUCHER','ST_VOUCHERMAP','ST_VOUCHERTYPE','ST_INTERNALRECON','ST_BANKUPLOAD'];
const KIDS={ST_MR_DOCWEB:['H','D'],ST_VOUCHER:['H','D'],ST_VOUCHERMAP:['H','D'],ST_VOUCHERTYPE:[''],ST_INTERNALRECON:['H','D','D2','D3'],ST_BANKUPLOAD:['H','D']};
const RET_TABLES=Object.entries(KIDS).flatMap(([c,k])=>k.map(x=>c+x));
const obj=(code,rows,tables)=>({code,name:code,kind:'d',shown:true,cat:'X',rowCount:rows,tables:(tables||[code+'H',code+'D']).map(name=>({name}))});
const objects=()=>[obj('ST_PARAM',175,['ST_PARAM']),obj('ST_UDRTH',240,['ST_UDRTH','ST_UDRT1']),obj('STEM_UNUSED',0,['STEM_UNUSED']),
  ...RET_UDO.map(c=>obj(c,c==='ST_BANKUPLOAD'?5:0,KIDS[c].map(x=>c+x)))];
const ids=list=>list.map(p=>p.addon);

test('config WBI: enam UDO + 13 tabel masuk kategori Dicabut lewat mapping, ST_VOUCHERTYPE hilang dari katalog Retail',()=>{
  assert.ok(mapping.categories.includes('Dicabut (Cut off 2027)'));
  const rule=mapping.rules.find(r=>r.retired&&r.prefixes.length);
  assert.equal(rule.cat,'Dicabut (Cut off 2027)');assert.equal(rule.hide,undefined);
  assert.deepEqual([...rule.prefixes].sort(),['ST_BANKUPLOAD','ST_INTERNALRECON','ST_MR_DOCWEB','ST_VOUCHER']);
  // tiap prefix tepat satu kali di seluruh mapping (tidak ada rule lama yang memperebutkannya)
  for(const p of rule.prefixes)assert.equal(mapping.rules.flatMap(r=>r.prefixes).filter(x=>x===p).length,1,p);
  assert.equal(RET_TABLES.length,13);
  assert.ok(!JSON.stringify(config).includes('ST_VOUCHERTYPE'));
  const retail=config.addons.catalogs.find(c=>c.id==='retail');assert.equal(retail.tables.length,20);assert.ok(retail.tables.includes('ST_PLCATEGORY'));
  assert.deepEqual(mapping.rules.find(r=>r.fields).fields,['JDT1.U_STEM_UsedInterRecon','BTF1.U_STEM_UsedInterRecon','AJD1.U_STEM_UsedInterRecon']);
});
test('WBI: semua tabel dicabut dikenali; tabel tetap (retail/web/attachment) tidak',()=>{
  wbi();for(const t of RET_TABLES)assert.equal(policy.retiredAddonTable(t),true,t);
  for(const t of ['ST_PLCATEGORY','ST_PRICEH','ST_ITR_DOCWEBH','ST_GRPO_DOCWEBH','STEM_PETTYCASHCAT','ST_PARAM','ST_CC','ST_COMPMASTER'])assert.equal(policy.retiredAddonTable(t),false,t);
  assert.equal(policy.retiredAddonTable('@ST_VOUCHERH'),true);
});
test('WBI: bab 7 menyembunyikan enam UDO bawaan (walau berisi), tanpa status review; toggle menampilkan tanpa dihitung',()=>{
  wbi(false);let p=addonPages(objects(),true);
  assert.deepEqual(ids(p),['ST_PARAM','ST_UDRTH','STEM_UNUSED']);
  assert.equal(policy.reviewableMenus(p).length,2,'STEM_UNUSED kosong tidak dihitung; PARAM+UDRTH dihitung');
  p=addonPages(objects(),false);assert.deepEqual(ids(p),['ST_PARAM','ST_UDRTH']);
  wbi(true);p=addonPages(objects(),false);
  assert.deepEqual(ids(p).sort(),['ST_BANKUPLOAD','ST_INTERNALRECON','ST_MR_DOCWEB','ST_PARAM','ST_UDRTH','ST_VOUCHER','ST_VOUCHERMAP','ST_VOUCHERTYPE'].sort());
  const ret=p.filter(x=>x.retired);assert.equal(ret.length,6);
  for(const x of ret){assert.equal(x.status,null);assert.equal(x.empty,false);}
  assert.equal(policy.reviewableMenus(p).length,2,'pembilang/penyebut sama dengan saat toggle mati');
  assert.equal(policy.retiredAddonObject(objects().find(o=>o.code==='ST_BANKUPLOAD')),true);
  assert.equal(policy.retiredAddonObject(objects().find(o=>o.code==='ST_UDRTH')),false);
});
test('WBI: DB baru tanpa tabel dicabut tidak menghasilkan temuan; DB lama (ada tabelnya) juga tidak',()=>{
  wbi();const p={udt:{render:()=>'',checks:()=>[]},udf:{render:()=>'',checks:()=>[]},'sp-validation':{render:()=>'',checks:()=>[]}};extendPages(p);
  const rows=activeAddons().flatMap(a=>a.TABLES.map(t=>t[0]));
  assert.ok(!rows.some(n=>policy.retiredAddonTable(n)));assert.ok(!rows.includes('ST_VOUCHERTYPE'));assert.ok(rows.includes('ST_PLCATEGORY'));
  const present=rows.map(n=>['@'+n,3]),old=RET_TABLES.map(n=>['@'+n,0]);
  for(const addon_rows of [table(['Name','Rows'],present),table(['Name','Rows'],[...present,...old])]){
    const d={addon_rows,addon_params:table(['U_Key','U_Value'],[]),addon_udf:table(['TableID','AliasID'],[])};
    const found=p.udt.checks(d).filter(([,m])=>/ST_VOUCHER|BANKUPLOAD|INTERNALRECON|MR_DOCWEB/.test(m));assert.deepEqual(found,[]);
    assert.ok(!JSON.stringify(activeAddons().flatMap(a=>tableRows(a,d))).match(/ST_VOUCHER|BANKUPLOAD|INTERNALRECON|MR_DOCWEB/));
  }
  const retailBefore=activeAddons().find(a=>a.id==='retail').TABLES.length;assert.equal(retailBefore,20);
});
test('WBI 5.1 UDO: enam UDO disembunyikan dan tidak masuk KPI; toggle menampilkannya bertanda dan KPI tetap',{skip},()=>{
  const udo=table(['Code','Name','TableName','TYPE','MngSeries','CanCancel','CanLog','ChildTables','Rows'],[
    ['ST_UDRTH','Route','ST_UDRTH','1','N','Y','Y','ST_UDRT1',240],['ST_PARAM','Parameter','ST_PARAM','1','N','N','N','',175],
    ...RET_UDO.map(c=>[c,c,c+(KIDS[c][0]===''?'':'H'),c==='ST_VOUCHERTYPE'?'1':'3','N','N','N','',c==='ST_BANKUPLOAD'?5:0])]);
  wbi(false);let a=mount(PAGES.udo.render({udo}));
  assert.ok(!/ST_(MR_DOCWEB|VOUCHER|INTERNALRECON|BANKUPLOAD)/.test(a.textContent),'enam UDO tersembunyi');assert.ok(a.textContent.includes('ST_UDRTH')&&a.textContent.includes('ST_PARAM'));
  assert.match(a.textContent,/6 item dicabut \(Cut off 2027\) disembunyikan/);assert.ok(a.querySelector('input[data-retired-toggle]')&&!a.querySelector('input[data-retired-toggle]').checked);
  assert.match(a.innerHTML,/<b>2<\/b><span>UDO ditampilkan/);
  wbi(true);a=mount(PAGES.udo.render({udo}));
  for(const c of RET_UDO)assert.ok(a.textContent.includes(c),c+' terlihat saat toggle');
  assert.match(a.textContent,/6 item dicabut \(Cut off 2027\) ditampilkan/);assert.equal(a.querySelector('input[data-retired-toggle]').checked,true);
  assert.match(a.innerHTML,/<b>2<\/b><span>UDO ditampilkan/,'KPI tidak menghitung yang dicabut');assert.equal(a.querySelectorAll('tbody .badge.retired').length,6);
});
test('WBI 5.2 UDT: 13 tabel dicabut hilang dari daftar; tabel lain tetap; toggle menampilkan',{skip},()=>{
  const udt=table(['TableName','Descr','ObjectType','FieldCount','UdoCode','UdoChildOf'],[['ST_PARAM','P','0',3,'',''],['ST_PLCATEGORY','K','0',3,'',''],...RET_TABLES.map(t=>[t,t,'0',3,'',''])]);
  const d={udt,addon_rows:table(['Name','Rows'],[['@ST_PARAM',9],['@ST_PLCATEGORY',4],...RET_TABLES.map(t=>['@'+t,t==='ST_BANKUPLOADH'?5:0])]),addon_params:table(['U_Key','U_Value'],[])};
  wbi(false);let a=mount(PAGES.udt.render(d));
  assert.ok(a.textContent.includes('@ST_PARAM')&&a.textContent.includes('@ST_PLCATEGORY'));assert.ok(!/ST_(MR_DOCWEB|VOUCHER|INTERNALRECON|BANKUPLOAD)/.test(a.textContent));
  assert.match(a.textContent,/13 item dicabut \(Cut off 2027\) disembunyikan/);
  wbi(true);a=mount(PAGES.udt.render(d));
  for(const t of RET_TABLES)assert.ok(a.textContent.includes('@'+t),t+' terlihat');assert.match(a.textContent,/13 item dicabut \(Cut off 2027\) ditampilkan/);
});
const F=(t,f)=>[t,f,f,'A',10,'','N'];
const udfFields=()=>table(['TableID','Field','Descr','TypeID','SizeID','Dflt','NotNull'],[
  F('JDT1','U_STEM_UsedInterRecon'),F('BTF1','U_STEM_UsedInterRecon'),F('AJD1','U_STEM_UsedInterRecon'),F('JDT1','U_STEM_GUID_INT'),
  F('OJDT','U_STEM_PaymentSource'),F('OBTF','U_STEM_PaymentSource'),F('OJDT','U_STEM_GUID'),F('ORCT','U_ST_BankAccType'),F('OVPM','U_ST_BankAccType'),F('OPDF','U_ST_BankAccType'),
  F('OPDF','U_RealPath'),F('OPDF','U_WebPath'),F('OPDF','U_ST_RealPath'),F('OPDF','U_ST_WebPath')]);
const KEPT=['U_STEM_PaymentSource','U_ST_BankAccType','U_RealPath','U_WebPath','U_ST_RealPath','U_ST_WebPath','U_STEM_GUID','U_STEM_GUID_INT'];
test('WBI 5.3 UDF: U_STEM_UsedInterRecon (JDT1/BTF1/AJD1) disembunyikan; semua UDF yang tetap tampil dan dihitung',{skip},()=>{
  wbi(false);let html=mount(PAGES.udf.render({fields:udfFields(),addon_udf:table(['TableID','AliasID'],[])})).innerHTML;
  assert.ok(!html.includes('UsedInterRecon'));for(const f of KEPT)assert.ok(html.includes(f),f+' tetap tampil');
  assert.match(html,/1 item dicabut \(Cut off 2027\) disembunyikan/);
  const kpiOff=html.match(/<b>(\d+)<\/b><span>UDF</)[1];
  wbi(true);html=PAGES.udf.render({fields:udfFields(),addon_udf:table(['TableID','AliasID'],[])});
  assert.ok(html.includes('UsedInterRecon'));assert.match(html,/1 item dicabut \(Cut off 2027\) ditampilkan/);for(const f of KEPT)assert.ok(html.includes(f));
  assert.equal(html.match(/<b>(\d+)<\/b><span>UDF</)[1],kpiOff,'KPI UDF tidak menghitung yang dicabut');
  assert.equal(policy.retiredAddonField('JDT1','U_STEM_UsedInterRecon'),true);assert.equal(policy.retiredAddonField('OJDT','U_STEM_PaymentSource'),false);
  assert.equal(policy.retiredAddonField('OJDT','U_STEM_UsedInterRecon'),false,'hanya tabel yang tercantum');
});
test('WBI: katalog UDF addon tidak memuat UDF dicabut dan UDF kebutuhan tetap sama',()=>{
  wbi();const stem=activeAddons().find(a=>a.id==='stem');
  assert.ok(!stem.UDFS.some(([t,a])=>policy.retiredAddonField(t,'U_'+a)));
  company.addonRules=mapping.rules.filter(r=>!r.retired);
  assert.equal(activeAddons().find(a=>a.id==='stem').UDFS.length,stem.UDFS.length,'tidak ada UDF katalog yang ikut terbuang');
});
test('CV (tanpa rule company): katalog, daftar, hitungan dan halaman identik; tidak ada catatan/toggle',{skip},()=>{
  cv();assert.strictEqual(activeAddons(),ADDONS);
  assert.equal(policy.retiredAddonTable('ST_VOUCHER'),false);assert.equal(policy.retiredAddonField('JDT1','U_STEM_UsedInterRecon'),false);
  assert.equal(policy.retiredNotice(0),'');
  const p=addonPages(objects(),true);
  assert.equal(p.length,objects().length,'tidak ada UDO tersaring di CV');assert.ok(p.every(x=>x.retired===false));
  assert.equal(policy.reviewableMenus(p).length,p.filter(x=>x.status&&!x.empty).length);
  const udo=table(['Code','Name','TableName','TYPE','MngSeries','CanCancel','CanLog','ChildTables','Rows'],[['ST_VOUCHER','Voucher','ST_VOUCHERH','3','N','N','N','',0],['ST_PARAM','P','ST_PARAM','1','N','N','N','',2]]);
  let html=mount(PAGES.udo.render({udo})).innerHTML;assert.ok(html.includes('@ST_VOUCHERH'));assert.ok(!/dicabut|data-retired-toggle|badge retired/.test(html));
  assert.match(html,/<b>2<\/b><span>UDO ditampilkan/,'ST_VOUCHER tetap dihitung seperti sebelumnya');
  html=mount(PAGES.udf.render({fields:udfFields(),addon_udf:table(['TableID','AliasID'],[])})).innerHTML;assert.ok(html.includes('UsedInterRecon'));assert.ok(!/dicabut|data-retired-toggle/.test(html));
  html=mount(PAGES.udt.render({udt:table(['TableName','Descr','ObjectType','FieldCount','UdoCode','UdoChildOf'],[['ST_VOUCHERTYPE','T','0',1,'','']]),addon_rows:table(['Name','Rows'],[['@ST_VOUCHERTYPE',3]]),addon_params:table(['U_Key'],[])})).innerHTML;
  assert.ok(html.includes('@ST_VOUCHERTYPE'));assert.ok(!/dicabut|data-retired-toggle/.test(html));
});
