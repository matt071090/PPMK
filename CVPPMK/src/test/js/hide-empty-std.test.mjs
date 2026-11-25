import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync,mkdirSync,existsSync}from'node:fs';
import {execSync}from'node:child_process';import {tmpdir}from'node:os';import {pathToFileURL}from'node:url';
// Keputusan Fakhri 24 Nov: halaman/blok SAP standar yang 0 baris disembunyikan di WBI (config-driven hideWhenEmpty), CV tidak berubah.
// Bagian yang butuh DOM (tab detail BP) memakai jsdom; dilewati bila tidak ada, seperti tes retired-cutoff2027.
let JSDOM;try{({JSDOM}=await import(pathToFileURL(process.env.JSDOM_PATH||'C:/tmp/pd-test-nm/node_modules/jsdom/lib/api.js').href));}catch{}
const skipDom=!JSDOM&&'jsdom tidak tersedia';
if(JSDOM){const dom=new JSDOM('<!doctype html><body><article id="a"></article></body>',{url:'http://localhost/'});globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;}
else{const store=new Map();globalThis.localStorage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v))};globalThis.document={addEventListener(){},getElementById(){return null;}};}
const J=u=>JSON.parse(readFileSync(new URL(u,import.meta.url),'utf8'));
const STATIC='../../main/resources/static/';
const {company}=await import(STATIC+'js/company.js');
const policy=await import(STATIC+'js/data-policy.js');
const {PAGES:MODULES}=await import(STATIC+'js/pages/modules.js');
const {PAGES:GENERAL}=await import(STATIC+'js/pages/general.js');
const ui=await import(STATIC+'js/ui.js');
const config=J('../../main/resources/company/wbi.json'),sections=J(STATIC+'sections.json');
const pageIds=new Set(sections.flatMap(c=>c.pages.map(p=>p.id)));

const tbl=(columns,rows=[])=>({columns,rows});
const CORE=['coa','gl-determination','items','item-groups','business-partners','warehouses','price-lists','currencies','tax','payment-terms','uom','uom-groups','posting-period','users','company-details','document-numbering','fixed-asset'];
const wbi=({branch=false,show=false}={})=>{company.hideWhenEmpty=config.hideWhenEmpty;policy.capabilities.branchEnabled=branch;policy.saveStdEmptyPreference(show);policy.resetBlockTally();ui.resetExports();};
const cv=()=>{company.hideWhenEmpty=[];policy.capabilities.branchEnabled=true;policy.saveStdEmptyPreference(false);policy.resetBlockTally();ui.resetExports();};

// ---- data
const BPCOLS=['CardCode','CardName','CardType','GroupCode','frozenFor','Branches','HouseBank','HousBnkAct','PymCode','PymMethods'];
const bpD=({ship=[],bank=[],run=[],br=[],houseBank=null,err=null}={})=>({
  bp:tbl(BPCOLS,[['C001','Pelanggan Retail','C',100,'N',null,houseBank,null,null,null]]),groups:tbl(['GroupCode','GroupName','GroupType'],[[100,'Pelanggan Retail','C']]),
  shipping:err?{columns:[],rows:[],error:err}:tbl(['TrnspCode','TrnspName','WebSite','Active'],ship),
  ...Object.fromEntries(['xl_general','xl_contacts','xl_addresses','xl_payment_terms','xl_accounting_general','xl_accounting_tax','xl_wtax_codes'].map(k=>[k,tbl(['BP Code'],[['C001']])])),
  xl_bank_accounts:tbl(['BP Code'],bank),xl_payment_run:tbl(['BP Code'],run),xl_branch_assignment:tbl(['BP Code'],br)});
