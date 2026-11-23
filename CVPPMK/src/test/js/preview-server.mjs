// Local-only UI preview. All API responses are fixtures; no DB, SL, network proxy or disk writes.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(process.env.PREVIEW_STATIC_ROOT || fileURLToPath(new URL('../../main/resources/static/',import.meta.url)));
const resources=path.resolve(fileURLToPath(new URL('../../main/resources/',import.meta.url)));
const mode=process.env.PREVIEW_COMPANY || 'wbi';
const dev=process.env.PREVIEW_DEV==='1', unlocked=dev || process.env.PREVIEW_ADMIN==='1';
const branchEnabled=process.env.PREVIEW_BRANCH_MODE===undefined ? mode!=='wbi' : ({Y:true,N:false}[process.env.PREVIEW_BRANCH_MODE] ?? null);
const profile=mode==='wbi'?JSON.parse(await readFile(path.join(resources,'company/wbi.json'),'utf8')):{};
const company=mode==='wbi'?{code:'wbi',name:'PT Warung Begok Indonesia',picGroup:profile.pic.group,picSource:profile.pic.source,picExcludedCodes:profile.pic.excludedCodes}:{code:'',name:'CV. Putra Prima Mandiri Kediri',picGroup:'PPMK',picSource:'file',picUsersFile:'ppmk-users.json'};
const legacyAddon=process.env.PREVIEW_LEGACY_ADDON==='1';
const addonProfile=process.env.PREVIEW_ADDON_PROFILE==='1';
if(profile.addons){company.addonCatalogs=profile.addons.catalogs;company.addonRules=JSON.parse(await readFile(path.join(resources,profile.addons.mapping),'utf8')).rules;}
const legacyMapping=JSON.parse(await readFile(path.resolve(resources,'../../../addon-mapping.json'),'utf8'));
const seed=JSON.parse(await readFile(path.join(resources,'schedule',mode==='wbi'?'default-wbi.json':'default.json'),'utf8'));
const baseSteps=JSON.parse(await readFile(path.join(resources,'setup/steps.json'),'utf8'));
const retailSteps=JSON.parse(await readFile(path.join(resources,'setup/retail-steps.json'),'utf8'));
const steps=mode==='wbi'?[...baseSteps.filter(s=>s.tier!=='G'),...retailSteps]:baseSteps;
const messages=[];
let revision=0, schedule=structuredClone(seed);
const object = (code, name, rowCount, tables=[{name:code,descr:name,type:'0'}], kind='t') => ({code,name,rowCount,tables,kind,shown:true,cat:'STEM'});
const objects=[object('ST_PARAM','Parameter STEM',175),object('ST_UDRTH','Route produksi',240,[{name:'ST_UDRTH',descr:'Route',type:'1'},{name:'ST_UDRT1',descr:'Langkah route',type:'2'}],'m'),object('STEM_UNUSED','Tabel belum dipakai',0),object('STEM_TIBRANCHH','TI Branch',3)];
if(addonProfile) {
  objects.push(object('ST_PLCATEGORY','Kategori Harga Retail',19),object('ST_PARAMQC','Parameter QC',52),object('STEM_REPORTWEB','Master Report Web',28),object('STEM_MPLAN','Plan Farm',9),object('ST_ITR_DOCWEBH','Permintaan Transfer Web',3),object('ST_PARAMREPORT','Parameter Laporan',2));
  for(const o of objects){
    const explicit=legacyMapping.objects[o.code]||{};
    let rule={};
    if(profile.addons&&!legacyAddon)rule=company.addonRules.find(r=>r.prefixes.some(p=>o.code.startsWith(p)))||{};
    Object.assign(o,explicit,rule);
    if(profile.addons&&!legacyAddon){if(o.code==='STEM_REPORTWEB')o.cat='WebPortal SAP';if(o.code==='ST_PARAMREPORT')o.cat='Lainnya';}
    else o.cat=explicit.cat||'STEM Addon';
    o.shown=!o.hide;
  }
}
const params=Array.from({length:172},(_,i)=>[String(i+1),i<60?`RETAIL_${String(i+1).padStart(3,'0')}`:`CADANGAN_${i+1}`,i<60?`Nilai ${i+1}`:'',i<60?'Pengaturan operasional':'']);
params.push(['b1','SAPUSERINT','','Interbranch'],['b2','ITBRACCI','','Interbranch'],['p1','WHTRS','TRANSIT','Gudang transit']);
if(addonProfile)params.push(['f1','STATEGG','EGG','Jenis telur']);
const addonTables={ST_PARAM:()=>table(['Code','U_Key','U_Value','U_Desc'],params),ST_UDRTH:()=>table(['Code','Name','U_Remark'],Array.from({length:60},(_,i)=>[`RT${String(i+1).padStart(3,'0')}`,`Route produksi ${i+1}`,null])),ST_UDRT1:()=>table(['Code','LineId','U_WCCode'],Array.from({length:180},(_,i)=>[`RT${String(Math.floor(i/3)+1).padStart(3,'0')}`,i%3+1,i===179?'PENCARIAN CHILD TERAKHIR':`WC${i%3+1}`])),STEM_UNUSED:()=>table(['Code','Name'],[]),STEM_TIBRANCHH:()=>table(['Code','Name'],[['1','TI Branch']])};
const udts=Array.from({length:172},(_,i)=>[`ST_TABEL_${String(i+1).padStart(3,'0')}`,i<60?`Referensi produksi ${i+1}`:'', '0',i<60?3:0,'','']);
if(addonProfile){
 for(const o of objects)if(!addonTables[o.code])addonTables[o.code]=()=>table(['Code','Name'],[['1',o.name]]);
 udts.push(['STEM_MPLAN','Plan Farm','0',4,'',''],['STEM_REPORTWEB','Master Report Web','0',3,'',''],['ST_PLCATEGORY','Kategori Retail','0',3,'','']);
}
const sections={
  udt:()=>({udt:table(['TableName','Descr','ObjectType','FieldCount','UdoCode','UdoChildOf'],udts),addon_rows:table(['Name','Rows'],[...udts.map((r,i)=>['@'+r[0],i<60?i+1:0]),['@ST_PARAM',175],['@ST_SHIFT',0],['@ST_UDWC',12],...(addonProfile?[['@STEM_MPLAN',9],['@STEM_REPORTWEB',28],['@ST_PLCATEGORY',19]]:[]) ]),addon_params:addonTables.ST_PARAM()}),
  udo:()=>({udo:table(['Code','Name','TableName','TYPE','MngSeries','CanCancel','CanLog','ChildTables','Rows'],[['ST_UDRTH','Route produksi','ST_UDRTH','1','N','Y','Y','ST_UDRT1',240],['STEM_UNUSED','Belum digunakan','STEM_UNUSED','1','N','N','N','',0],...(addonProfile?[['STEM_MPLAN','Plan Farm','STEM_MPLAN','1','N','N','N','',9]]:[])])}),
  udf:()=>({fields:table(['TableID','Field','Descr','TypeID','SizeID','Dflt','NotNull'],[...Array.from({length:80},(_,i)=>['OITM',`U_Operasi${i+1}`,`Pengaturan operasi ${i+1}`,'A',30,'','N']),...(addonProfile?[['@STEM_MPLAN','U_Breed','Jenis Farm','A',10,'','N'],['@STEM_REPORTWEB','U_Url','Alamat Laporan','A',100,'','N']]:[])]),addon_udf:table(['TableID','AliasID'],[['OWHS','STEM_Type']])}),
  'saved-queries':()=>({categories:table(['CatName','QueryCount','IsSystem'],[['Produksi',65,'N'],['Belum digunakan',0,'N'],['SAP_DASHBOARD_STOCK',5,'Y']]),queries:table(['CatName','QName','Len','Created','LastRun','IsSystem'],Array.from({length:66},(_,i)=>['Produksi',`Laporan produksi ${i+1}`,i===65?0:120,'2026-11-01','2026-11-20','N']))}),
  warehouses:()=>({warehouses:table(['WhsCode','WhsName','BPLName','Inactive','BinActivat','BalInvntAc'],[['UTAMA','Gudang utama',mode==='wbi'?null:'CV-KOMERSIAL','N','N','110100']])}),
  users:()=>({users:table(['USER_CODE','U_NAME','SUPERUSER','Locked','Branches'],mode==='wbi'?[['WBI-ACC-STF1','Rizky','N','N',null],['CEO-WBI','Andy','Y','N',null],['Workflow','Workflow','Y','N',null],['WBI-PARE','Gerai Pare','N','N',null],['LOCKED','Terkunci','N','Y',null]]:[['FIN01','Tim Keuangan','N','N','CV-KOMERSIAL']])}),
  'business-partners':()=>({bp:table(['CardCode','CardName','CardType','GroupCode','frozenFor','Branches'],[['C001','Pelanggan Retail','C',100,'N',null]]),groups:table(['GroupCode','GroupName','GroupType'],[[100,'Pelanggan Retail','C']])}),
  'sp-validation':()=>({addon_procs:table(['Name'],[['SBO_SP_TransactionNotification'],['SBO_SP_PostTransactionNotice']]),addon_funcs:table(['Name'],[['GetItemResourceCost']])})
};
const table=(columns=[],rows=[])=>({columns,rows,ms:1});
function reply(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1'),p=url.pathname;
    if(p==='/api/branch-mode')return reply(res,{branchEnabled});
    if((p==='/api/setup'||p.startsWith('/api/setup/')||p==='/api/section/template-ref')&&!unlocked)return reply(res,{message:'Setup terkunci. Masukkan password Setup dulu.'},403);
    if(p==='/api/company')return reply(res,company);
    if(p==='/api/setup-access')return reply(res,{dev,unlocked,configured:true});
    if(p==='/api/review/mode')return reply(res,{editable:dev});
    if(p==='/api/review')return reply(res,{pages:{}});
    if(p==='/api/health')return reply(res,{status:'UP',database:'Demo lokal'});
    if(p==='/api/addon/objects')return reply(res,{objects,categories:addonProfile?(profile.addons?['Retail & iReapBiz','STEM Base','WebPortal SAP','Transaksi/Log','Lainnya']:legacyMapping.categories):['STEM'],stale:[]});
    if(p.startsWith('/api/addon/data/')){const o=objects.find(o=>o.code===p.split('/').at(-1));return reply(res,{generatedAt:'2026-11-23T12:00:00',results:Object.fromEntries((o?.tables||[]).map(t=>[t.name,addonTables[t.name]()]))});}
    if(p==='/api/setup/capabilities')return reply(res,{branchEnabled,uploadAllowed:branchEnabled!==null});
    if(p==='/api/setup/steps')return reply(res,steps);
    if(p==='/api/setup/sources')return reply(res,{target:'WBI_DEMO',same:[{id:'same:WBI_DEMO',schema:'WBI_DEMO',company:company.name}],others:[],missing:[],declared:true});
    if(p==='/api/schedule/access')return reply(res,{editable:unlocked,fixedPicIds:seed.items.filter(i=>i.pic==='STEM').map(i=>i.id)});
    if(p==='/api/schedule') {
      if(req.method==='PUT') {
        let raw='';for await(const chunk of req)raw+=chunk;
        const body=JSON.parse(raw);
        if(body.rev!==revision)return reply(res,{message:'Konflik revisi'},409);
        const strip=data=>({...data,items:data.items.map(({pic,status,...rest})=>rest)});
        if(!unlocked && JSON.stringify(strip(body.data))!==JSON.stringify(strip(schedule)))return reply(res,{message:'Tanggal dan catatan hanya admin'},403);
        if(!unlocked && body.data.items.some(it=>seed.items.some(s=>s.id===it.id&&s.pic==='STEM') && it.pic!==schedule.items.find(s=>s.id===it.id)?.pic))return reply(res,{message:'PIC kegiatan STEM dikunci'},403);
        schedule=body.data;revision++;
      }
      return reply(res,{rev:revision,updatedAt:'2026-11-23T12:00:00Z',data:schedule});
    }
    if(p.includes('/chat')){
      if(p.endsWith('/summary'))return reply(res,{threads:{}});
      if(p.endsWith('/latest'))return reply(res,{messages:[]});
      if(req.method==='POST'){
        let body='';for await(const chunk of req)body+=chunk;
        const m={...JSON.parse(body),id:messages.length+1,at:new Date().toISOString()};messages.push(m);return reply(res,m);
      }
      return reply(res,{messages:messages.filter(m=>m.thread===url.searchParams.get('thread')&&m.id>+(url.searchParams.get('after')||0))});
    }
    if(p==='/api/hana/info')return reply(res,{enabled:false,restoreEnabled:false,localOnly:true});
    if(p==='/api/countdoc/companies')return reply(res,{companies:[{schema:'WBI_DEMO',name:company.name}]});
    if(p==='/api/countdoc/meta')return reply(res,{objects:[],users:[]});
    if(p.startsWith('/api/countdoc/queries'))return reply(res,{queries:[],checks:{},companies:[{schema:'WBI_DEMO',name:company.name}]});
    if(p.startsWith('/api/section/company-name'))return reply(res,{name:company.name});
    if(p==='/api/section/company-details')return reply(res,{results:{company:table(['CompnyName'],[[company.name]])}});
    if(p.startsWith('/api/section/'))return reply(res,{generatedAt:'2026-11-23T12:00:00',results:sections[p.split('/').at(-1)]?.() || {currency:table(['v'],[['IDR']]),udf:table(),udfv:table()}});
    if(p.startsWith('/api/setup/')){
      const id=p.split('/')[3],s=steps.find(s=>s.id===id);
      if(p.endsWith('/sql')){res.writeHead(200,{'Content-Type':'text/plain'});return res.end('-- Demo lokal');}
      let target=table();
      if(s?.tier==='G'&&!s.retail)target={...target,unavailable:true,message:'Tidak tersedia di company ini: tabel Farm Breeding belum terpasang.'};
      if(s?.retail){
        const sample=s.fields.map(f=>(s.numeric||[]).includes(f)?'1':'Demo');
        target=table(['_key',...s.fields], [['1',...sample]]);
        if(s.children){target.columns.push('_Detail');target.rows[0].push('[{"U_WCCode":"WC1","U_WCDesc":"Demo route","U_Seq":1}]');}
      }
      if(id==='warehouses')target=table(['_key','WarehouseCode','WarehouseName','_Branch'],[['GDG01','GDG01','Gudang pusat',null]]);
      return reply(res,{target,...(url.searchParams.get('src')==='same:WBI_DEMO'?{source:target}:{}),generatedAt:'2026-11-23T12:00:00'});
    }
    if(p.startsWith('/api/'))return reply(res,{message:'Tidak tersedia dalam demo lokal'},404);
    const filename=path.resolve(root,'.'+(p==='/'?'/home.html':decodeURIComponent(p)));
    if(!filename.startsWith(root+path.sep)&&filename!==root)return reply(res,{message:'Forbidden'},403);
    const data=await readFile(filename),ext=path.extname(filename);
    res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.ico':'image/x-icon'})[ext]||'application/octet-stream'});res.end(data);
  }catch(e){reply(res,{message:'Fixture tidak ditemukan'},404);}
});
const port=+(process.env.PREVIEW_PORT||18635);
server.listen(port,'127.0.0.1',()=>process.stdout.write(`Preview fixtures http://127.0.0.1:${port}\n`));
