import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.document={addEventListener(){},getElementById(){return null;}};
const { pageSlice }=await import('../../main/resources/static/js/paging.js');
const policy=await import('../../main/resources/static/js/data-policy.js');
const { ADDONS }=await import('../../main/resources/static/js/pages/addon-data.js');
const { paramRows, tableRows, udfRows, extendPages }=await import('../../main/resources/static/js/pages/addon-sections.js');
const { addonPages }=await import('../../main/resources/static/js/pages/addon.js');
const { fixedCompanyPic }=await import('../../main/resources/static/js/pages/schedule.js');
const table=(columns,rows)=>({columns,rows});
for(const n of [0,1,25,26,50,100,172]) test(`paging ${n}: no loss or duplicates across all pages`,()=>{
 const rows=Array.from({length:n},(_,i)=>i);const p=pageSlice(rows);
 assert.equal(p.size,25);assert.equal(p.from,n?1:0);assert.equal(p.to,Math.min(n,25));
 assert.deepEqual(Array.from({length:p.pages},(_,i)=>pageSlice(rows,i+1).rows).flat(),rows);
 assert.equal(pageSlice(rows,999).page,p.pages);assert.equal(pageSlice(rows,-1).page,1);
});
test('page sizes accept 25/50/100 only; filtering then pageSlice clamps stale page',()=>{
 const rows=Array.from({length:172},(_,i)=>i);
 for(const size of [25,50,100])assert.equal(pageSlice(rows,1,size).rows.length,size);
 assert.equal(pageSlice(rows,1,999).size,25);
 assert.deepEqual(pageSlice(rows.filter(i=>i===171),7).rows,[171]);
});
for(const branches of [true,false,null])test(`branch mode ${branches}: same catalogs preserved or explicitly filtered`,()=>{
 policy.capabilities.branchEnabled=branches;
 for(const addon of ADDONS)for(const kind of ['PARAMS','TABLES','UDFS','PROCS']) {
  const actual=policy.applicable(kind,addon[kind]);
  if(branches!==false)assert.strictEqual(actual,addon[kind]);
  else assert.ok(actual.every(r=>!policy.branchOnly(kind,r)));
 }
 if(branches===false) {
  const keys=paramRows(ADDONS[0],{}).map(r=>r.Key);
  for(const key of ['SAPUSERINT','SAPPWDINT','ITBRACCI','ITBRACCR','ITBRANCHGITYPE','ITBRANCHGRTYPE','ITBRANCHTOLERANCE','SLHOST','ITB_CR_NAME','FILTERITEMBYPROP','INSERTPARAMAUTO'])assert.ok(!keys.includes(key),key);
  assert.ok(keys.includes('WHTRS'));
 }
});
test('zero fields does not imply zero data; missing counts remain visible',()=>{
 assert.equal(policy.addonHasData({rowCount:0}),false);
 assert.equal(policy.addonHasData({rowCount:3}),true);
 assert.equal(policy.addonHasData({}),true);
 assert.equal(policy.emptyDataRow({Code:'A',Name:'Aktif',U_Active:0}),false);
 assert.equal(policy.emptyDataRow({Code:'A',Name:'Aktif',U_Active:null}),true);
 assert.equal(policy.emptyDataRow({Code:'A',Name:'Aktif'}),false);
});
test('blank catalog entries yield no findings, even with toggle shown',()=>{
 policy.capabilities.branchEnabled=true;
 const p={udt:{render:()=>'',checks:()=>[]},udf:{render:()=>'',checks:()=>[]}};extendPages(p);
 const d={addon_rows:table(['Name','Rows'],[['@ST_PARAM',0]]),addon_params:table(['U_Key','U_Value'],[['WHTRS',' ']]),addon_udf:table(['TableID','AliasID'],[])};
 assert.deepEqual(p.udt.checks(d),[]);assert.deepEqual(p.udf.checks(d),[]);
 assert.ok(paramRows(ADDONS[0],d).every(r=>r.empty));
 assert.ok(tableRows(ADDONS[0],d).every(r=>r.empty));
 assert.ok(udfRows(ADDONS[0],d).every(r=>r.empty));
});
test('empty addon menus excluded from review even when shown; branch menu excluded for nonbranch',()=>{
 const objects=[{code:'A',name:'Aktif',shown:true,rowCount:3},{code:'B',name:'Kosong',shown:true,rowCount:0},{code:'C',name:'Unknown',shown:true},{code:'D',name:'Branch',shown:true,rowCount:2,tables:[{name:'STEM_TIBRANCHH'}]}];
 policy.capabilities.branchEnabled=true;
 assert.equal(addonPages(objects,false).length,3);assert.equal(addonPages(objects,true).length,4);
 assert.equal(addonPages(objects,true).find(p=>p.empty).status,null);
 assert.equal(policy.reviewableMenus(addonPages(objects,true)).length,3);
 policy.capabilities.branchEnabled=false;assert.equal(addonPages(objects,false).length,2);
});
test('fixed PIC stays STEM for legacy company; WBI and other namespaces can choose free PIC',()=>{
 for(const id of ['training','training-1','upload-master','inventory-upload','ap-ar','fa','gl']){
  assert.equal(fixedCompanyPic(id,''),true);assert.equal(fixedCompanyPic(id,'wbi'),false);assert.equal(fixedCompanyPic(id,'other'),false);
 }
 assert.equal(fixedCompanyPic('kickoff',''),false);
});
const { PAGES: GENERAL }=await import('../../main/resources/static/js/pages/general.js');
const { PAGES: MODULES }=await import('../../main/resources/static/js/pages/modules.js');
for(const branches of [true,false,null]) test(`checklist branch findings ${branches}: BP, user, organization`,()=>{
 policy.capabilities.branchEnabled=branches;
 const bp={bp:table(['CardCode','frozenFor','Branches'],[['C001','N',null]]),shipping:table(['Code'],[['1']])};
 const users={users:table(['USER_CODE','SUPERUSER','Branches'],[['FIN01','N',null]])};
 const org={branches:table(['BPLName','TaxIdNum'],[['CV-KOMERSIAL',null]])};
 const enabled=branches!==false;
 assert.equal(MODULES['business-partners'].checks(bp).some(([,msg])=>msg.includes('branch')),enabled);
 assert.equal(GENERAL.users.checks(users).some(([,msg])=>msg.includes('branch')),enabled);
 assert.equal(GENERAL['org-structure'].checks(org).some(([,msg])=>msg.includes('branch')),enabled);
 if(enabled)assert.match(MODULES.warehouses.lead,/Setiap warehouse terikat ke satu branch/);
});
test('capability fetch does not infer company mode from company name or upload permission',async()=>{
 for(const [payload,expected]of [[{branchEnabled:false,uploadAllowed:false},false],[{branchEnabled:true},true],[{branchEnabled:null},null],[{},null]]){
  globalThis.fetch=async(url,options)=>{assert.equal(url,'api/branch-mode');assert.equal(options.cache,'no-store');return {ok:true,json:async()=>payload};};await policy.loadCapabilities();assert.equal(policy.capabilities.branchEnabled,expected);
 }
 globalThis.fetch=async()=>{throw new Error('offline')};await policy.loadCapabilities();assert.equal(policy.capabilities.branchEnabled,null);
});
test('unavailable row statistics stay visible with unknown status, never claim Siap',()=>{
 policy.capabilities.branchEnabled=true;
 const r=tableRows(ADDONS[0],{addon_rows:table(['Name','Rows'],[['@ST_PARAM',null]])}).find(r=>r.Name==='ST_PARAM');
 assert.equal(r.empty,false);assert.equal(r.Rows,null);assert.equal(r.status.t,'none');assert.match(r.status.text,/belum diketahui/);
});

test('public mode HTTP failure keeps branch checks and does not retry protected Setup',async()=>{
 let calls=0;
 globalThis.fetch=async url=>{calls++;assert.equal(url,'api/branch-mode');return {ok:false,status:503,json:async()=>({message:'Unavailable'})};};
 assert.equal((await policy.loadCapabilities()).branchEnabled,null);assert.equal(policy.nonBranch(),false);assert.equal(calls,1);
});