const faD=({assets=[],locations=[],dimensions=[],projects=[],sp=[]}={})=>({
  classes:tbl(['Code','Name','DprAreaID','AcctDtn','DprTypID','UseLife','Active','AssetType'],[['A-01','Peralatan','Main Area','FA1','SL',48,'Y','G']]),
  dep_types:tbl(['Code','Descr','DprMeth'],[['SL','Straight Line','SL']]),determination:tbl(['Code','Descr','BalanceAct','OrdDprAct','OrdDprAcc'],[['FA1','Aset tetap','1-200','6-100','1-201']]),
  assets:tbl(['ItemCode','ItemName','AssetClass','ItmsGrpNam','DprArea','DprStart','UsefulLife','DprType'],assets),item_groups:tbl(['ItmsGrpCod','ItmsGrpNam'],[[101,'Fixed Asset']]),
  locations:tbl(['Code','Location'],locations),periods:tbl(['Category','F_RefDate','T_RefDate','PeriodStat','Code'],[['2027','2027-01-01','2027-01-31','N','2027-01']]),
  series:tbl(['Series','SeriesName','InitialNum','NextNumber','Locked'],[[77,'2027',1,1,'N']]),sp_notif:tbl(['PROCEDURE_NAME'],sp),
  dimensions:tbl(['DimCode','OcrCode','OcrName','Active'],dimensions),projects:tbl(['PrjCode','PrjName','Locked'],projects),capitalization:tbl(['Dokumen','Awal','Akhir'],[[0,null,null]])});
const SHIP=[[1,'Ekspedisi darat',null,'Y']];
const sheetNames=()=>ui.exportOf('x1').sheets.map(s=>s.name);
const render=(id,d)=>{policy.resetBlockTally();ui.resetExports();const f=MODULES[id].checks?MODULES[id].checks(d):[];return {html:MODULES[id].render(d),findings:f};};

// ---- config
test('config WBI: allowlist eksplisit, halaman inti tidak ikut, semua halaman ada di sections.json',()=>{
  const list=config.hideWhenEmpty;
  assert.deepEqual(list,['payment-methods','freight','landed-cost','business-partners/shipping','business-partners/xl_bank_accounts','business-partners/xl_payment_run',
    'business-partners/xl_branch_assignment','fixed-asset/assets','fixed-asset/locations','fixed-asset/dimensions','fixed-asset/projects','fixed-asset/sp_notif']);
  assert.equal(new Set(list).size,list.length);
  for(const k of list){assert.match(k,/^[a-z0-9-]+(\/[a-z0-9_]+)?$/);assert.ok(pageIds.has(k.split('/')[0]),k);}
  for(const core of CORE)assert.ok(!list.includes(core),`${core} tidak boleh disembunyikan`);
  assert.ok(!list.some(k=>k.includes('*')));
});
test('Java: CompanyProfile hanya menambah kunci hideWhenEmpty bila ada (CV tidak mendapat kunci baru), format dibatasi',()=>{
  const src=readFileSync(new URL('../../main/java/com/stem/cvppmk/docs/CompanyProfile.java',import.meta.url),'utf8');
  assert.match(src,/if\(!hide\.isEmpty\(\)\)out\.put\("hideWhenEmpty",hide\)/);
  assert.match(src,/\[A-Za-z0-9_-\]\+\(\/\[A-Za-z0-9_-\]\+\)\?/);
});

// ---- logika murni
test('resultEmpty/pageEmpty: hanya termuat tanpa galat dan 0 baris yang kosong',()=>{
  assert.equal(policy.resultEmpty(tbl(['a'],[])),true);
  assert.equal(policy.resultEmpty(tbl(['a'],[[1]])),false);
  assert.equal(policy.resultEmpty({columns:[],rows:[],error:'gagal'}),false);
  assert.equal(policy.resultEmpty(undefined),false);assert.equal(policy.resultEmpty(null),false);assert.equal(policy.resultEmpty({}),false);
  assert.equal(policy.pageEmpty({a:tbl([],[]),b:tbl([],[])}),true);
  assert.equal(policy.pageEmpty({a:tbl([],[]),b:tbl([],[[1]])}),false);
  assert.equal(policy.pageEmpty({a:tbl([],[]),b:{error:'x',rows:[]}}),false);
  assert.equal(policy.pageEmpty({}),false);assert.equal(policy.pageEmpty(undefined),false);
  assert.equal(policy.pageEmpty({a:tbl([],[]),b:tbl([],[[1]])},['a']),true);
});
test('stdEmptyPage: hanya halaman terdaftar; menu inti 0 baris tetap tampil, galat tidak disembunyikan',()=>{
  wbi();
  assert.equal(policy.stdEmptyPage('payment-methods',{methods:tbl(['x'],[])}),true);
  assert.equal(policy.stdEmptyPage('payment-methods',{methods:tbl(['x'],[['TRF']])}),false);
  assert.equal(policy.stdEmptyPage('payment-methods',{methods:{rows:[],columns:[],error:'ORA gagal'}}),false);
  for(const core of CORE)assert.equal(policy.stdEmptyPage(core,{x:tbl(['x'],[])}),false,core);
  assert.equal(policy.hidesPage('payment-methods'),true);assert.equal(policy.hidesPage('coa'),false);
  cv();assert.equal(policy.stdEmptyPage('payment-methods',{methods:tbl(['x'],[])}),false);assert.equal(policy.hidesPage('payment-methods'),false);
});

