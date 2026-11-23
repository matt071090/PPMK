// Local-only UI preview. All API responses are fixtures; no DB, SL, network proxy or disk writes.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(fileURLToPath(new URL('../../main/resources/static/',import.meta.url)));
const resources=path.resolve(root,'..');
const mode=process.env.PREVIEW_COMPANY || 'wbi';
const company=mode==='wbi'?{code:'wbi',name:'PT Warung Begok Indonesia'}:{code:'',name:'CV. Putra Prima Mandiri Kediri'};
const seed=JSON.parse(await readFile(path.join(resources,'schedule',mode==='wbi'?'default-wbi.json':'default.json'),'utf8'));
const baseSteps=JSON.parse(await readFile(path.join(resources,'setup/steps.json'),'utf8'));
const retailSteps=JSON.parse(await readFile(path.join(resources,'setup/retail-steps.json'),'utf8'));
const steps=mode==='wbi'?[...baseSteps.filter(s=>s.tier!=='G'),...retailSteps]:baseSteps;
const messages=[];
const table=(columns=[],rows=[])=>({columns,rows,ms:1});
function reply(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1'),p=url.pathname;
    if(p==='/api/company')return reply(res,company);
    if(p==='/api/setup-access')return reply(res,{dev:true,unlocked:true,configured:true});
    if(p==='/api/review/mode')return reply(res,{editable:true});
    if(p==='/api/review')return reply(res,{pages:{}});
    if(p==='/api/health')return reply(res,{status:'UP',database:'Demo lokal'});
    if(p==='/api/addon/objects')return reply(res,{objects:[],categories:[],stale:[]});
    if(p==='/api/setup/capabilities')return reply(res,{branchEnabled:mode!=='wbi',uploadAllowed:true});
    if(p==='/api/setup/steps')return reply(res,steps);
    if(p==='/api/setup/sources')return reply(res,{target:'WBI_DEMO',same:[{id:'same:WBI_DEMO',schema:'WBI_DEMO',company:company.name}],others:[],missing:[],declared:true});
    if(p==='/api/schedule')return reply(res,{rev:0,updatedAt:'2026-11-23T12:00:00Z',data:seed});
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
    if(p.startsWith('/api/section/'))return reply(res,{results:{currency:table(['v'],[['IDR']]),udf:table(),udfv:table()}});
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
server.listen(18635,'127.0.0.1',()=>process.stdout.write('Preview fixtures http://127.0.0.1:18635\n'));
