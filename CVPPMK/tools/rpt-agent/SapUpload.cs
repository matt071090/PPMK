// Kirim .rpt hasil edit ke SAP B1 (tabel RDOC) lewat DI API. Hanya dikompilasi bila Interop.SAPbobsCOM.dll (DTW) ada (define HASSAP).
// Pola pengaman diambil dari Crystal Importer v2: cek dulu tanpa menulis, backup + SHA-256 sebelum menimpa, baca balik sesudah tulis.
// Tiap permintaan login sendiri lalu logout; password tidak disimpan dan tidak masuk log.
#if HASSAP
using System;using System.Collections.Generic;using System.IO;using System.Linq;using System.Reflection;using System.Runtime.InteropServices;using System.Security.Cryptography;using System.Text.RegularExpressions;using System.Threading;
using SAPbobsCOM;

static class SapUp{
 static bool hooked;
 // Interop dibaca dari instalasi DTW di PC ini (DLL SAP tidak dibundel). Hook harus terpasang sebelum method yang memakai tipe SAPbobsCOM di-JIT.
 public static void Hook(){ if(hooked)return; hooked=true;
  AppDomain.CurrentDomain.AssemblyResolve+=(s,a)=>{ if(!a.Name.StartsWith("Interop.SAPbobsCOM",StringComparison.OrdinalIgnoreCase))return null;
   string f=System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),"SAP","Data Transfer Workbench","Interop.SAPbobsCOM.dll"); return File.Exists(f)?Assembly.LoadFrom(f):null;};}

 static string Str(Dictionary<string,object> b,string k){ return b.ContainsKey(k)&&b[k]!=null?Convert.ToString(b[k]).Trim():""; }
 static string Hash(byte[] x){ using(var h=SHA256.Create()) return BitConverter.ToString(h.ComputeHash(x)).Replace("-","").ToLowerInvariant(); }

 // jalankan di thread STA baru (DI API wajib STA); semua objek COM milik thread itu
 public static T OnSta<T>(Func<T> f,int ms){ T r=default(T); Exception ex=null; var t=new Thread(()=>{try{r=f();}catch(Exception e){ex=e;}}); t.SetApartmentState(ApartmentState.STA); t.IsBackground=true; t.Start();
  if(!t.Join(ms))throw new Exception("SAP tidak menjawab dalam "+(ms/1000)+" detik. Periksa VPN dan alamat server."); if(ex!=null)throw ex; return r;}

 static Company Login(Dictionary<string,object> b){
  string server=Str(b,"server"),schema=Str(b,"schema"),user=Str(b,"user"),pass=b.ContainsKey("password")&&b["password"]!=null?Convert.ToString(b["password"]):"",sld=Str(b,"sld");
  if(server=="")throw new Exception("Server wajib diisi (persis seperti di SLD, contoh NDB@host:30013)."); if(schema=="")throw new Exception("Company (schema) wajib diisi."); if(user=="")throw new Exception("User SAP wajib diisi.");
  var c=new Company(); c.DbServerType=BoDataServerTypes.dst_HANADB; c.Server=server; c.CompanyDB=schema; c.UseTrusted=false; c.UserName=user; c.Password=pass; if(sld!="")c.SLDServer=sld;
  int rc=c.Connect(); if(rc!=0){ string m=c.GetLastErrorDescription(); if(pass!="")m=m.Replace(pass,"***"); Release(c); throw new Exception("Login SAP gagal ("+rc+"): "+m);} return c;}
 static void Release(object o){ try{ if(o!=null&&Marshal.IsComObject(o))Marshal.FinalReleaseComObject(o);}catch{} }
 static void Done(Company c){ try{ if(c.Connected)c.Disconnect(); }catch{} Release(c); }

 static List<Dictionary<string,string>> Query(Company c,string sql){
  var rs=(Recordset)c.GetBusinessObject(BoObjectTypes.BoRecordset); var rows=new List<Dictionary<string,string>>();
  try{ rs.DoQuery(sql); var fs=rs.Fields; while(!rs.EoF){ var row=new Dictionary<string,string>(); for(int i=0;i<fs.Count;i++){ var f=fs.Item(i); try{row[f.Name]=Convert.ToString(f.Value);}finally{Release(f);} } rows.Add(row); rs.MoveNext(); } Release(fs);}
  finally{ Release(rs);} return rows;}
 static BlobParams Key(CompanyService cs,string code){ var p=(BlobParams)cs.GetDataInterface(CompanyServiceDataInterfaces.csdiBlobParams); p.Table="RDOC"; p.Field="Template";
  var segs=p.BlobTableKeySegments; var sg=segs.Add(); sg.Name="DocCode"; sg.Value=code; return p;}

 // daftar document type layout (tanpa RCRI = report menu) untuk dropdown
 public static object Probe(Dictionary<string,object> b){
  var c=Login(b); try{ var cs=c.GetCompanyService(); var svc=(ReportTypesService)cs.GetBusinessService(ServiceTypes.ReportTypesService); var ts=svc.GetReportTypeList(); var l=new List<object>();
   for(int i=0;i<ts.Count;i++){ var p=ts.Item(i); try{ if(p.TypeCode!="RCRI")l.Add(new Dictionary<string,object>{{"code",p.TypeCode},{"name",p.TypeName}}); }finally{Release(p);} }
   return new Dictionary<string,object>{{"ok",true},{"company",c.CompanyName},{"types",l.OrderBy(x=>((Dictionary<string,object>)x)["name"]).ToList()}};
  }finally{Done(c);} }

 // b: path (sudah divalidasi di bawah root), name, typeCode, policy FAIL|OVERWRITE|RENAME, dry (true = hanya cek)
 public static object Upload(string path,Dictionary<string,object> b,Action<string> log){
  string name=Str(b,"name"),type=Str(b,"typeCode"),policy=Str(b,"policy").ToUpperInvariant(); bool dry=b.ContainsKey("dry")&&b["dry"] is bool&&(bool)b["dry"];
  if(!Regex.IsMatch(type,@"^[A-Za-z0-9_]{1,20}$"))throw new Exception("Pilih document type tujuan."); if(name==""||name.Length>120)throw new Exception("Nama layout wajib diisi, maksimal 120 karakter.");
  if(policy!="FAIL"&&policy!="OVERWRITE"&&policy!="RENAME")throw new Exception("Jika sudah ada: FAIL, OVERWRITE atau RENAME.");
  var fi=new FileInfo(path); if(!fi.Exists||!string.Equals(fi.Extension,".rpt",StringComparison.OrdinalIgnoreCase))throw new Exception("File .rpt tidak ditemukan."); if(fi.Length>100L*1024*1024)throw new Exception("File melebihi 100 MB.");
  byte[] src=File.ReadAllBytes(path); if(src.Length<8||!src.Take(8).SequenceEqual(new byte[]{0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1}))throw new Exception("File bukan Crystal .rpt asli."); string sh=Hash(src);
  var c=Login(b);
  try{
   var cs=c.GetCompanyService();
   var all=Query(c,"SELECT \"DocCode\", \"DocName\", \"TypeCode\", \"Category\" FROM \"RDOC\"").Where(r=>r["TypeCode"]==type).ToList();
   Func<string,Dictionary<string,string>> hit=n=>all.FirstOrDefault(r=>string.Equals(r["DocName"],n,StringComparison.OrdinalIgnoreCase));
   string final=name,action="CREATE",code="",bk=""; var ex=hit(name);
   if(ex!=null){
    if(policy=="FAIL")throw new Exception("Nama '"+name+"' sudah ada (kode "+ex["DocCode"]+") di tujuan ini. Pilih TIMPA atau BUAT BARU.");
    if(policy=="RENAME"){ int n=1; do{ n++; string tail=" ("+n+")"; final=name.Substring(0,Math.Min(name.Length,120-tail.Length))+tail; }while(hit(final)!=null); }
    else{ if(ex["Category"]!="C")throw new Exception("Target lama bukan Crystal Reports; tidak boleh ditimpa."); if(ex["DocName"]!=name)throw new Exception("Kapitalisasi nama berbeda dari di SAP ('"+ex["DocName"]+"'). Samakan persis."); action="OVERWRITE"; code=ex["DocCode"]; }
   }
   var res=new Dictionary<string,object>{{"ok",true},{"action",action},{"name",final},{"code",code},{"dry",dry},{"sha256",sh},{"company",c.CompanyName}};
   if(dry){ res["message"]=action=="CREATE"?"Siap dibuat baru dengan nama '"+final+"'.":action=="OVERWRITE"?"Siap menimpa layout '"+final+"' (kode "+code+"); isi lama dibackup dulu.":""; return res;}
   if(action=="OVERWRITE"){
    var old=Convert.FromBase64String(cs.GetBlob(Key(cs,code)).Content);
    string dir=System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"StemRpt","sap-backup",Regex.Replace(c.CompanyDB,@"[^\w\-]","_"));
    Directory.CreateDirectory(dir); bk=System.IO.Path.Combine(dir,"backup-"+code+"-"+DateTime.Now.ToString("yyyyMMdd-HHmmss")+".rpt"); File.WriteAllBytes(bk,old);
    if(Hash(File.ReadAllBytes(bk))!=Hash(old))throw new Exception("Backup gagal diverifikasi; layout tidak ditimpa."); res["backup"]=bk; log("SAP backup "+code+" -> "+bk);
   }else{
    var svc=(ReportLayoutsService)cs.GetBusinessService(ServiceTypes.ReportLayoutsService); var lay=(ReportLayout)svc.GetDataInterface(ReportLayoutsServiceDataInterfaces.rlsdiReportLayout);
    lay.Name=final; lay.TypeCode=type; lay.Author=c.UserName; lay.Category=ReportLayoutCategoryEnum.rlcCrystal; var k=svc.AddReportLayout(lay); code=k.LayoutCode; res["code"]=code; log("SAP layout baru "+code+" '"+final+"'");
   }
   try{ var bl=(Blob)cs.GetDataInterface(CompanyServiceDataInterfaces.csdiBlob); bl.Content=Convert.ToBase64String(src); cs.SetBlob(Key(cs,code),bl); }
   catch(Exception e){ throw new Exception("Gagal menulis isi layout (kode "+code+(bk!=""?", backup "+bk:"")+"): "+e.Message+". Periksa layout itu di SAP sebelum mengulang."); }
   var back=Convert.FromBase64String(cs.GetBlob(Key(cs,code)).Content);
   if(back.Length!=src.Length||Hash(back)!=sh)throw new Exception("Baca balik tidak identik (kode "+code+(bk!=""?", backup "+bk:"")+"). Periksa layout di SAP.");
   res["message"]="Tersimpan di SAP sebagai '"+final+"' (kode "+code+"); isi sudah dibaca balik dan cocok (SHA-256)."+(bk!=""?" Backup isi lama: "+bk:""); log("SAP OK "+action+" "+code); return res;
  }finally{Done(c);} }
}
#endif