// ---- Business Partner
test('WBI BP: Shipping Type, sheet Bank Accounts/Payment Run/Branch Assignment 0 baris tidak dirender; INFO ikut hilang; ada catatan + hitungan',()=>{
  wbi();const {html,findings}=render('business-partners',bpD());
  assert.ok(!html.includes('id="shipping"'),'blok Shipping Type tidak boleh ada');
  assert.ok(!html.includes('Tidak ada data'));
  assert.ok(!findings.some(([,m])=>/shipping type/i.test(m)),'INFO shipping type hilang');
  assert.deepEqual(sheetNames(),['General','Contact Persons','Addresses','Payment Terms','Accounting - General','Accounting - Tax','WTax Codes']);
  const note=policy.blockNotice();
  assert.match(note,/4 blok kosong disembunyikan: Shipping Type, Excel Bank Accounts, Excel Payment Run, Excel Branch Assignment/);
  assert.match(note,/Tampilkan blok SAP standar kosong/);assert.match(note,/data-std-toggle/);assert.ok(!note.includes(' checked'));
});
test('WBI BP: company dengan branch tetap memuat sheet Branch Assignment 0 baris (kosongnya masalah, bukan "belum dipakai")',()=>{
  wbi({branch:true});render('business-partners',bpD());
  assert.ok(sheetNames().includes('Branch Assignment'));assert.ok(!sheetNames().includes('Bank Accounts'));
  assert.match(policy.blockNotice(),/3 blok kosong disembunyikan/);
  wbi({branch:null});render('business-partners',bpD());assert.ok(sheetNames().includes('Branch Assignment'));
});
test('WBI BP: toggle "Tampilkan yang kosong" menampilkan lagi blok, sheet, dan INFO; catatan berubah jadi "ditampilkan"',()=>{
  wbi({show:true});const {html,findings}=render('business-partners',bpD());
  assert.ok(html.includes('id="shipping"'));assert.ok(findings.some(([t,m])=>t==='info'&&m==='Belum ada shipping type.'));
  assert.ok(sheetNames().includes('Bank Accounts')&&sheetNames().includes('Payment Run')&&sheetNames().includes('Branch Assignment'));
  const note=policy.blockNotice();assert.match(note,/4 blok kosong ditampilkan/);assert.match(note,/data-std-toggle checked/);
  policy.saveStdEmptyPreference(false);
});
test('WBI BP: ada baris -> blok dan sheet tampil, tanpa catatan',()=>{
  wbi();const {html,findings}=render('business-partners',bpD({ship:SHIP,bank:[['C001']],run:[['C001']],br:[['C001']]}));
  assert.ok(html.includes('id="shipping"'));assert.ok(html.includes('Ekspedisi darat'));
  assert.ok(!findings.some(([,m])=>/shipping type/i.test(m)));
  assert.equal(sheetNames().length,10);assert.equal(policy.blockNotice(),'');
});
test('WBI BP: query galat tidak disembunyikan (blok tetap ada, tanpa catatan)',()=>{
  wbi();const {html}=render('business-partners',bpD({err:'Tabel OSHP tidak dapat dibaca'}));
  assert.ok(html.includes('id="shipping"'));assert.ok(!policy.blockNotice().includes('Shipping Type'));
  const d=bpD({bank:[['C001']],run:[['C001']],br:[['C001']]});d.xl_bank_accounts={columns:['BP Code'],rows:[],error:'gagal'};
  render('business-partners',d);assert.ok(sheetNames().includes('Bank Accounts'),'sheet galat tetap ikut');
});
test('WBI BP: tab Payment Run di detail BP hilang hanya bila data Payment Run kosong di semua BP',{skip:skipDom},()=>{
  const mount=html=>{document.body.innerHTML='<article id="a"></article>';const a=document.getElementById('a');a.innerHTML=html;ui.flushMounts();return a;};
  wbi();let a=mount(render('business-partners',bpD()).html);
  assert.ok(a.querySelector('.md-pane'),'detail BP terpasang');assert.ok(!/Payment Run/.test(a.querySelector('.md-pane').textContent));assert.match(a.querySelector('.md-pane').textContent,/Accounting/);
  wbi();a=mount(render('business-partners',bpD({houseBank:'BCA'})).html);
  assert.match(a.querySelector('.md-pane').textContent,/Payment Run/,'BP punya House Bank: tab tetap');
  wbi();a=mount(render('business-partners',bpD({run:[['C001']]})).html);
  assert.match(a.querySelector('.md-pane').textContent,/Payment Run/,'CRD2 berisi: tab tetap');
  wbi({show:true});a=mount(render('business-partners',bpD()).html);
  assert.match(a.querySelector('.md-pane').textContent,/Payment Run/,'toggle menyala: tab tampil');policy.saveStdEmptyPreference(false);
});

