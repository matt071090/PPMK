import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {usersFromSection,picLabel,picOptions,resolvePicText,loadCompanyPicUsers} from '../../main/resources/static/js/pages/schedule.js';
const config=JSON.parse(readFileSync(new URL('../../main/resources/company/wbi.json',import.meta.url))).pic;
const table={results:{users:{columns:['USER_CODE','U_NAME','SUPERUSER','Locked'],rows:[['WBI-ACC-STF1','Rizky','N','N'],['PUR-MGR','Fenny','Y','N'],['Workflow','Workflow','Y','N'],['WBI-PARE','Gerai Pare','N','N'],['LOCKED','Terkunci','N','Y']]}}};
test('company-configured SAP PIC excludes locked/system/store accounts, retains eligible superusers',()=>{
 const users=usersFromSection(table,config.excludedCodes);assert.deepEqual(users.map(u=>u.code),['WBI-ACC-STF1','PUR-MGR']);
 const opts=picOptions(users,'',config.group);assert.deepEqual(opts.map(o=>o.value),['','STEM','WBI:WBI-ACC-STF1','WBI:PUR-MGR']);assert.equal(opts[2].group,'WBI');assert.equal(opts[2].label,'WBI-ACC-STF1 (Rizky)');
});
test('WBI labels include code and username, free text stays valid, legacy PPMK labels stay unchanged',()=>{
 const users=usersFromSection(table,config.excludedCodes);
 assert.equal(picLabel('WBI:WBI-ACC-STF1',users,'WBI'),'WBI · WBI-ACC-STF1 (Rizky)');
 assert.equal(resolvePicText('WBI-ACC-STF1 (Rizky)',users,'WBI'),'WBI:WBI-ACC-STF1');assert.equal(resolvePicText('Tim toko sore',[],'WBI'),'Tim toko sore');
 assert.equal(picLabel('PPMK:ACC',[],'PPMK'),'PPMK · ACC');assert.equal(picOptions([{code:'ACC',name:'Tim CV'}],'','PPMK')[2].value,'PPMK:ACC');
});
test('missing or failed SAP directory yields no suggestions from another company',()=>{
 assert.deepEqual(usersFromSection({}),[]);assert.deepEqual(usersFromSection({results:{users:{error:'offline'}}}),[]);
 assert.deepEqual(picOptions([],'','WBI').map(o=>o.value),['','STEM']);
});

const {company}=await import('../../main/resources/static/js/company.js');
test('directory loading uses configured source, keeps free-text fallback and never asks for CV file in SAP mode',async()=>{
 const original={...company};
 try {
  Object.assign(company,{picSource:'sap',picGroup:'WBI',picExcludedCodes:config.excludedCodes});
  let url;const users=await loadCompanyPicUsers(async u=>{url=u;return {ok:true,json:async()=>table};});assert.equal(url,'api/section/users');assert.equal(users.length,2);
  assert.deepEqual(await loadCompanyPicUsers(async()=>{throw new Error('offline')}),[]);
  Object.assign(company,{picSource:'file',picGroup:'PPMK',picUsersFile:'ppmk-users.json'});
  const cv=await loadCompanyPicUsers(async u=>{assert.equal(u,'data/ppmk-users.json');return {ok:true,json:async()=>({users:[{code:'CV01',name:'Tim CV'}]})};});assert.equal(cv[0].code,'CV01');
 } finally {Object.assign(company,original);}
});
