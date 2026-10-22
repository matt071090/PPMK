// StemRptAgent: agen lokal kecil (127.0.0.1:47831) yang membaca/mengubah file Crystal Reports (.rpt) memakai Crystal SDK
// yang SUDAH terpasang di PC ini (GAC). DLL Crystal tidak dibundel. UI-nya ada di web portal (static/rpt.html).
// Berjalan di background (ikon tray). Aturan: origin daftar putih (localhost/127.0.0.1 port 8090 dan 8080) + origin tambahan (allowed-origins.txt / argumen), token per proses,
// hanya menulis ke SALINAN (<nama>_edit.rpt) di folder yang dipilih user. Tidak ada kredensial yang dicatat di log.
using System;using System.Collections.Generic;using System.Drawing;using System.IO;using System.Net;using System.Text;using System.Text.RegularExpressions;using System.Threading;using System.Windows.Forms;using System.Web.Script.Serialization;
using System.Runtime.InteropServices;using Microsoft.Win32;using CrystalDecisions.ReportAppServer.Controllers;
using CrystalDecisions.ReportAppServer.ReportDefModel;
using CE=CrystalDecisions.CrystalReports.Engine;
using DD=CrystalDecisions.ReportAppServer.DataDefModel;
class Doc{public CE.ReportDocument R;public string Path;public string Base;public bool TempBase;public List<List<Dictionary<string,object>>> Log=new List<List<Dictionary<string,object>>>();public int Pos=0;}
class ClipItem{public ReportObject Obj;public string Section;public int Dl,Dt,W,H;}
class PdfRes{public byte[] Bytes;public int Pages;}
class SkipEx:Exception{public SkipEx(string m):base(m){}}
class Agent{
 const string Ver="StemRptAgent 0.7"; static readonly DateTime started=DateTime.Now; const int Port=47831;
 static JavaScriptSerializer js=new JavaScriptSerializer{MaxJsonLength=int.MaxValue};
 static Dictionary<string,Doc> docs=new Dictionary<string,Doc>();   // hanya disentuh dari thread worker
 static string token=Guid.NewGuid().ToString("N");
 static List<string> extraOrigins=new List<string>();
 static readonly string[] defaultOrigins={"http://localhost:8090","http://127.0.0.1:8090","http://localhost:8080","http://127.0.0.1:8080"}; // origin lain: allowed-origins.txt di samping exe atau argumen
 static readonly HashSet<string> madeOut=new HashSet<string>(StringComparer.OrdinalIgnoreCase); // hasil simpan yang dibuat sesi ini (hanya disentuh dari worker)
 static volatile string root=null;   // folder yang dipilih user; semua path harus di bawahnya
 static List<ClipItem> clip=null;    // clipboard banyak objek antar dokumen (offset relatif ke objek pertama)
 static string clipFrom="",clipSec=""; static int clipL=0,clipT=0; // asal clipboard: section + pojok kiri-atas (default tempel)
 static HttpListener listener; static NotifyIcon tray; static ToolStripMenuItem miStatus;
 static readonly object pickLock=new object(); static readonly object logLock=new object();
 static string ExePath{get{return System.Reflection.Assembly.GetExecutingAssembly().Location;}}
 // ---------- log ----------
 static void Log(string s){try{lock(logLock){string d=System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"StemRpt");Directory.CreateDirectory(d);string f=System.IO.Path.Combine(d,"agent.log");
   try{if(File.Exists(f)&&new FileInfo(f).Length>1000000)File.Delete(f);}catch{}
   File.AppendAllText(f,DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")+" "+s+"\r\n");}}catch{}}
 // ---------- worker (semua operasi Crystal/dokumen diserialkan di satu thread STA) ----------
 static System.Collections.Concurrent.BlockingCollection<Action> wq=new System.Collections.Concurrent.BlockingCollection<Action>();
 static void StartWorker(){var t=new Thread(()=>{foreach(var a in wq.GetConsumingEnumerable())a();});t.SetApartmentState(ApartmentState.STA);t.IsBackground=true;t.Start();}
 static T OnWorker<T>(Func<T> f){T r=default(T);Exception ex=null;var ev=new ManualResetEvent(false);
  wq.Add(()=>{try{r=f();}catch(Exception e){ex=e;}ev.Set();});ev.WaitOne();if(ex!=null)throw new Exception(ex.Message);return r;}
 static T OnWorkerT<T>(Func<T> f,int ms){T r=default(T);Exception ex=null;var ev=new ManualResetEvent(false);
  wq.Add(()=>{try{r=f();}catch(Exception e){ex=e;}ev.Set();});if(!ev.WaitOne(ms))throw new Exception("Preview melewati batas waktu "+(ms/1000)+" detik (kueri mungkin terlalu lama).");if(ex!=null)throw new Exception(ex.Message);return r;}
 // ---------- main / tray ----------
 [STAThread] static void Main(string[] a){
  var origins=new List<string>(); bool inst=false,uninst=false;
  foreach(var x in a){ if(x=="--install")inst=true; else if(x=="--uninstall")uninst=true; else if(x.StartsWith("stemrpt:",StringComparison.OrdinalIgnoreCase)||x.StartsWith("-")){} else origins.AddRange(x.Split(new[]{','},StringSplitOptions.RemoveEmptyEntries));}
  if(inst||uninst){ try{ if(inst){using(var k=Registry.CurrentUser.CreateSubKey(@"Software\Classes\stemrpt")){k.SetValue("","URL:StemRpt Protocol");k.SetValue("URL Protocol","");using(var c=k.CreateSubKey(@"shell\open\command"))c.SetValue("","\""+ExePath+"\" \"%1\"");}
     MessageBox.Show("stemrpt:// terdaftar. Link stemrpt://start akan menjalankan agen.","StemRptAgent");}
    else{Registry.CurrentUser.DeleteSubKeyTree(@"Software\Classes\stemrpt",false);MessageBox.Show("stemrpt:// dihapus.","StemRptAgent");}}
   catch(Exception e){Log("install: "+e.Message);MessageBox.Show("Gagal: "+e.Message,"StemRptAgent");} return;}
  bool created; var mtx=new Mutex(true,"Local\\StemRptAgent_47831",out created); if(!created)return;
  foreach(var o in origins){var t=o.Trim().TrimEnd('/'); if(t!="")extraOrigins.Add(t);}
  try{string f=System.IO.Path.Combine(System.IO.Path.GetDirectoryName(ExePath),"allowed-origins.txt"); if(File.Exists(f)) foreach(var ln in File.ReadAllLines(f)){ var l2=ln.Trim(); if(l2==""||l2.StartsWith("#"))continue; foreach(var o in l2.Split(',')){var t=o.Trim().TrimEnd('/'); if(t!="")extraOrigins.Add(t);}}}catch{}
  string er=Environment.GetEnvironmentVariable("STEMRPT_ROOT"); if(!string.IsNullOrEmpty(er)) root=er; // opsional: folder awal tanpa dialog (untuk uji)
  Application.EnableVisualStyles();
  tray=new NotifyIcon{Icon=SystemIcons.Application,Visible=true};
  listener=new HttpListener(); listener.Prefixes.Add("http://127.0.0.1:"+Port+"/");
  try{listener.Start();}catch(Exception e){Log("Gagal start port "+Port+": "+e.Message);tray.ShowBalloonTip(5000,"StemRptAgent","Port "+Port+" sedang dipakai program lain. Agen keluar.",ToolTipIcon.Error);Thread.Sleep(3500);tray.Visible=false;tray.Dispose();return;}
  StartWorker();
  CleanPrev();
  var menu=new ContextMenuStrip(); miStatus=new ToolStripMenuItem("Status"){Enabled=false}; menu.Items.Add(miStatus);
  menu.Items.Add(new ToolStripSeparator());
  menu.Items.Add("Pilih folder...",null,(s,e)=>{var t=new Thread(()=>{var p=PickFolder();if(p!=null)SetPicked(p);});t.SetApartmentState(ApartmentState.STA);t.IsBackground=true;t.Start();});
  var miAuto=new ToolStripMenuItem("Mulai otomatis saat login Windows"){CheckOnClick=true,Checked=AutoStart()};
  miAuto.Click+=(s,e)=>{try{SetAutoStart(miAuto.Checked);}catch(Exception ex){Log("autostart: "+ex.Message);miAuto.Checked=AutoStart();}}; menu.Items.Add(miAuto);
  menu.Items.Add(new ToolStripSeparator());
  menu.Items.Add("Keluar",null,(s,e)=>{try{listener.Stop();}catch{} tray.Visible=false; tray.Dispose(); Application.Exit();});
  menu.Opening+=(s,e)=>{miAuto.Checked=AutoStart();UpdateTray();};
  tray.ContextMenuStrip=menu; UpdateTray();
  Log("start; origin tambahan: "+string.Join(",",extraOrigins));
  var lt=new Thread(Loop){IsBackground=true}; lt.Start();
  Application.Run();
  GC.KeepAlive(mtx);
 }
 static void UpdateTray(){string r=root==null?"(belum dipilih)":root; try{ string tip="StemRptAgent - folder: "+r; if(tip.Length>63)tip=tip.Substring(0,60)+"..."; tray.Text=tip; miStatus.Text="Berjalan di 127.0.0.1:"+Port+" - folder: "+r;}catch{}}
 static bool AutoStart(){try{using(var k=Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run"))return k!=null&&k.GetValue("StemRptAgent")!=null;}catch{return false;}}
 static void SetAutoStart(bool on){using(var k=Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run")){if(on)k.SetValue("StemRptAgent","\""+ExePath+"\""); else k.DeleteValue("StemRptAgent",false);}}
 // ---------- dialog folder ----------
 // Dialog modern IFileOpenDialog lewat COM interop buatan sendiri (urutan vtable mengikuti shobjidl.h; dipakai lewat IFileDialog). Jika COM gagal -> FolderBrowserDialog lama.
 // "Tampil di depan" HANYA heuristik (owner kecil yang terlihat + AttachThreadInput/SetForegroundWindow); Windows tetap bisa menahan fokus. BELUM teruji di PC user.
 [ComImport,Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]class FileOpenDialogCom{}
 [ComImport,Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IShellItem{ void BindToHandler(IntPtr pbc,ref Guid bhid,ref Guid riid,out IntPtr ppv); void GetParent(out IShellItem ppsi); void GetDisplayName(uint sigdn,[MarshalAs(UnmanagedType.LPWStr)]out string name); void GetAttributes(uint mask,out uint attr); void Compare(IShellItem psi,uint hint,out int order);}
 [ComImport,Guid("42f85136-db7e-439c-85f1-e4075d135fc8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IFileDialog{ // vtable: 3 Show (IModalWindow), 4.. IFileDialog persis urutan shobjidl.h
  [PreserveSig]int Show(IntPtr hwndOwner);
  void SetFileTypes(uint c,IntPtr p); void SetFileTypeIndex(uint i); void GetFileTypeIndex(out uint i); void Advise(IntPtr pfde,out uint cookie); void Unadvise(uint cookie);
  void SetOptions(uint fos); void GetOptions(out uint fos); void SetDefaultFolder(IShellItem psi); void SetFolder(IShellItem psi); void GetFolder(out IShellItem ppsi); void GetCurrentSelection(out IShellItem ppsi);
  void SetFileName([MarshalAs(UnmanagedType.LPWStr)]string n); void GetFileName([MarshalAs(UnmanagedType.LPWStr)]out string n); void SetTitle([MarshalAs(UnmanagedType.LPWStr)]string t);
  void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)]string t); void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)]string t); void GetResult(out IShellItem ppsi);
  void AddPlace(IShellItem psi,int fdap); void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)]string e); void Close(int hr); void SetClientGuid(ref Guid g); void ClearClientData(); void SetFilter(IntPtr f);}
 [DllImport("shell32.dll",CharSet=CharSet.Unicode,PreserveSig=false)] static extern void SHCreateItemFromParsingName(string path,IntPtr pbc,ref Guid riid,out IShellItem ppv);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a,uint b,bool attach);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int cmd);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 delegate bool EnumWndProc(IntPtr h,IntPtr l);
 [DllImport("user32.dll")] static extern bool EnumThreadWindows(uint tid,EnumWndProc cb,IntPtr l);
 [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
 static volatile bool pickBusy; static uint pickTid; static IntPtr pickOwnerH=IntPtr.Zero;
 static void ForceFront(IntPtr h){ try{ uint pid; uint ft=GetWindowThreadProcessId(GetForegroundWindow(),out pid); uint me=GetCurrentThreadId(); bool at=ft!=0&&ft!=me&&AttachThreadInput(me,ft,true);
   try{ ShowWindow(h,9); SetForegroundWindow(h); }finally{ if(at)AttachThreadInput(me,ft,false); } }catch{} }
 static bool FrontPick(){ if(!pickBusy)return false; try{ IntPtr first=IntPtr.Zero; EnumThreadWindows(pickTid,(h,l)=>{ if(first==IntPtr.Zero&&IsWindowVisible(h))first=h; return true; },IntPtr.Zero); if(first==IntPtr.Zero)first=pickOwnerH; if(first!=IntPtr.Zero){ForceFront(first);return true;} }catch{} return false;}
 static string PickCom(IntPtr owner,string start,out bool cancelled){ cancelled=false; var dlg=(IFileDialog)new FileOpenDialogCom();
  try{ uint fos; dlg.GetOptions(out fos); dlg.SetOptions(fos|0x20|0x40|0x800); dlg.SetTitle("Pilih folder berisi file .rpt"); // PICKFOLDERS|FORCEFILESYSTEM|PATHMUSTEXIST
   if(!string.IsNullOrEmpty(start)&&Directory.Exists(start)){ try{ Guid iid=new Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"); IShellItem si; SHCreateItemFromParsingName(start,IntPtr.Zero,ref iid,out si); dlg.SetFolder(si); Marshal.ReleaseComObject(si); }catch{} }
   int hr=dlg.Show(owner); if(hr==unchecked((int)0x800704C7)){ cancelled=true; return null; } if(hr!=0) Marshal.ThrowExceptionForHR(hr);
   IShellItem r; dlg.GetResult(out r); string path; r.GetDisplayName(0x80058000,out path); Marshal.ReleaseComObject(r); return path;
  }finally{ Marshal.ReleaseComObject(dlg); } }
 static string PickFolder(){ // dipanggil dari thread STA; null = dibatalkan
  lock(pickLock){ pickBusy=true; pickTid=GetCurrentThreadId(); string res=null;
   try{ using(var o=new Form{Text="StemRptAgent",TopMost=true,ShowInTaskbar=true,FormBorderStyle=FormBorderStyle.FixedDialog,ControlBox=false,StartPosition=FormStartPosition.CenterScreen,Size=new Size(300,80)}){
     o.Controls.Add(new Label{Text="Memilih folder...",Dock=DockStyle.Fill,TextAlign=ContentAlignment.MiddleCenter});
     o.Show(); o.Activate(); pickOwnerH=o.Handle; ForceFront(o.Handle);
     string start=root; if(start==null||!Directory.Exists(start)){ var rc=RecentList(); start=rc.Count>0?rc[0]:null; }
     bool cancelled; try{ res=PickCom(o.Handle,start,out cancelled); }
     catch(Exception e){ Log("IFileOpenDialog gagal, pakai FolderBrowserDialog: "+e.Message); using(var d=new FolderBrowserDialog()){ d.Description="Pilih folder berisi file .rpt"; if(start!=null)d.SelectedPath=start; if(d.ShowDialog(o)==DialogResult.OK) res=d.SelectedPath; } }
    }
   }finally{ pickBusy=false; pickOwnerH=IntPtr.Zero; }
   return res;}}
 // ---------- folder terakhir (maks 8) di %AppData%\StemRptAgent\recent.txt ----------
 static readonly object recLock=new object();
 static string RecentFile{get{return System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),"StemRptAgent","recent.txt");}}
 static List<string> RecentList(){ var l=new List<string>(); try{ lock(recLock){ if(File.Exists(RecentFile)) foreach(var ln in File.ReadAllLines(RecentFile)){ var t=ln.Trim(); if(t!=""&&Directory.Exists(t)&&!l.Exists(x=>string.Equals(x,t,StringComparison.OrdinalIgnoreCase))) l.Add(t); } } }catch{} return l.Count>8?l.GetRange(0,8):l;}
 static void AddRecent(string p){ try{ lock(recLock){ var l=RecentList(); l.RemoveAll(x=>string.Equals(x,p,StringComparison.OrdinalIgnoreCase)); l.Insert(0,p); if(l.Count>8)l.RemoveRange(8,l.Count-8); Directory.CreateDirectory(System.IO.Path.GetDirectoryName(RecentFile)); File.WriteAllLines(RecentFile,l.ToArray()); } }catch(Exception e){Log("recent: "+e.Message);} }
 static void SetPicked(string p){ root=p; AddRecent(p); UpdateTray(); }
 static string Friendly(string m){ if(m!=null&&Regex.IsMatch(m,@"HDBODBC|IM002|data source name not found|driver.{0,20}not found",RegexOptions.IgnoreCase)){ Log("driver: "+m); return "Driver SAP HANA ODBC 64-bit (HDBODBC) tidak ditemukan di PC ini. Pasang SAP HANA Client 64-bit lalu coba lagi."; } return m; }
 static void Loop(){ while(listener.IsListening){HttpListenerContext c; try{c=listener.GetContext();}catch{break;} ThreadPool.QueueUserWorkItem(_=>HandleSafe(c));}}
 static void HandleSafe(HttpListenerContext c){ try{Handle(c);}catch(Exception e){Log("ERR "+e.Message);try{Send(c,500,new Dictionary<string,object>{{"error",e.Message}});}catch{}}}
 // ---------- http ----------
 static void Send(HttpListenerContext c,int code,object o){
  var b=Encoding.UTF8.GetBytes(js.Serialize(o)); c.Response.StatusCode=code; c.Response.ContentType="application/json; charset=utf-8";
  c.Response.OutputStream.Write(b,0,b.Length); c.Response.Close();}
 static Dictionary<string,object> Body(HttpListenerContext c){
  string s=new StreamReader(c.Request.InputStream,Encoding.UTF8).ReadToEnd();
  return s.Length==0?new Dictionary<string,object>():js.Deserialize<Dictionary<string,object>>(s);}
 static string Under(string p){ // path harus di bawah root
  if(root==null) throw new Exception("Belum ada folder dipilih.");
  string f=System.IO.Path.GetFullPath(p); string r=System.IO.Path.GetFullPath(root).TrimEnd('\\')+"\\";
  if(!(f+"\\").StartsWith(r,StringComparison.OrdinalIgnoreCase)) throw new Exception("Path di luar folder yang dipilih."); return f;}
 static bool OriginOk(string o){o=o.TrimEnd('/'); return Array.Exists(defaultOrigins,x=>string.Equals(x,o,StringComparison.OrdinalIgnoreCase))||extraOrigins.Exists(x=>string.Equals(x,o,StringComparison.OrdinalIgnoreCase));}
 static Doc GetDoc(Dictionary<string,object> b){string id=b.ContainsKey("docId")?(string)b["docId"]:null; Doc d; if(id==null||!docs.TryGetValue(id,out d)) throw new Exception("Dokumen tidak ditemukan (docId)."); return d;}
 static string IdOf(Doc d){foreach(var kv in docs) if(kv.Value==d) return kv.Key; return "";}
 static void Handle(HttpListenerContext c){
  var req=c.Request; string origin=req.Headers["Origin"]; string host=req.Headers["Host"]; string p=req.Url.AbsolutePath;
  if(host!="127.0.0.1:"+Port&&host!="localhost:"+Port){Send(c,403,new{error="host"});return;}
  if(origin!=null){ if(!OriginOk(origin)){Log("TOLAK origin "+origin);c.Response.Headers["Access-Control-Allow-Origin"]=origin;c.Response.Headers["Vary"]="Origin";Send(c,403,new{error="origin tidak diizinkan: "+origin+". Tambahkan origin ini (satu baris) ke berkas allowed-origins.txt di folder StemRptAgent.exe, lalu keluar dari tray dan jalankan agen lagi."});return;}
   c.Response.Headers["Access-Control-Allow-Origin"]=origin; c.Response.Headers["Vary"]="Origin";
   c.Response.Headers["Access-Control-Allow-Headers"]="Authorization, Content-Type";
   c.Response.Headers["Access-Control-Allow-Methods"]="GET, POST, OPTIONS";
   c.Response.Headers["Access-Control-Allow-Private-Network"]="true";}
  if(req.HttpMethod=="OPTIONS"){c.Response.StatusCode=204;c.Response.Close();return;}
  if(p=="/health"){Send(c,200,new Dictionary<string,object>{{"agent",Ver},{"sdk",true},{"x64",Environment.Is64BitProcess},{"root",root},{"started",started.ToString("o")},{"pid",System.Diagnostics.Process.GetCurrentProcess().Id}});return;}
  if(p=="/session"){ if(origin==null){Send(c,403,new{error="origin wajib"});return;} Send(c,200,new{token=token});return;}
  if(req.Headers["Authorization"]!="Bearer "+token){Send(c,401,new{error="token"});return;}
  var b=Body(c); Log(req.HttpMethod+" "+p);
  if(p=="/rpt/preview"){ PdfRes pr; string pw0=b.ContainsKey("password")&&b["password"]!=null?Convert.ToString(b["password"]):"";
   try{ string sv=b.ContainsKey("server")&&b["server"]!=null?Convert.ToString(b["server"]).Trim():"", us=b.ContainsKey("user")&&b["user"]!=null?Convert.ToString(b["user"]).Trim():"";
    if(sv=="")throw new Exception("Server wajib diisi."); if(us=="")throw new Exception("User wajib diisi.");
    pr=OnWorkerT<PdfRes>(()=>Preview(GetDoc(b),sv,us,pw0,b),60000);
   }catch(Exception e){ string m=e.Message; if(pw0!="")m=m.Replace(pw0,"***"); m=Friendly(m); Log("preview gagal: "+m); Send(c,500,new Dictionary<string,object>{{"error",m}}); return; }
   c.Response.StatusCode=200; c.Response.ContentType="application/pdf"; c.Response.Headers["Cache-Control"]="no-store"; c.Response.Headers["X-Rpt-Pages"]=pr.Pages.ToString();
   c.Response.Headers["Access-Control-Expose-Headers"]="X-Rpt-Pages"; c.Response.ContentLength64=pr.Bytes.Length; c.Response.OutputStream.Write(pr.Bytes,0,pr.Bytes.Length); c.Response.Close(); return;}
  if(p=="/fs/pick/front"){ Send(c,200,new Dictionary<string,object>{{"open",pickBusy},{"fronted",FrontPick()}});return;} // bawa dialog yang sedang terbuka ke depan (tidak membuka dialog kedua)
  if(p=="/fs/pick"){ if(pickBusy){Send(c,200,new Dictionary<string,object>{{"root",root},{"busy",true}});return;}
   string res=null; var t=new Thread(()=>{res=PickFolder();}); t.SetApartmentState(ApartmentState.STA); t.Start(); t.Join();
   if(res!=null)SetPicked(res); Send(c,200,new Dictionary<string,object>{{"root",root},{"cancelled",res==null}});return;}
  if(p=="/fs/recent"){ Send(c,200,new Dictionary<string,object>{{"recent",RecentList()}});return;}
  if(p=="/fs/root"){ // set-root HANYA dari daftar folder terakhir (termasuk hasil dialog barusan); aturan Under() tidak berubah
   string full=b.ContainsKey("path")&&b["path"]!=null?System.IO.Path.GetFullPath(Convert.ToString(b["path"])).TrimEnd('\\'):"";
   if(full==""||!RecentList().Exists(x=>string.Equals(System.IO.Path.GetFullPath(x).TrimEnd('\\'),full,StringComparison.OrdinalIgnoreCase))){Send(c,403,new{error="Folder bukan dari daftar terakhir."});return;}
   SetPicked(full); Send(c,200,new Dictionary<string,object>{{"root",root}});return;}
  object o=OnWorker<object>(()=>Route(p,b));
  if(o==null){Send(c,404,new{error="tidak ada: "+p});return;}
  Send(c,200,o);
 }
 static object Route(string p,Dictionary<string,object> b){
  if(p=="/fs/list"){ string dir=Under(b.ContainsKey("path")?(string)b["path"]:root); var files=new List<object>();
   foreach(var f in Directory.GetFiles(dir,"*.rpt",SearchOption.TopDirectoryOnly)){var fi=new FileInfo(f); files.Add(new Dictionary<string,object>{{"name",fi.Name},{"path",fi.FullName},{"kb",fi.Length/1024}});}
   return new Dictionary<string,object>{{"dir",dir},{"files",files}};}
  if(p=="/rpt/open"){ string path=Under((string)b["path"]); var r=new CE.ReportDocument(); r.Load(path); string id=Guid.NewGuid().ToString("N").Substring(0,8); var d=new Doc{R=r,Path=path,Base=path}; docs[id]=d; return Dump(id,d);}
  if(p=="/rpt/fields") return Fields(GetDoc(b).R);
  if(p=="/rpt/get"){ var d=GetDoc(b); return Dump(IdOf(d),d);}
  if(p=="/rpt/ops"){ var d=GetDoc(b); string id=IdOf(d); var res=new List<string>(); var ops=new List<Dictionary<string,object>>();
   foreach(Dictionary<string,object> op in (System.Collections.ArrayList)b["ops"]) ops.Add(op);
   var applied=new List<Dictionary<string,object>>();
   try{ foreach(var op in ops){ res.Add(Op(d,op)); if((string)op["op"]!="copy") applied.Add(op);} }
   finally{ if(applied.Count>0) Commit(d,applied); }
   var o=Dump(id,d); o["results"]=res; return o;}
  if(p=="/rpt/undo"){ var d=GetDoc(b); if(d.Pos<=0) throw new Exception("Tidak ada yang bisa di-undo."); d.Pos--; Rebuild(d); return Dump(IdOf(d),d);}
  if(p=="/rpt/redo"){ var d=GetDoc(b); if(d.Pos>=d.Log.Count) throw new Exception("Tidak ada yang bisa di-redo."); d.Pos++; Rebuild(d); return Dump(IdOf(d),d);}
  if(p=="/rpt/verify") return Verify(GetDoc(b),b);
  if(p=="/rpt/checkFormula"){ var d=GetDoc(b); string t=b.ContainsKey("text")&&b["text"]!=null?Convert.ToString(b["text"]):""; string ve=RawErr(t); if(ve!="") return new Dictionary<string,object>{{"ok",false},{"error",ve}};
   string ce; try{ ce=CheckCf(d.R,t); }catch(Exception e){ ce=e.Message; } return new Dictionary<string,object>{{"ok",ce==""},{"error",ce}};}
  if(p=="/fs/reveal"){ // buka Explorer pada hasil simpan SESI INI saja (path harus di bawah root dan tercatat madeOut; UI tidak bisa memberi path bebas)
   string sp=Under(b.ContainsKey("saved")&&b["saved"]!=null?Convert.ToString(b["saved"]):""); if(!madeOut.Contains(sp)||!File.Exists(sp)) throw new Exception("Berkas bukan hasil simpan sesi ini.");
   System.Diagnostics.Process.Start("explorer.exe","/select,\""+sp+"\""); return new Dictionary<string,object>{{"ok",true}};}
  if(p=="/rpt/batch") return Batch(b);
  if(p=="/rpt/saveAs"){ var d=GetDoc(b); string dir=System.IO.Path.GetDirectoryName(d.Path); string nm=System.IO.Path.GetFileNameWithoutExtension(d.Path);
   nm=Regex.Replace(nm,@"_edit(_\d+)?$","");
   // simpan pertama = nama unik; simpan berikutnya dari dokumen yang sama menimpa berkas buatan sesi ini (path dikirim UI, harus _edit*.rpt di bawah root dan tercatat madeOut)
   string outp=null, prev=b.ContainsKey("outPath")&&b["outPath"]!=null?Convert.ToString(b["outPath"]):null;
   if(prev!=null){ try{ string pf=Under(prev); if(madeOut.Contains(pf)&&Regex.IsMatch(System.IO.Path.GetFileName(pf),@"_edit(_\d+)?\.rpt$",RegexOptions.IgnoreCase)&&!string.Equals(pf,d.Path,StringComparison.OrdinalIgnoreCase)) outp=pf; }catch{} }
   bool over=outp!=null; if(outp==null) outp=UniqueOut(dir,nm);
   d.R.SaveAs(outp); madeOut.Add(outp); return new Dictionary<string,object>{{"saved",outp},{"name",System.IO.Path.GetFileName(outp)},{"overwrote",over}};}
  if(p=="/rpt/close"){ string id=(string)b["docId"]; Doc d; if(docs.TryGetValue(id,out d)){try{d.R.Close();d.R.Dispose();}catch{} if(d.TempBase)try{File.Delete(d.Base);}catch{} docs.Remove(id);} return new Dictionary<string,object>{{"ok",true}};}
  return null;
 }
 // ---------- undo/redo berbasis log ----------
 static void Commit(Doc d,List<Dictionary<string,object>> applied){
  if(d.Pos<d.Log.Count) d.Log.RemoveRange(d.Pos,d.Log.Count-d.Pos);
  d.Log.Add(applied); d.Pos=d.Log.Count;
  while(d.Log.Count>100){ // buang entri terlama: jadikan hasilnya baseline baru (file sementara)
   var r=new CE.ReportDocument(); r.Load(d.Base); foreach(var op in d.Log[0]) Op(r,op);
   string dir=System.IO.Path.Combine(System.IO.Path.GetTempPath(),"StemRpt"); Directory.CreateDirectory(dir);
   string nb=System.IO.Path.Combine(dir,Guid.NewGuid().ToString("N")+".rpt"); r.SaveAs(nb); r.Close(); r.Dispose();
   if(d.TempBase)try{File.Delete(d.Base);}catch{} d.Base=nb; d.TempBase=true; d.Log.RemoveAt(0); d.Pos--; }}
 static void Rebuild(Doc d){
  try{d.R.Close();d.R.Dispose();}catch{}
  var r=new CE.ReportDocument(); r.Load(d.Base); d.R=r;
  for(int i=0;i<d.Pos;i++) foreach(var op in d.Log[i]) Op(r,op);}
 // ---------- batch ke banyak layout ----------
 static string TextOf(TextObject to){var sb=new StringBuilder(); bool first=true; foreach(Paragraph pg in to.Paragraphs){ if(!first)sb.Append(" | "); first=false; foreach(ParagraphElement pe in pg.ParagraphElements){var t=pe as ParagraphTextElement; var f=pe as ParagraphFieldElement; if(t!=null)sb.Append(t.Text); if(f!=null)sb.Append(f.DataSource);}} return sb.ToString();}
 static bool Ci(string hay,string needle){return hay!=null&&hay.IndexOf(needle,StringComparison.OrdinalIgnoreCase)>=0;}
 static List<string> FindMatches(CE.ReportDocument d,Dictionary<string,object> f){
  string kind=f.ContainsKey("kind")?(string)f["kind"]:null, tc=f.ContainsKey("textContains")?(string)f["textContains"]:null, sc=f.ContainsKey("sourceContains")?(string)f["sourceContains"]:null, sec=f.ContainsKey("section")?(string)f["section"]:null, nm=f.ContainsKey("name")?(string)f["name"]:null;
  if(kind==null&&tc==null&&sc==null&&sec==null&&nm==null) throw new Exception("find kosong (isi kind/textContains/sourceContains/section/name).");
  var res=new List<string>();
  // section: cocok persis (case-insens) diutamakan; bila tidak ada yang persis, cocok awalan tanpa spasi ("Detail" -> "Detail Section1", "Page Header" -> "PageHeaderSection1")
  bool exactSec=false; string secN=sec==null?null:sec.Replace(" ",""); if(sec!=null) foreach(var s0 in Secs(d)) if(string.Equals(s0.Name,sec,StringComparison.OrdinalIgnoreCase)) exactSec=true;
  foreach(var s in Secs(d)){ if(sec!=null&&(exactSec?!string.Equals(s.Name,sec,StringComparison.OrdinalIgnoreCase):(secN==""||!s.Name.Replace(" ","").StartsWith(secN,StringComparison.OrdinalIgnoreCase)))) continue;
   foreach(ReportObject o in s.ReportObjects){
    if(nm!=null&&o.Name!=nm) continue;
    string k=o.Kind.ToString().Replace("crReportObjectKind","");
    if(kind!=null&&!string.Equals(k,kind,StringComparison.OrdinalIgnoreCase)) continue;
    if(tc!=null){var to=o as TextObject; if(to==null||!Ci(TextOf(to),tc)) continue;}
    if(sc!=null){var fo=o as FieldObject; if(fo==null||!Ci(fo.DataSource,sc)) continue;}
    res.Add(o.Name);}}
  return res;}
 static string UniqueOut(string dir,string nm){ string p=System.IO.Path.Combine(dir,nm+"_edit.rpt"); for(int i=2;File.Exists(p);i++) p=System.IO.Path.Combine(dir,nm+"_edit_"+i+".rpt"); return p;} // anti-timpa: _edit, _edit_2, _edit_3, ...
 static bool IsAll(Dictionary<string,object> f){return f.ContainsKey("all")&&f["all"]!=null&&Convert.ToBoolean(f["all"]);}
 // jalankan satu op batch pada dokumen terbuka; kembalikan nama objek yang cocok (untuk pratinjau)
 static string Trunc(string x){ if(x==null)return ""; return x.Length>160?x.Substring(0,157)+"...":x;}
 static string ValOf(ReportObject o){ var to=o as TextObject; if(to!=null)return TextOf(to); var fo=o as FieldObject; if(fo!=null)return fo.DataSource; return o.Kind.ToString().Replace("crReportObjectKind","");}
 static string PropStr(ReportObject o,Dictionary<string,object> op){ var l=new List<string>(); var to=o as TextObject; var fo=o as FieldObject; var bx=o as BoxObject; var ln=o as LineObject;
  try{ FontColor fc=to!=null?to.FontColor:(fo!=null?fo.FontColor:null);
   if(fc!=null&&Has(op,"font")&&op["font"]!=null){ var f=FontOf(fc); foreach(var kv in (Dictionary<string,object>)op["font"]) if(f.ContainsKey(kv.Key)) l.Add("font."+kv.Key+"="+f[kv.Key]); }
   if(fc!=null&&Has(op,"fc")) l.Add("fc="+Col(fc.Color)); }catch{}
  try{ if(Has(op,"sup")){ string ft=""; try{ft=CfText(o.Format.ConditionFormulas[SupKey]);}catch{} l.Add("sup="+(ft!=""?"jika "+ft:(o.Format.EnableSuppress?"selalu":"tampil"))); } }catch{}
  try{ if(Has(op,"ha")) l.Add("ha="+Al(o.Format.HorizontalAlignment)); if(Has(op,"va")) l.Add("va="+Al(o.Format.VerticalAlignment)); }catch{}
  try{ if(Has(op,"bg")) l.Add("bg="+Col(o.Border.BackgroundColor)); if(Has(op,"bdc")) l.Add("bdc="+Col(o.Border.BorderColor)); }catch{}
  try{ if(bx!=null){ if(Has(op,"lt"))l.Add("lt="+bx.LineThickness); if(Has(op,"lc"))l.Add("lc="+Col(bx.LineColor)); if(Has(op,"fill"))l.Add("fill="+Col(bx.FillColor)); } if(ln!=null){ if(Has(op,"lt"))l.Add("lt="+ln.LineThickness); if(Has(op,"lc"))l.Add("lc="+Col(ln.LineColor)); } }catch{}
  return string.Join("; ",l);}
 static HashSet<string> AllNames(CE.ReportDocument d){var u=new HashSet<string>();foreach(var s in Secs(d))foreach(ReportObject o in s.ReportObjects)u.Add(o.Name);return u;}
 // jalankan Op pada satu objek dan catat {name,before,after} (nilai dibaca dari dokumen terbuka; tidak menyimpan apa pun)
 static void OpTracked(CE.ReportDocument d,Dictionary<string,object> o2,List<object> changes){
  string k=(string)o2["op"],nm=o2.ContainsKey("name")?o2["name"] as string:null,before="",after=""; HashSet<string> n0=null; bool tr=nm!=null&&!k.StartsWith("add")&&k!="setSectionHeight";
  if(tr){ try{ Section sx; var ob=Find(d,nm,out sx); before=k=="setProps"?PropStr(ob,o2):ValOf(ob); n0=AllNames(d);}catch{} }
  Op(d,o2);
  if(!tr) return;
  try{ Section sx; if(k=="delete") after="(dihapus)";
   else if(k=="cloneTo"||k=="clone"){ string nn=null; foreach(var x in AllNames(d)) if(!n0.Contains(x)) nn=x; var nb=Find(d,nn,out sx); after=ValOf(nb); nm=nm+" -> "+nn; }
   else { var ob=Find(d,nm,out sx); after=k=="setProps"?PropStr(ob,o2):ValOf(ob); } }catch{}
  changes.Add(new Dictionary<string,object>{{"name",nm},{"before",Trunc(before)},{"after",Trunc(after)}});}
 // jalankan satu op batch pada dokumen terbuka; kembalikan nama objek yang cocok (untuk pratinjau) + perubahan sebelum/sesudah
 static List<string> BatchOp(CE.ReportDocument d,Dictionary<string,object> op,int idx,List<object> changes){
  string k=(string)op["op"]; if(k=="copy"||k=="paste") throw new Exception("op "+k+" tidak didukung di batch.");
  var matched=new List<string>();
  if(k=="find"){ // hanya membaca: daftar objek yang cocok (untuk pemeriksaan pencarian di wizard); tidak mengubah apa pun
   if(!op.ContainsKey("find")||op["find"]==null) throw new Exception("op find: isi find.");
   matched=FindMatches(d,(Dictionary<string,object>)op["find"]); if(matched.Count==0) throw new SkipEx("op #"+(idx+1)+" (find): tidak ada objek yang cocok.");
   foreach(var nm in matched){ Section sx; var ob=Find(d,nm,out sx); changes.Add(new Dictionary<string,object>{{"name",nm},{"before",Trunc(ValOf(ob))},{"after","(tidak diubah)"}}); }
   return matched;}
  if(op.ContainsKey("find")&&op["find"]!=null){ var f=(Dictionary<string,object>)op["find"]; matched=FindMatches(d,f);
   if(matched.Count==0) throw new SkipEx("op #"+(idx+1)+" ("+k+"): tidak ada objek yang cocok dengan find.");
   if(matched.Count>1&&!IsAll(f)) throw new SkipEx("op #"+(idx+1)+" ("+k+"): "+matched.Count+" objek cocok ("+string.Join(",",matched)+"); persempit find atau set all=true.");
   foreach(var nm in matched){ var o2=new Dictionary<string,object>(op); o2["name"]=nm; o2.Remove("find"); OpTracked(d,o2,changes);}
  } else { OpTracked(d,op,changes); if(op.ContainsKey("name")&&op["name"]!=null) matched.Add((string)op["name"]); }
  return matched;}
 static Dictionary<string,object> Batch(Dictionary<string,object> b){
  var paths=new List<string>(); foreach(var x in (System.Collections.IEnumerable)b["paths"]) paths.Add(Convert.ToString(x));
  if(paths.Count==0) throw new Exception("paths kosong."); if(paths.Count>200) throw new Exception("Maksimal 200 file per permintaan batch.");
  var ops=new List<Dictionary<string,object>>(); foreach(Dictionary<string,object> op in (System.Collections.IEnumerable)b["ops"]) ops.Add(op);
  if(ops.Count==0) throw new Exception("ops kosong.");
  bool dry=b.ContainsKey("dry")&&b["dry"]!=null&&Convert.ToBoolean(b["dry"]); if(!dry&&ops.TrueForAll(x=>(string)x["op"]=="find")) throw new Exception("op find hanya untuk pratinjau (dry=true)."); bool save=!b.ContainsKey("save")||b["save"]==null||Convert.ToBoolean(b["save"]);
  var full=new List<string>(); foreach(var p in paths){ string f=Under(p); if(!string.Equals(System.IO.Path.GetExtension(f),".rpt",StringComparison.OrdinalIgnoreCase)) throw new Exception("Bukan file .rpt: "+p); full.Add(f);}
  var results=new List<object>(); int nok=0,nskip=0,nerr=0; var deadline=DateTime.UtcNow.AddMinutes(10);
  foreach(var f in full){
   var res=new Dictionary<string,object>{{"path",f},{"name",System.IO.Path.GetFileName(f)},{"status","ok"},{"message",""},{"matches",new List<object>()},{"saved",null}};
   CE.ReportDocument r=null;
   try{
    if(DateTime.UtcNow>deadline) throw new Exception("batas waktu batch terlampaui; file tidak diproses.");
    if(!File.Exists(f)) throw new Exception("file tidak ada.");
    r=new CE.ReportDocument(); r.Load(f);
    var ml=(List<object>)res["matches"]; var work=new List<Dictionary<string,object>>();
    for(int i=0;i<ops.Count;i++){ var chg=new List<object>(); var names=BatchOp(r,ops[i],i,chg); ml.Add(new Dictionary<string,object>{{"op",i},{"kind",(string)ops[i]["op"]},{"count",names.Count},{"names",names},{"changes",chg}});}
    if(!dry&&save){ string dir=System.IO.Path.GetDirectoryName(f); string nm=Regex.Replace(System.IO.Path.GetFileNameWithoutExtension(f),@"_edit(_\d+)?$","");
     string outp=UniqueOut(dir,nm); if(string.Equals(outp,f,StringComparison.OrdinalIgnoreCase)) throw new Exception("tujuan sama dengan sumber."); r.SaveAs(outp); madeOut.Add(outp); res["saved"]=outp; res["savedName"]=System.IO.Path.GetFileName(outp); res["message"]="disimpan sebagai "+System.IO.Path.GetFileName(outp); }
    else res["message"]=dry?"pratinjau (tidak disimpan)":"diterapkan (tidak disimpan)";
    nok++;
   }catch(SkipEx e){ res["status"]="skip"; res["message"]=e.Message; nskip++; Log("batch skip "+System.IO.Path.GetFileName(f)+": "+e.Message);}
   catch(Exception e){ res["status"]="error"; res["message"]=e.Message; nerr++; Log("batch error "+System.IO.Path.GetFileName(f)+": "+e.Message);}
   finally{ if(r!=null){ try{r.Close();}catch{} try{r.Dispose();}catch{} } }
   results.Add(res);}
  return new Dictionary<string,object>{{"results",results},{"ok",nok},{"skip",nskip},{"error",nerr},{"dry",dry}};}
 // ---------- Verify (satu-satunya jalur ke DB; tanpa SELECT) ----------
 static void Logon(CE.ReportDocument r,string drv,string server,string user,string pw){
  foreach(CE.Table t in r.Database.Tables){ var li=t.LogOnInfo; var c=li.ConnectionInfo; c.UserID=user; c.Password=pw;
   c.LogonProperties.Set("Connection String","DRIVER={"+drv+"};SERVERNODE="+server); t.ApplyLogOnInfo(li);}}
 static Dictionary<string,object> Verify(Doc d,Dictionary<string,object> b){
  string server=(string)b["server"],user=(string)b["user"],pw=b.ContainsKey("password")&&b["password"]!=null?(string)b["password"]:"";
  var r=d.R; bool ok=false; string msg="";
  var origCs=new List<string>(); var origUser=new List<string>();
  try{ foreach(CE.Table t in r.Database.Tables){ var c=t.LogOnInfo.ConnectionInfo; origUser.Add(c.UserID); string cs=null; try{cs=(string)c.LogonProperties.Lookup("Connection String");}catch{} origCs.Add(cs);} }catch{}
  try{
   Logon(r,"HDBODBC",server,user,pw);
   if(b.ContainsKey("params")&&b["params"]!=null) foreach(var kv in (Dictionary<string,object>)b["params"]){ object v=kv.Value; if(v is decimal)v=Convert.ToDouble(v); r.SetParameterValue(kv.Key,v);}
   r.VerifyDatabase(); ok=true; int n=0; foreach(CE.Table t in r.Database.Tables) n+=t.Fields.Count; msg="Verify Database berhasil ("+n+" field).";
  }catch(Exception e){ string em=e.Message; if(pw!="")em=em.Replace(pw,"***"); msg="Verify gagal: "+Friendly(em); }
  finally{
   try{ int i=0; foreach(CE.Table t in r.Database.Tables){ var li=t.LogOnInfo; var c=li.ConnectionInfo; c.Password="";
     c.UserID=i<origUser.Count?origUser[i]:user;
     string cs=i<origCs.Count?origCs[i]:null; if(cs==null) cs="DRIVER={HDBODBC32};SERVERNODE="+server;
     c.LogonProperties.Set("Connection String",cs); t.ApplyLogOnInfo(li); i++; } }catch(Exception e){ Log("verify-restore: "+(pw!=""?e.Message.Replace(pw,"***"):e.Message)); msg+=" (peringatan: gagal mengembalikan driver)"; }
   d.Log.Clear(); d.Pos=0; }
  return new Dictionary<string,object>{{"ok",ok},{"message",msg}};}
 // ---------- Preview (PDF di memori; salinan .rpt sementara dihapus di finally) ----------
 static string PrevDir{get{return System.IO.Path.Combine(System.IO.Path.GetTempPath(),"StemRpt");}}
 static void CleanPrev(){try{ if(!Directory.Exists(PrevDir))return; foreach(var f in Directory.GetFiles(PrevDir,"prev_*.rpt")){ try{ if(File.GetLastWriteTime(f)<DateTime.Now.AddHours(-1))File.Delete(f);}catch{} } }catch{}}
 static PdfRes Preview(Doc d,string server,string user,string pw,Dictionary<string,object> b){
  Directory.CreateDirectory(PrevDir); string tmp=System.IO.Path.Combine(PrevDir,"prev_"+Guid.NewGuid().ToString("N")+".rpt"); CE.ReportDocument r=null;
  try{
   d.R.SaveAs(tmp); r=new CE.ReportDocument(); r.Load(tmp);
   Logon(r,"HDBODBC",server,user,pw);
   var given=new Dictionary<string,object>(StringComparer.OrdinalIgnoreCase);
   if(b.ContainsKey("params")&&b["params"]!=null) foreach(var kv in (Dictionary<string,object>)b["params"]) given[kv.Key.Trim().Trim('?','@')]=kv.Value;
   foreach(CrystalDecisions.Shared.ParameterField pf in r.ParameterFields){
    if(!string.IsNullOrEmpty(pf.ReportName))continue;
    string nm=pf.Name; object v; bool has=given.TryGetValue(nm.Trim().Trim('?','@'),out v)&&v!=null&&Convert.ToString(v).Trim()!="";
    if(!has){ if(!pf.HasCurrentValue&&!pf.IsOptionalPrompt&&pf.CurrentValues.Count==0&&pf.DefaultValues.Count==0) throw new Exception("Parameter wajib belum diisi: "+nm); continue; }
    string sv=Convert.ToString(v,System.Globalization.CultureInfo.InvariantCulture).Trim(); object val; var k=pf.ParameterValueKind;
    if(k==CrystalDecisions.Shared.ParameterValueKind.NumberParameter||k==CrystalDecisions.Shared.ParameterValueKind.CurrencyParameter){ double dn; if(!double.TryParse(sv,System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out dn)) throw new Exception("Parameter "+nm+" harus angka: "+sv); val=dn;}
    else if(k==CrystalDecisions.Shared.ParameterValueKind.DateParameter||k==CrystalDecisions.Shared.ParameterValueKind.DateTimeParameter||k==CrystalDecisions.Shared.ParameterValueKind.TimeParameter){ DateTime dt; if(!DateTime.TryParse(sv,System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.None,out dt)) throw new Exception("Parameter "+nm+" harus tanggal (yyyy-MM-dd): "+sv); val=dt;}
    else if(k==CrystalDecisions.Shared.ParameterValueKind.BooleanParameter){ val=(sv=="1"||sv.Equals("true",StringComparison.OrdinalIgnoreCase)); }
    else val=sv;
    r.SetParameterValue(nm,val);
   }
   int pages=0; byte[] bytes;
   using(var ms=r.ExportToStream(CrystalDecisions.Shared.ExportFormatType.PortableDocFormat)){ using(var m2=new MemoryStream()){ ms.CopyTo(m2); bytes=m2.ToArray(); } }
   try{ pages=r.FormatEngine.GetLastPageNumber(new CrystalDecisions.Shared.ReportPageRequestContext()); }catch{}
   return new PdfRes{Bytes=bytes,Pages=pages};
  }finally{
   if(r!=null){ try{r.Close();}catch{} try{r.Dispose();}catch{} }
   try{ if(File.Exists(tmp))File.Delete(tmp); }catch(Exception e){ Log("preview-hapus: "+e.Message); }
  }}
 // ---------- dump ----------
 static IEnumerable<Section> Secs(CE.ReportDocument d){foreach(Area ar in d.ReportClientDocument.ReportDefController.ReportDefinition.Areas) foreach(Section s in ar.Sections) yield return s;}
 static Dictionary<string,object> FontOf(FontColor c){var f=c.Font; return new Dictionary<string,object>{{"n",f.Name},{"s",(double)f.Size},{"b",f.Bold},{"i",f.Italic},{"u",f.Underline},{"x",f.Strikethrough}};}
 static Dictionary<string,int> Offs(CE.ReportDocument d){var o=new Dictionary<string,int>();int y=0;foreach(var s in Secs(d)){o[s.Name]=y;y+=s.Height;}return o;}
 static string Col(object c){try{long v=Convert.ToInt64(c); if(v==0xFFFFFFFFL||v==-1)return null; long r=v&255,g=(v>>8)&255,b=(v>>16)&255; return "#"+r.ToString("x2")+g.ToString("x2")+b.ToString("x2");}catch{return null;}}
 static uint ToCol(object o){ if(o==null) return 0xFFFFFFFF; string s=((string)o).TrimStart('#'); if(s.Length!=6) throw new Exception("Warna harus #rrggbb: "+o);
  int r=Convert.ToInt32(s.Substring(0,2),16),g=Convert.ToInt32(s.Substring(2,2),16),b=Convert.ToInt32(s.Substring(4,2),16); return (uint)((b<<16)|(g<<8)|r);}
 static string Al(object e){string s=e==null?"":e.ToString(); if(s.Contains("Center"))return "c"; if(s.Contains("Right"))return "r"; if(s.Contains("Justif"))return "j"; if(s.Contains("Bottom"))return "b"; if(s.Contains("Left"))return "l"; return "";}
 static bool Ln(object e){string s=e==null?"":e.ToString(); return s!=""&&!s.Contains("NoLine");}
 static int AbsH(object n,Section own,Dictionary<string,int> off){ // tinggi absolut Box/Line (Bottom relatif ke EndSectionName)
  var bx=n as BoxObject; if(bx!=null){return off[bx.EndSectionName]+bx.Bottom-(off[own.Name]+bx.Top);}
  var ln=n as LineObject; if(ln!=null){return off[ln.EndSectionName]+ln.Bottom-(off[own.Name]+ln.Top);}
  return ((ReportObject)n).Height;}
 static Dictionary<string,object> Dump(string id,Doc dc){
  var d=dc.R; var list=new List<object>(); var secs=new List<object>(); var off=Offs(d);
  foreach(var s in Secs(d)){
   var sd=new Dictionary<string,object>{{"name",s.Name},{"h",s.Height},{"top",off[s.Name]}};
   try{ var sf=s.Format; string ft=""; try{ ft=CfText(sf.ConditionFormulas[SecSupKey]); }catch{} sd["sup"]=ft!=""?"if":(sf.EnableSuppress?"always":"no"); sd["supBlank"]=sf.EnableSuppressIfBlank; if(ft!=""){ sd["supf"]=ft; sd["supk"]=RecogCond(ft)?"pattern":"custom"; } }catch{}
   secs.Add(sd);
   foreach(ReportObject o in s.ReportObjects){
    var m=new Dictionary<string,object>{{"section",s.Name},{"name",o.Name},{"kind",o.Kind.ToString().Replace("crReportObjectKind","")},{"l",o.Left},{"t",o.Top},{"w",o.Width},{"h",o.Height}};
    try{m["ha"]=Al(o.Format.HorizontalAlignment); m["va"]=Al(o.Format.VerticalAlignment);}catch{}
    try{var b=o.Border; m["bd"]=new Dictionary<string,object>{{"l",Ln(b.LeftLineStyle)},{"r",Ln(b.RightLineStyle)},{"t",Ln(b.TopLineStyle)},{"b",Ln(b.BottomLineStyle)}}; m["bdc"]=Col(b.BorderColor); m["bg"]=Col(b.BackgroundColor);}catch{}
    try{ var fm=o.Format; string ft=""; try{ ft=CfText(fm.ConditionFormulas[SupKey]); }catch{} m["sup"]=ft!=""?"if":(fm.EnableSuppress?"always":"no"); if(ft!=""){ m["supf"]=ft; m["supk"]=RecogCond(ft)?"pattern":"custom"; } }catch{} // tidak ada kunci "sup" bila SDK menolak membaca: UI menyembunyikan kartu Tampilan
    var to=o as TextObject; if(to!=null){
     try{var sb=new StringBuilder(); var lines=new List<object>(); bool first=true;
      foreach(Paragraph pg in to.Paragraphs){var sb2=new StringBuilder(); Dictionary<string,object> fnt=null; string fcol=null;
       foreach(ParagraphElement pe in pg.ParagraphElements){var t=pe as ParagraphTextElement; var f=pe as ParagraphFieldElement;
        if(t!=null)sb2.Append(t.Text); if(f!=null)sb2.Append(f.DataSource);
        if(fnt==null){try{fnt=FontOf(pe.FontColor);fcol=Col(pe.FontColor.Color);}catch{}}}
       if(!first)sb.Append(" | "); first=false; sb.Append(sb2.ToString());
       var ln2=new Dictionary<string,object>{{"t",sb2.ToString()},{"ha",Al(pg.Alignment)}}; if(fnt!=null){ln2["font"]=fnt;ln2["fc"]=fcol;} lines.Add(ln2);}
      m["text"]=sb.ToString(); m["lines"]=lines;}catch{}
     try{m["font"]=FontOf(to.FontColor); m["fc"]=Col(to.FontColor.Color);}catch{}
     try{if(m["ha"]==null||(string)m["ha"]==""){string pa=Al(to.Paragraphs[0].Alignment); if(pa!="")m["ha"]=pa;}}catch{}}
    var fo=o as FieldObject; if(fo!=null){
     try{m["text"]=fo.DataSource; if(SpecialType(fo.DataSource)>=0&&!fo.DataSource.Contains("{"))m["special"]=true;}catch{}
     try{m["ftype"]=fo.FieldValueType.ToString().Replace("crFieldValueType","");}catch{}
     try{m["font"]=FontOf(fo.FontColor); m["fc"]=Col(fo.FontColor.Color);}catch{}}
    var bx=(object)o as BoxObject; if(bx!=null){try{m["h"]=AbsH(bx,s,off); m["end"]=bx.EndSectionName; m["bot"]=bx.Bottom; m["ext"]=bx.EnableExtendToBottomOfSection; m["lt"]=bx.LineThickness; m["lc"]=Col(bx.LineColor); m["ls"]=Ln(bx.LineStyle); m["fill"]=Col(bx.FillColor); m["rx"]=bx.CornerEllipseWidth;}catch{}}
    var ln=(object)o as LineObject; if(ln!=null){try{m["h"]=AbsH(ln,s,off); m["end"]=ln.EndSectionName; m["bot"]=ln.Bottom; m["ext"]=ln.EnableExtendToBottomOfSection; m["lt"]=ln.LineThickness; m["lc"]=Col(ln.LineColor); m["ls"]=Ln(ln.LineStyle);}catch{}}
    list.Add(m);}}
  int pw=11900; try{pw=d.PrintOptions.PageContentWidth;}catch{}
  return new Dictionary<string,object>{{"docId",id},{"path",dc.Path},{"pageW",pw},{"sections",secs},{"objects",list},{"clip",clip==null?null:clip.Count+" objek (dari "+clipFrom+")"},{"clipCount",clip==null?0:clip.Count},{"canUndo",dc.Pos>0},{"canRedo",dc.Pos<dc.Log.Count}};}
 // ---------- operasi ----------
 static Section Sec(CE.ReportDocument d,string n){foreach(var s in Secs(d)) if(s.Name==n) return s; throw new Exception("section "+n+" tidak ada");}
 static ReportObject Find(CE.ReportDocument d,string n,out Section sec){foreach(var s in Secs(d)) foreach(ReportObject o in s.ReportObjects) if(o.Name==n){sec=s;return o;} throw new Exception("objek "+n+" tidak ada");}
 static int I(object o){return Convert.ToInt32(o);}
 static bool Has(Dictionary<string,object> op,string k){return op.ContainsKey(k);}
 static void Geo(object n,Section own,CE.ReportDocument d,Dictionary<string,object> op){ // l,t,w,h; Box/Line: Bottom relatif ke EndSectionName
  var off=Offs(d); var ro=n as ReportObject; var bx=n as BoxObject; var ln=n as LineObject;
  int cl=bx!=null?bx.Left:(ln!=null?ln.Left:ro.Left), ct=bx!=null?bx.Top:(ln!=null?ln.Top:ro.Top);
  int cw=bx!=null?bx.Right-bx.Left:(ln!=null?ln.Right-ln.Left:ro.Width);
  int ch=(bx!=null||ln!=null)?AbsH(n,own,off):ro.Height;
  int l=op.ContainsKey("l")?I(op["l"]):cl, t=op.ContainsKey("t")?I(op["t"]):ct, w=op.ContainsKey("w")?I(op["w"]):cw, h=op.ContainsKey("h")?I(op["h"]):ch;
  if(l<0||t<0||w<0||h<0) throw new Exception("Nilai negatif tidak diizinkan.");
  if(bx==null&&ln==null){ if(own.Height>0&&t>own.Height) throw new Exception("Posisi di luar section "+own.Name+" (tinggi "+own.Height+")."); ro.Left=l;ro.Top=t;ro.Width=w;ro.Height=h;return;}
  int absBottom=off[own.Name]+t+h; string end=own.Name; int endTop=off[own.Name];
  foreach(var s in Secs(d)){ if(off[s.Name]<=absBottom){end=s.Name;endTop=off[s.Name];} }
  if(bx!=null){bx.Left=l;bx.Top=t;bx.Right=l+w;bx.EndSectionName=end;bx.Bottom=absBottom-endTop;}
  else{ln.Left=l;ln.Top=t;ln.Right=l+w;ln.EndSectionName=end;ln.Bottom=absBottom-endTop;}}
 static string NewName(CE.ReportDocument d,string baseName){var used=new HashSet<string>();foreach(var s in Secs(d))foreach(ReportObject o in s.ReportObjects)used.Add(o.Name);string n=baseName;int i=1;while(used.Contains(n))n=baseName+(++i);return n;}
 static CrAlignmentEnum HA(string v){switch(v){case "l":return CrAlignmentEnum.crAlignmentLeft;case "c":return CrAlignmentEnum.crAlignmentHorizontalCenter;case "r":return CrAlignmentEnum.crAlignmentRight;case "j":return CrAlignmentEnum.crAlignmentJustified;} throw new Exception("ha harus l|c|r|j");}
 static CrAlignmentEnum VA(string v){switch(v){case "t":return CrAlignmentEnum.crAlignmentTop;case "c":return CrAlignmentEnum.crAlignmentVerticalCenter;case "b":return CrAlignmentEnum.crAlignmentBottom;} throw new Exception("va harus t|c|b");}
 static CrLineStyleEnum LS(bool on){return on?CrLineStyleEnum.crLineStyleSingle:CrLineStyleEnum.crLineStyleNoLine;}
 static void ApplyFont(FontColor fc,Dictionary<string,object> f){var ft=fc.Font;
  if(f.ContainsKey("n"))ft.Name=(string)f["n"]; if(f.ContainsKey("s"))ft.Size=Convert.ToDecimal(f["s"]);
  if(f.ContainsKey("b"))ft.Bold=Convert.ToBoolean(f["b"]); if(f.ContainsKey("i"))ft.Italic=Convert.ToBoolean(f["i"]);
  if(f.ContainsKey("u"))ft.Underline=Convert.ToBoolean(f["u"]); if(f.ContainsKey("x"))ft.Strikethrough=Convert.ToBoolean(f["x"]);}
 static Dictionary<string,object> DefFont(Dictionary<string,object> op){var f=new Dictionary<string,object>{{"n","Calibri"},{"s",9.0},{"b",false},{"i",false},{"u",false},{"x",false}};
  if(op.ContainsKey("font")&&op["font"]!=null) foreach(var kv in (Dictionary<string,object>)op["font"]) f[kv.Key]=kv.Value; return f;}
 static void SetProps(ReportObject n,Dictionary<string,object> op){
  var to=n as TextObject; var fo=n as FieldObject; var bx=n as BoxObject; var ln=n as LineObject;
  if(to!=null||fo!=null){
   var fcs=new List<FontColor>(); if(to!=null){fcs.Add(to.FontColor); foreach(Paragraph pg in to.Paragraphs) foreach(ParagraphElement pe in pg.ParagraphElements) fcs.Add(pe.FontColor);} else fcs.Add(fo.FontColor);
   if(Has(op,"font")&&op["font"]!=null) foreach(var fc in fcs) ApplyFont(fc,(Dictionary<string,object>)op["font"]);
   if(Has(op,"fc")) {uint c=ToCol(op["fc"]); foreach(var fc in fcs) fc.Color=c;}
   if(Has(op,"ha")){var a=HA((string)op["ha"]); n.Format.HorizontalAlignment=a; if(to!=null) foreach(Paragraph pg in to.Paragraphs) pg.Alignment=a;}
   if(Has(op,"va")) n.Format.VerticalAlignment=VA((string)op["va"]);}
  if(to!=null||fo!=null||bx!=null||ln!=null){
   if(Has(op,"bg")) n.Border.BackgroundColor=ToCol(op["bg"]);
   if(Has(op,"bdc")) n.Border.BorderColor=ToCol(op["bdc"]);
   if(Has(op,"bd")&&op["bd"]!=null){var bd=(Dictionary<string,object>)op["bd"]; var B=n.Border;
    if(bd.ContainsKey("l"))B.LeftLineStyle=LS(Convert.ToBoolean(bd["l"])); if(bd.ContainsKey("r"))B.RightLineStyle=LS(Convert.ToBoolean(bd["r"]));
    if(bd.ContainsKey("t"))B.TopLineStyle=LS(Convert.ToBoolean(bd["t"])); if(bd.ContainsKey("b"))B.BottomLineStyle=LS(Convert.ToBoolean(bd["b"]));}}
  if(bx!=null){ if(Has(op,"lt"))bx.LineThickness=I(op["lt"]); if(Has(op,"lc"))bx.LineColor=ToCol(op["lc"]); if(Has(op,"ls"))bx.LineStyle=LS(Convert.ToBoolean(op["ls"]));
   if(Has(op,"fill"))bx.FillColor=ToCol(op["fill"]); if(Has(op,"rx")){bx.CornerEllipseWidth=I(op["rx"]);bx.CornerEllipseHeight=I(op["rx"]);}}
  if(ln!=null){ if(Has(op,"lt"))ln.LineThickness=I(op["lt"]); if(Has(op,"lc"))ln.LineColor=ToCol(op["lc"]); if(Has(op,"ls"))ln.LineStyle=LS(Convert.ToBoolean(op["ls"]));}}
 // special field yang TERBUKTI jalan lewat RAS (probe: tambah -> SaveAs -> buka ulang; DataSource = nama polos, mis. "PageNofM")
 static object[] SP(string label,string src,CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum t){return new object[]{label,src,(int)t};}
 static readonly object[][] Specials=new object[][]{
  SP("Page Number","PageNumber",CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum.crFieldValueTypeInt32uField),
  SP("Total Page Count","TotalPageCount",CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum.crFieldValueTypeInt32uField),
  SP("Page N of M","PageNofM",CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum.crFieldValueTypeStringField),
  SP("Print Date","PrintDate",CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum.crFieldValueTypeDateField),
  SP("Print Time","PrintTime",CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum.crFieldValueTypeTimeField),
  SP("Data Date","DataDate",CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum.crFieldValueTypeDateField),
  SP("Data Time","DataTime",CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum.crFieldValueTypeTimeField),
  SP("Record Number","RecordNumber",CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum.crFieldValueTypeInt32uField),
  SP("Group Number","GroupNumber",CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum.crFieldValueTypeInt32uField),
  SP("Report Title","ReportTitle",CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum.crFieldValueTypeStringField),
  SP("Report Comments","ReportComments",CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum.crFieldValueTypeStringField),
  SP("File Name","Filename",CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum.crFieldValueTypeStringField),
  SP("File Author","FileAuthor",CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum.crFieldValueTypeStringField),
  SP("Modification Date","ModificationDate",CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum.crFieldValueTypeDateField),
  SP("Modification Time","ModificationTime",CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum.crFieldValueTypeTimeField)};
 static int SpecialType(string src){ if(src==null)return -1; string s=src.Trim(); foreach(var sp in Specials) if(string.Equals((string)sp[1],s,StringComparison.OrdinalIgnoreCase)) return (int)sp[2]; return -1;}
 static string SpecialName(string src){ string s=src.Trim(); foreach(var sp in Specials) if(string.Equals((string)sp[1],s,StringComparison.OrdinalIgnoreCase)) return (string)sp[1]; return s;}
 static List<object> SpecialList(){var l=new List<object>(); foreach(var sp in Specials) l.Add(new Dictionary<string,object>{{"label",sp[0]},{"source",sp[1]},{"type",sp[2]}}); return l;}
 static int FindFieldType(CE.ReportDocument d,string src){ // -1 = tidak ada; tipe DBField (11 String,6 Number,15 DateTime) atau 11 utk formula/parameter
  string s=src.Trim();
  if(s.StartsWith("{@")){ string nm=s.Substring(2).TrimEnd('}'); foreach(CE.FormulaFieldDefinition f in d.DataDefinition.FormulaFields) if(string.Equals(f.FormulaName.TrimStart('@'),nm,StringComparison.OrdinalIgnoreCase)) return FvToInt(f.ValueType.ToString()); return -1;}
  if(s.StartsWith("{?")){ string nm=s.Substring(2).TrimEnd('}'); foreach(CE.ParameterFieldDefinition f in d.DataDefinition.ParameterFields) if(string.Equals(f.Name.TrimStart('?'),nm,StringComparison.OrdinalIgnoreCase)) return FvToInt(f.ValueType.ToString()); return -1;}
  foreach(CrystalDecisions.ReportAppServer.DataDefModel.Table t in d.ReportClientDocument.DataDefController.Database.Tables)
   foreach(CrystalDecisions.ReportAppServer.DataDefModel.Field f in t.DataFields){ string a=f.FormulaForm, b="{"+t.Alias+"."+f.Name+"}";
    if(string.Equals(a,s,StringComparison.OrdinalIgnoreCase)||string.Equals(b,s,StringComparison.OrdinalIgnoreCase)) return (int)f.Type;}
  return -1;}
 static int FvToInt(string n){ n=n.ToLower(); if(n.Contains("number")||n.Contains("currency")||n.Contains("int")) return 6; if(n.Contains("datetime")) return 15; if(n.Contains("date")) return 7; return 11;}
 static List<string[]> Pairs(object v){var r=new List<string[]>(); foreach(Dictionary<string,object> x in (System.Collections.IEnumerable)v){ string f=x.ContainsKey("from")?Convert.ToString(x["from"]):""; string t=x.ContainsKey("to")&&x["to"]!=null?Convert.ToString(x["to"]):""; if(string.IsNullOrEmpty(f)) throw new Exception("pasangan ganti: 'from' kosong."); r.Add(new[]{f,t});} return r;}
 static string ReplaceCi(string s,string from,string to){return Regex.Replace(s,Regex.Escape(from),to.Replace("$","$$"),RegexOptions.IgnoreCase);}
 static string Op(Doc dc,Dictionary<string,object> op){
  if((string)op["op"]=="copy"){ var names=new List<string>();
   if(op.ContainsKey("names")&&op["names"]!=null) foreach(var x in (System.Collections.IEnumerable)op["names"]) names.Add(Convert.ToString(x)); else if(op.ContainsKey("name")) names.Add((string)op["name"]);
   if(names.Count==0) throw new Exception("copy: tidak ada objek dipilih.");
   var off=Offs(dc.R); var items=new List<ClipItem>(); int l0=0,t0=0,abs0=0;
   foreach(var nm in names){ Section sec; var o=Find(dc.R,nm,out sec); var it=new ClipItem{Obj=(ReportObject)o.Clone(true),Section=sec.Name};
    var bx=o as BoxObject; var ln=o as LineObject; int l=o.Left,t=o.Top,w=o.Width,h=o.Height;
    if(bx!=null){l=bx.Left;t=bx.Top;w=bx.Right-bx.Left;h=AbsH(bx,sec,off);} else if(ln!=null){l=ln.Left;t=ln.Top;w=ln.Right-ln.Left;h=AbsH(ln,sec,off);}
    it.W=w;it.H=h; int abs=off[sec.Name]+t;
    if(items.Count==0){l0=l;t0=t;abs0=abs;it.Dl=0;it.Dt=0;} else {it.Dl=l-l0; it.Dt=(sec.Name==items[0].Section)?t-t0:abs-abs0;}
    items.Add(it);}
   int mnL=int.MaxValue,mnT=int.MaxValue; foreach(var it in items){ if(it.Dl<mnL)mnL=it.Dl; if(it.Dt<mnT)mnT=it.Dt; } foreach(var it in items){ it.Dl-=mnL; it.Dt-=mnT; } // titik tempel = pojok kiri-atas kotak pembatas, bukan objek pertama
   clipSec=items[0].Section; clipL=l0+mnL; clipT=t0+mnT;
   clip=items; clipFrom=System.IO.Path.GetFileName(dc.Path); return "disalin "+string.Join(",",names);}
  return Op(dc.R,op);}
 // dipakai cloneTo (n = salinan) dan replace (n = klon yang di-Modify di tempat): text/source/textReplace/fieldReplace pada n; o = objek asal (untuk pesan)
 static void ApplyReplace(CE.ReportDocument d,ReportObject o,ReportObject n,Dictionary<string,object> op,string who){
  if(who=="replace"&&!((Has(op,"text")&&op["text"]!=null)||(Has(op,"source")&&op["source"]!=null)||(Has(op,"textReplace")&&op["textReplace"]!=null)||(Has(op,"fieldReplace")&&op["fieldReplace"]!=null))) throw new Exception("replace: isi text, source, textReplace, atau fieldReplace.");
   var to=n as TextObject; var fo=n as FieldObject;
   if(Has(op,"text")&&op["text"]!=null){ if(to==null) throw new Exception(who+": 'text' hanya untuk objek Teks ("+o.Name+")."); var pe=to.Paragraphs[0].ParagraphElements[0] as ParagraphTextElement; if(pe==null) throw new Exception(who+": elemen pertama "+o.Name+" bukan teks biasa."); pe.Text=(string)op["text"]; }
   if(Has(op,"source")&&op["source"]!=null){ if(fo==null) throw new Exception(who+": 'source' hanya untuk objek Field ("+o.Name+")."); string src=(string)op["source"]; int ft=FindFieldType(d,src); if(ft<0&&SpecialType(src)>=0&&!src.Contains("{")){ft=SpecialType(src);src=SpecialName(src);} if(ft<0) throw new SkipEx("Field tidak ada di report: "+src); fo.DataSource=src; fo.FieldValueType=(CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum)ft; }
   if(Has(op,"textReplace")&&op["textReplace"]!=null){ if(to==null) throw new SkipEx(who+": 'textReplace' hanya untuk objek Teks ("+o.Name+")."); foreach(var rp in Pairs(op["textReplace"])){ int hit=0;
     foreach(Paragraph pg in to.Paragraphs) foreach(ParagraphElement pe in pg.ParagraphElements){ var te=pe as ParagraphTextElement; if(te!=null&&te.Text!=null&&Ci(te.Text,rp[0])){ te.Text=ReplaceCi(te.Text,rp[0],rp[1]); hit++; } }
     if(hit==0) throw new SkipEx("Teks '"+rp[0]+"' tidak ditemukan di "+o.Name+"."); } }
   if(Has(op,"fieldReplace")&&op["fieldReplace"]!=null){ foreach(var rp in Pairs(op["fieldReplace"])){ int hit=0; string want=null;
     if(to!=null){ foreach(Paragraph pg in to.Paragraphs) foreach(ParagraphElement pe in pg.ParagraphElements){ var fe=pe as ParagraphFieldElement; if(fe!=null&&Ci(fe.DataSource,rp[0])){ string ns=ReplaceCi(fe.DataSource,rp[0],rp[1]); int ft2=FindFieldType(d,ns); if(ft2<0) throw new SkipEx("Kolom tujuan tidak terdaftar di layout (Verify Database dulu): "+ns); fe.DataSource=ns; hit++; } } }
     else if(fo!=null&&Ci(fo.DataSource,rp[0])){ string ns=ReplaceCi(fo.DataSource,rp[0],rp[1]); int ft2=FindFieldType(d,ns); if(ft2<0) throw new SkipEx("Kolom tujuan tidak terdaftar di layout (Verify Database dulu): "+ns); fo.DataSource=ns; fo.FieldValueType=(CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum)ft2; hit++; }
     if(hit==0) throw new SkipEx("Kolom '"+rp[0]+"' tidak ditemukan di "+o.Name+"."); } }
 }
 static string Op(CE.ReportDocument d,Dictionary<string,object> op){
  var roc=d.ReportClientDocument.ReportDefController.ReportObjectController; string k=(string)op["op"]; Section sec;
  if(k=="set"){var o=Find(d,(string)op["name"],out sec); var n=(ReportObject)o.Clone(true); Geo(n,sec,d,op); roc.Modify(o,n); return "set ok";}
  if(k=="setText"){var o=Find(d,(string)op["name"],out sec); var n=(TextObject)o.Clone(true); ((ParagraphTextElement)n.Paragraphs[0].ParagraphElements[0]).Text=(string)op["text"]; roc.Modify(o,n); return "teks ok";}
  if(k=="replace"){var o=Find(d,(string)op["name"],out sec); var n=(ReportObject)o.Clone(true); ApplyReplace(d,o,n,op,"replace"); roc.Modify(o,n); return "replace ok";}
  if(k=="setProps"){var o=Find(d,(string)op["name"],out sec); var n=(ReportObject)o.Clone(true); SetProps(n,op); ApplySup(d,n,op); roc.Modify(o,n); return "props ok";}
  if(k=="setSectionProps"){var s0=Sec(d,(string)op["name"]); var ns=(Section)s0.Clone(true); ApplySecSup(d,ns,op); d.ReportClientDocument.ReportDefController.ReportSectionController.SetProperty(s0,CrReportSectionPropertyEnum.crReportSectionPropertyFormat,ns.Format); return "section ok";}
  if(k=="clone"){var o=Find(d,(string)op["name"],out sec); var n=(ReportObject)o.Clone(true); n.Name=NewName(d,o.Name+"c"); Geo(n,sec,d,new Dictionary<string,object>{{"l",o.Left+200},{"t",o.Top+200}}); roc.Add(n,sec,-1); return "clone "+n.Name;}
  if(k=="delete"){var o=Find(d,(string)op["name"],out sec); roc.Remove(o); return "hapus ok";}
  if(k=="addBox"){var s=Sec(d,(string)op["section"]); var x=new BoxObject(); x.Name=NewName(d,"BoxBaru"); x.EndSectionName=s.Name; x.LineStyle=CrLineStyleEnum.crLineStyleSingle; x.LineThickness=20; Geo(x,s,d,op); roc.Add(x,s,-1); return "box "+x.Name;}
  if(k=="addLine"){var s=Sec(d,(string)op["section"]); var x=new LineObject(); x.Name=NewName(d,"GarisBaru"); x.EndSectionName=s.Name; x.LineStyle=CrLineStyleEnum.crLineStyleSingle; x.LineThickness=20; Geo(x,s,d,op); roc.Add(x,s,-1); return "garis "+x.Name;}
  if(k=="addText"){var s=Sec(d,(string)op["section"]); var x=new TextObject(); x.Name=NewName(d,"TextBaru");
   string txt=op.ContainsKey("text")&&op["text"]!=null?(string)op["text"]:""; var font=DefFont(op);
   ApplyFont(x.FontColor,font);
   foreach(var part in txt.Replace("\r\n","\n").Split('\n')){var pg=new Paragraph(); var pe=new ParagraphTextElement(); pe.Text=part; ApplyFont(pe.FontColor,font); pg.ParagraphElements.Add(pe); x.Paragraphs.Add(pg);}
   Geo(x,s,d,op); roc.Add(x,s,-1); return "teks baru "+x.Name;}
  if(k=="addField"){var s=Sec(d,(string)op["section"]); string src=(string)op["source"]; int ft;
   bool sp=SpecialType(src)>=0&&!src.Contains("{"); bool wantSp=op.ContainsKey("special")&&op["special"]!=null&&Convert.ToBoolean(op["special"]);
   if(wantSp&&!sp) throw new SkipEx("Special field tidak dikenal: "+src);
   if(sp&&(wantSp||FindFieldType(d,src)<0)){ ft=SpecialType(src); src=SpecialName(src); }
   else { ft=FindFieldType(d,src); if(ft<0) throw new SkipEx("Field tidak ada di report: "+src); if(op.ContainsKey("type")&&op["type"]!=null) ft=I(op["type"]); }
   var x=new FieldObject(); x.Name=NewName(d,"FieldBaru"); x.DataSource=src; x.FieldValueType=(CrystalDecisions.ReportAppServer.DataDefModel.CrFieldValueTypeEnum)ft;
   if(x.FontColor==null)x.FontColor=new FontColor(); if(x.FontColor.Font==null)x.FontColor.Font=new CrystalDecisions.ReportAppServer.ReportDefModel.Font(); ApplyFont(x.FontColor,DefFont(op)); Geo(x,s,d,op); roc.Add(x,s,-1); return "field baru "+x.Name;}
  if(k=="setSectionHeight"){var s=Sec(d,(string)op["name"]); int h=I(op["h"]); if(h<0) throw new Exception("Nilai negatif tidak diizinkan.");
   d.ReportClientDocument.ReportDefController.ReportSectionController.SetProperty(s,CrReportSectionPropertyEnum.crReportSectionPropertyHeight,h); return "tinggi section ok";}
  if(k=="copy"){throw new Exception("copy dijalankan lewat OpCopy");}
  if(k=="paste"){ List<ClipItem> cl; if(op.ContainsKey("_clip")) cl=(List<ClipItem>)op["_clip"]; else { if(clip==null||clip.Count==0)throw new Exception("Clipboard kosong."); cl=new List<ClipItem>(); foreach(var ci in clip) cl.Add(new ClipItem{Obj=(ReportObject)ci.Obj.Clone(true),Section=ci.Section,Dl=ci.Dl,Dt=ci.Dt,W=ci.W,H=ci.H}); op["_clip"]=cl; }
   if(!op.ContainsKey("section")||op["section"]==null){ string sn=null; foreach(var x in Secs(d)) if(x.Name==clipSec) sn=x.Name; if(sn==null) foreach(var x in Secs(d)) if(x.Height>0){sn=x.Name;break;} op["section"]=sn; }
   if(!op.ContainsKey("l")||op["l"]==null) op["l"]=clipL+200; if(!op.ContainsKey("t")||op["t"]==null) op["t"]=clipT+200;
   var s=Sec(d,(string)op["section"]); int L=I(op["l"]),T=I(op["t"]);
   foreach(var ci in cl){ int tt=T+ci.Dt, ll=L+ci.Dl; if(ll<0||tt<0) throw new Exception("Tempel gagal: posisi "+ci.Obj.Name+" negatif (l="+ll+", t="+tt+")."); bool lineLike=(ci.Obj as BoxObject)!=null||(ci.Obj as LineObject)!=null;
    if(!lineLike&&s.Height>0&&tt>s.Height) throw new Exception("Tempel gagal: "+ci.Obj.Name+" jatuh di luar section "+s.Name+" (t="+tt+", tinggi "+s.Height+"). Pilih t lebih kecil.");}
   var names=new List<string>();
   foreach(var ci in cl){ var n=(ReportObject)ci.Obj.Clone(true); n.Name=NewName(d,ci.Obj.Name); var bx=n as BoxObject; var ln=n as LineObject; if(bx!=null)bx.EndSectionName=s.Name; if(ln!=null)ln.EndSectionName=s.Name;
    Geo(n,s,d,new Dictionary<string,object>{{"l",L+ci.Dl},{"t",T+ci.Dt},{"w",ci.W},{"h",ci.H}}); roc.Add(n,s,-1); names.Add(n.Name);}
   return "ditempel "+string.Join(",",names);}
  if(k=="cloneTo"){ var o=Find(d,(string)op["name"],out sec); int dx=Has(op,"dx")?I(op["dx"]):0, dy=Has(op,"dy")?I(op["dy"]):0;
   var n=(ReportObject)o.Clone(true); n.Name=NewName(d,o.Name+"c"); var bx=o as BoxObject; var ln=o as LineObject;
   if(Has(op,"place")&&op["place"]!=null){ // salinan di bawah/kanan objek asal + jarak (twips); ukuran dibaca per file
    string pl=Convert.ToString(op["place"]); int gap=Has(op,"gap")&&op["gap"]!=null?I(op["gap"]):0; if(gap<0||gap>20000) throw new Exception("cloneTo: jarak di luar batas.");
    var of0=Offs(d); int ow=o.Width,oh=o.Height; if(bx!=null){ow=bx.Right-bx.Left;oh=AbsH(bx,sec,of0);} if(ln!=null){ow=ln.Right-ln.Left;oh=AbsH(ln,sec,of0);}
    if(pl=="below"){dx=0;dy=oh+gap;} else if(pl=="right"){dx=ow+gap;dy=0;} else throw new Exception("place harus below|right.");} int l=o.Left+dx,t=o.Top+dy; if(bx!=null){l=bx.Left+dx;t=bx.Top+dy;} if(ln!=null){l=ln.Left+dx;t=ln.Top+dy;}
   if(l<0||t<0) throw new Exception("cloneTo: posisi negatif (l="+l+", t="+t+").");
   if(bx==null&&ln==null&&sec.Height>0&&t>sec.Height) throw new Exception("cloneTo: posisi keluar section "+sec.Name+" (t="+t+", tinggi "+sec.Height+").");
   ApplyReplace(d,o,n,op,"cloneTo");
   Geo(n,sec,d,new Dictionary<string,object>{{"l",l},{"t",t}}); roc.Add(n,sec,-1); return "cloneTo "+n.Name;}
  throw new Exception("op tidak dikenal: "+k);}
 // ---------- Suppress (objek & section). BELUM terbukti di SDK nyata: jalankan spike\SuppressSpike dulu ----------
 // Rumus Crystal disusun AGEN dari template terbatas (UI hanya mengirim struktur); selalu divalidasi ConditionFormulaController.Check, bila ditolak TIDAK diterapkan.
 static readonly CrObjectFormatConditionFormulaTypeEnum SupKey=CrObjectFormatConditionFormulaTypeEnum.crObjectFormatConditionFormulaTypeEnableSuppress;
 static readonly CrSectionAreaFormatConditionFormulaTypeEnum SecSupKey=CrSectionAreaFormatConditionFormulaTypeEnum.crSectionAreaConditionFormulaTypeEnableSuppress;
 static string CfText(ConditionFormula cf){ try{ return cf==null||cf.Text==null?"":cf.Text.Trim(); }catch{ return ""; } }
 static ConditionFormula NewCf(string t){ return new ConditionFormula{Text=t,Syntax=DD.CrFormulaSyntaxEnum.crFormulaSyntaxCrystal}; }
 static readonly string RF=@"\{[@?]?[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?\}", RS="\"(?:[^\"]|\"\")*\"";
 static readonly string RT="(?:\\(IsNull\\("+RF+"\\) Or Trim\\("+RF+"\\)=\"\"\\)|\\(IsNull\\("+RF+"\\) Or "+RF+" = 0\\)|IsNull\\("+RF+"\\)|"+RF+" (?:=|<>|<=|>=|<|>) (?:"+RS+"|-?[0-9.]+(?:E[-+]?[0-9]+)?|Date\\([0-9]+,[0-9]+,[0-9]+\\)|True|False)|InStr\\(UpperCase\\("+RF+"\\),UpperCase\\("+RS+"\\)\\)>0|"+RF+" StartsWith "+RS+")";
 static readonly Regex RecAnd=new Regex("^"+RT+"(?: And "+RT+")*$"), RecOr=new Regex("^"+RT+"(?: Or "+RT+")*$"), FieldRef=new Regex(@"^\{[@?]?[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)?\}$");
 static bool RecogCond(string t){ return RecAnd.IsMatch(t)||RecOr.IsMatch(t); } // true = rumus persis dari template agen (aman ditimpa); selain itu "kustom"
 static string RawErr(string t){ if(t==null||t.Trim()=="") return "Rumus kosong."; if(t.Length>500) return "Rumus terlalu panjang (maksimal 500 karakter)."; foreach(char ch in t) if(char.IsControl(ch)) return "Rumus mengandung karakter kontrol."; return ""; }
 static string CheckCf(CE.ReportDocument d,string text){
  ISCRReportDefController2 c2=d.ReportClientDocument.ReportDefController as ISCRReportDefController2;
  if(c2==null) throw new Exception("SDK tidak menyediakan pemeriksa rumus (ReportDefController2): rumus tidak diterapkan.");
  string e; try{ e=c2.ConditionFormulaController.Check(NewCf(text)); }catch(Exception ex){ throw new Exception("Pemeriksaan rumus gagal dijalankan ("+ex.Message+"): rumus tidak diterapkan."); }
  return e==null?"":e.Trim();}
 static string FvKind(int ft){ string n=((DD.CrFieldValueTypeEnum)ft).ToString().ToLower(); if(n.Contains("string")) return "s"; if(n.Contains("boolean")) return "b"; if(n.Contains("date")||n.Contains("time")) return "d"; if(n.Contains("int")||n.Contains("number")||n.Contains("currency")) return "n"; return "s";}
 static string Lit(string kind,string v,string fld){
  if(kind=="s"){ if(v.Length>100) throw new Exception("Nilai terlalu panjang (maks 100)."); foreach(char ch in v) if(char.IsControl(ch)) throw new Exception("Nilai mengandung karakter kontrol."); return "\""+v.Replace("\"","\"\"")+"\""; }
  if(kind=="n"){ double x; if(!double.TryParse(v.Trim(),System.Globalization.NumberStyles.Float,System.Globalization.CultureInfo.InvariantCulture,out x)||double.IsNaN(x)||double.IsInfinity(x)) throw new Exception("Nilai harus angka (titik desimal): "+v); return x.ToString("0.##########",System.Globalization.CultureInfo.InvariantCulture); }
  if(kind=="d"){ DateTime dt; if(!DateTime.TryParseExact(v.Trim(),"yyyy-MM-dd",System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.None,out dt)) throw new Exception("Nilai tanggal harus yyyy-MM-dd: "+v); return "Date("+dt.Year+","+dt.Month+","+dt.Day+")"; }
  string lv=v.Trim().ToLower(); if(lv=="true") return "True"; if(lv=="false") return "False"; throw new Exception("Nilai untuk "+fld+" harus true/false.");}
 static string Term(CE.ReportDocument d,Dictionary<string,object> c){
  string fld=c.ContainsKey("field")&&c["field"]!=null?Convert.ToString(c["field"]).Trim():"", opr=c.ContainsKey("op")&&c["op"]!=null?Convert.ToString(c["op"]).Trim():"", val=c.ContainsKey("value")&&c["value"]!=null?Convert.ToString(c["value"]):"";
  if(fld!=""&&!fld.StartsWith("{")) fld="{"+fld+"}"; if(!FieldRef.IsMatch(fld)) throw new Exception("Nama field tidak valid: "+fld);
  int ft=FindFieldType(d,fld); if(ft<0) throw new SkipEx("Field tidak ada di report: "+fld); string kd=FvKind(ft);
  switch(opr){
   case "=": case "<>": case "<": case ">": case "<=": case ">=":
    if(kd=="b"&&opr!="="&&opr!="<>") throw new Exception("Kolom true/false hanya mendukung = dan <>.");
    if(val.Trim()==""&&kd!="s") throw new Exception("Isi nilai untuk "+fld+".");
    return fld+" "+opr+" "+Lit(kd,val,fld);
   case "empty": return kd=="s"?"(IsNull("+fld+") Or Trim("+fld+")=\"\")":"IsNull("+fld+")";
   case "zero": if(kd!="n") throw new Exception("'nol' hanya untuk kolom angka: "+fld); return "(IsNull("+fld+") Or "+fld+" = 0)";
   case "contains": if(kd!="s") throw new Exception("'mengandung' hanya untuk kolom teks: "+fld); if(val=="") throw new Exception("Isi nilai untuk "+fld+"."); return "InStr(UpperCase("+fld+"),UpperCase("+Lit("s",val,fld)+"))>0";
   case "starts": if(kd!="s") throw new Exception("'diawali' hanya untuk kolom teks: "+fld); if(val=="") throw new Exception("Isi nilai untuk "+fld+"."); return fld+" StartsWith "+Lit("s",val,fld);
  }
  throw new Exception("Operator tidak dikenal: "+opr);}
 static string BuildCond(CE.ReportDocument d,object cobj){
  var co=cobj as Dictionary<string,object>; System.Collections.IEnumerable arr=co!=null&&co.ContainsKey("conds")?co["conds"] as System.Collections.IEnumerable:null; if(arr==null) throw new Exception("cond: struktur tidak valid.");
  string join=co.ContainsKey("join")&&co["join"]!=null?Convert.ToString(co["join"]):"and"; if(join!="and"&&join!="or") throw new Exception("cond.join harus and|or.");
  var terms=new List<string>(); foreach(var x in arr){ var c=x as Dictionary<string,object>; if(c==null) throw new Exception("cond: syarat tidak valid."); if(terms.Count>=8) throw new Exception("Maksimal 8 syarat."); terms.Add(Term(d,c)); }
  if(terms.Count==0) throw new Exception("cond: minimal satu syarat.");
  string f=string.Join(join=="and"?" And ":" Or ",terms.ToArray()); if(f.Length>500) throw new Exception("Rumus terlalu panjang (maksimal 500 karakter)."); return f;}
 // rencana Suppress dari op: mode no|always|if (+ teks rumus); menolak menimpa rumus kustom milik layout kecuali op.overwriteCustom
 static void SupPlan(CE.ReportDocument d,Dictionary<string,object> op,string cur,string who,out string mode,out string text){
  mode=Convert.ToString(op["sup"]); text="";
  bool over=Has(op,"overwriteCustom")&&op["overwriteCustom"]!=null&&Convert.ToBoolean(op["overwriteCustom"]);
  if(cur!=""&&!RecogCond(cur)&&!over) throw new SkipEx(who+" sudah punya rumus Suppress kustom ("+Trunc(cur)+"): tidak ditimpa. Ubah di Crystal atau konfirmasi timpa.");
  if(mode=="no"||mode=="always") return;
  if(mode!="if") throw new Exception("sup harus no|always|if.");
  if(Has(op,"raw")&&op["raw"]!=null){ text=Convert.ToString(op["raw"]).Trim(); string re=RawErr(text); if(re!="") throw new Exception(re); }
  else if(Has(op,"cond")&&op["cond"]!=null) text=BuildCond(d,op["cond"]);
  else throw new Exception("sup=if: isi cond (struktur syarat) atau raw (rumus).");
  string err=CheckCf(d,text); if(err!="") throw new Exception("Rumus ditolak Crystal: "+err+" ["+Trunc(text)+"]");}
 static void ApplySup(CE.ReportDocument d,ReportObject n,Dictionary<string,object> op){
  if(!Has(op,"sup")||op["sup"]==null) return; var fm=n.Format; string cur=""; try{ cur=CfText(fm.ConditionFormulas[SupKey]); }catch{}
  string mode,text; SupPlan(d,op,cur,"Objek "+n.Name,out mode,out text);
  if(mode=="if"){ fm.ConditionFormulas[SupKey]=NewCf(text); fm.EnableSuppress=false; return; }
  if(cur!=""){ try{ fm.ConditionFormulas[SupKey]=null; }catch{ fm.ConditionFormulas[SupKey]=NewCf(""); } }
  fm.EnableSuppress=mode=="always";}
 static void ApplySecSup(CE.ReportDocument d,Section ns,Dictionary<string,object> op){
  var fm=ns.Format;
  if(Has(op,"supBlank")&&op["supBlank"]!=null) fm.EnableSuppressIfBlank=Convert.ToBoolean(op["supBlank"]);
  if(!Has(op,"sup")||op["sup"]==null) return; string cur=""; try{ cur=CfText(fm.ConditionFormulas[SecSupKey]); }catch{}
  string mode,text; SupPlan(d,op,cur,"Section "+ns.Name,out mode,out text);
  if(mode=="if"){ fm.ConditionFormulas[SecSupKey]=NewCf(text); fm.EnableSuppress=false; return; }
  if(cur!=""){ try{ fm.ConditionFormulas[SecSupKey]=null; }catch{ fm.ConditionFormulas[SecSupKey]=NewCf(""); } }
  fm.EnableSuppress=mode=="always";}
 static Dictionary<string,object> Fields(CE.ReportDocument d){ // Field Explorer: tabel/Command, formula, parameter (tanpa koneksi DB)
  var tabs=new List<object>(); var fs=new List<object>(); var ps=new List<object>(); var ft=new Dictionary<string,object>(); var pt=new Dictionary<string,object>();
  try{foreach(CrystalDecisions.ReportAppServer.DataDefModel.Table t in d.ReportClientDocument.DataDefController.Database.Tables){var cols=new List<object>();
    foreach(CrystalDecisions.ReportAppServer.DataDefModel.Field f in t.DataFields) cols.Add(new Dictionary<string,object>{{"name",f.FormulaForm},{"type",(int)f.Type},{"len",f.Length}});
    tabs.Add(new Dictionary<string,object>{{"name",t.Alias},{"fields",cols}});}}catch(Exception e){tabs.Add(new Dictionary<string,object>{{"name","(gagal: "+e.Message+")"},{"fields",new List<object>()}});}
  try{foreach(CE.FormulaFieldDefinition f in d.DataDefinition.FormulaFields){fs.Add(f.FormulaName); try{ft[f.FormulaName]=f.ValueType.ToString().Replace("FieldValueType","");}catch{}}}catch{}
  try{foreach(CE.ParameterFieldDefinition f in d.DataDefinition.ParameterFields){ps.Add(f.Name); try{pt[f.Name]=f.ValueType.ToString().Replace("FieldValueType","");}catch{}}}catch{}
  return new Dictionary<string,object>{{"tables",tabs},{"formulas",fs},{"params",ps},{"formulaTypes",ft},{"paramTypes",pt},{"special",SpecialList()}};}
}