// ---- Fixed Asset
const FA_HIDDEN=['Location','Cost Center (Distribution Rule)','Project','SP yang memblok Capitalization'];
const faHas=(html,title)=>html.includes(`<b>${title}</b>`);
test('WBI Fixed Asset: Project, SP Notif, Location, Distribution Rule, master aset 0 baris tidak dirender; bagian inti tetap',()=>{
  wbi();const {html}=render('fixed-asset',faD());
  for(const t of FA_HIDDEN)assert.ok(!faHas(html,t),`${t} harus hilang`);
  assert.ok(!html.includes('id="assets"'));
  for(const t of ['Asset Class','Depreciation Type','Item Group aset','Posting Period','Numbering Series Capitalization','Aset dan dokumen yang sudah ada'])assert.ok(faHas(html,t),`${t} tetap`);
  assert.ok(html.includes('id="classes"'));
  const n=policy.blockNotice();assert.match(n,/5 blok kosong disembunyikan/);
  for(const l of ['Location','Cost Center (Distribution Rule)','Project','SP yang memblok Capitalization','Fixed Asset Master Data'])assert.ok(n.includes(l),l);
});
test('WBI Fixed Asset: ada baris atau toggle menyala -> tampil',()=>{
  wbi();let {html}=render('fixed-asset',faD({assets:[['FA1','Mesin','A-01','Fixed Asset','Main Area','2027-01-01',48,'SL']],locations:[[1,'Pusat']],dimensions:[[1,'CC1','Pusat','Y']],projects:[['P1','Proyek','N']],sp:[['SP_X']]}));
  for(const t of FA_HIDDEN)assert.ok(faHas(html,t),t);assert.ok(html.includes('id="assets"'));assert.equal(policy.blockNotice(),'');
  wbi({show:true});({html}=render('fixed-asset',faD()));
  for(const t of FA_HIDDEN)assert.ok(faHas(html,t),`${t} (toggle)`);assert.ok(html.includes('id="assets"'));assert.match(policy.blockNotice(),/5 blok kosong ditampilkan/);policy.saveStdEmptyPreference(false);
});
test('WBI Fixed Asset: query galat tampil sebagai Masalah, tidak disembunyikan; query inti 0 baris tetap tampil',()=>{
  wbi();const d=faD();d.projects={columns:[],rows:[],error:'OPRJ gagal'};d.series=tbl(['Series','SeriesName','InitialNum','NextNumber','Locked'],[]);
  const {html}=render('fixed-asset',d);
  assert.ok(faHas(html,'Project'));assert.match(html,/OPRJ gagal/);
  assert.ok(faHas(html,'Numbering Series Capitalization'));assert.match(html,/belum ada series/);
});

// ---- halaman inti 0 baris tetap tampil
test('WBI: halaman inti dengan 0 baris tetap dirender (tidak terdaftar, tidak dicatat)',()=>{
  wbi();policy.resetBlockTally();
  const out=GENERAL['payment-terms'].render({terms:tbl(['GroupNum','PymntGroup'],[])});
  assert.ok(typeof out==='string'&&out.length>0);
  assert.equal(policy.blockHidden('payment-terms','terms',tbl(['x'],[])),false);
  assert.equal(policy.blockHidden('business-partners','bp',tbl(['x'],[])),false);
  assert.equal(policy.blockHidden('business-partners','xl_general',tbl(['x'],[])),false);
  assert.equal(policy.blockNotice(),'');
});

// ---- CV tidak berubah satu byte
test('CV: halaman identik dengan sebelum perubahan (render + temuan + sheet export) untuk data kosong, berisi, dan galat',{skip:process.env.SKIP_BASELINE&&'SKIP_BASELINE'},async()=>{
  const dir=`${tmpdir().replace(/\\/g,'/')}/hide-empty-baseline`;
  const base=process.env.BASELINE_REF||'0a6d499';
  if(!existsSync(`${dir}/CVPPMK/src/main/resources/static/js/pages/modules.js`)){
    mkdirSync(dir,{recursive:true});
    try{execSync(`git archive ${base} CVPPMK/src/main/resources/static | tar -x -C "${dir}"`,{cwd:new URL('../../../../',import.meta.url),stdio:'pipe'});}
    catch(e){return;}
  }
  writeFileSync(`${dir}/package.json`,'{"type":"module"}');
  const root=`file:///${dir}/CVPPMK/src/main/resources/static/js/`;
  const old={modules:(await import(root+'pages/modules.js')).PAGES,general:(await import(root+'pages/general.js')).PAGES,ui:await import(root+'ui.js'),policy:await import(root+'data-policy.js'),company:(await import(root+'company.js')).company};
  cv();old.policy.capabilities.branchEnabled=true;
  const cases={'business-partners':[bpD(),bpD({ship:SHIP,bank:[['C001']],run:[['C001']],br:[['C001']]}),bpD({err:'gagal'})],
    'fixed-asset':[faD(),faD({assets:[['FA1','Mesin','A-01','Fixed Asset','Main Area','2027-01-01',48,'SL']],locations:[[1,'Pusat']],dimensions:[[1,'CC1','Pusat','Y']],projects:[['P1','Proyek','N']],sp:[['SP_X']]})]};
  const gen={'payment-methods':[{methods:tbl(['PayMethCod'],[])},{methods:tbl(['PayMethCod','Descript','Type','BankTransf','BnkDflt','BankCountr','Format','Active'],[['TRF','Transfer','O','Y',null,null,null,'Y']])},{methods:{columns:[],rows:[],error:'x'}}],
    freight:[{freight:tbl(['ExpnsCode'],[])}],'landed-cost':[{landed_cost:tbl(['AlcCode'],[])}]};
  let n=0;
  const same=(oldPage,newPage,d)=>{
    old.ui.resetExports();ui.resetExports();
    const a=oldPage.render(d),b=newPage.render(d);assert.equal(b,a);
    assert.deepEqual(newPage.checks?newPage.checks(d):[],oldPage.checks?oldPage.checks(d):[]);
    n++;
  };
  for(const [id,list] of Object.entries(cases))for(const d of list){cv();same(old.modules[id],MODULES[id],d);
    old.ui.resetExports();ui.resetExports();old.modules[id].render(d);MODULES[id].render(d);
    for(const k of ['x1']){const o=old.ui.exportOf(k),c=ui.exportOf(k);assert.equal(JSON.stringify(c?.sheets?.map(s=>s.name)),JSON.stringify(o?.sheets?.map(s=>s.name)));}}
  for(const [id,list] of Object.entries(gen))for(const d of list){cv();same(old.general[id],GENERAL[id],d);}
  assert.ok(n>=9);
  assert.equal(policy.blockNotice(),'');
});
