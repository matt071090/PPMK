// Backup & Restore HANA: login ke server HANA (IP + user + password SSH), backup schema, restore dari file backup, riwayat.
// Backend: HanaBackupController (/api/hana/*). Password hanya dikirim sekali ke endpoint login; browser menyimpan token sesi saja.
// Job (backup / restore) berjalan di server dan bisa lama, jadi UI hanya polling status tiap 3 detik, tidak menahan satu request.
// Komponen visual memakai kelas yang sudah ada di app.css (chips, callout, md-item, details.grp, sx-bar, sx-prog, badge, error, skeleton);
// kelas hn-* hanya untuk form login, tombol bahaya, dan tata letak dialog.
import { $, $$, esc } from "../ui.js";

const API = "api/hana";
const kv = {
  get: (s, k) => { try { return s.getItem(k); } catch { return null; } },
  set: (s, k, v) => { try { v == null ? s.removeItem(k) : s.setItem(k, v); } catch { } }
};
const token = () => kv.get(sessionStorage, "hanaToken");
const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const today = () => new Date().toISOString().slice(0, 10).replace(/-/g, "");

async function call(path, body) {
  const opts = { headers: { "X-Hana-Token": token() || "" } };
  if (body !== undefined) { opts.method = "POST"; opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  const r = await fetch(`${API}/${path}`, opts);
  const ct = r.headers.get("content-type") || "";
  const d = ct.includes("json") ? await r.json().catch(() => ({})) : await r.text();
  if (!r.ok) { const e = new Error((d && d.message) || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return d;
}

const fmtBytes = n => n >= 1073741824 ? (n / 1073741824).toFixed(1) + " GB" : n >= 1048576 ? (n / 1048576).toFixed(0) + " MB" : Math.max(0, Math.round(n / 1024)) + " KB";
const fmtAmount = (n, unit) => unit === "bytes" ? fmtBytes(n) : `${n.toLocaleString("id-ID")} ${unit}`;

// Layar loading untuk pengambilan data yang bisa lama: spinner + pesan bertahap + timer. Mengembalikan fungsi stop.
function loading(box, what) {
  const t0 = Date.now();
  box.innerHTML = `<div class="hn-load" role="status" aria-live="polite"><i class="hn-spin" aria-hidden="true"></i><div><b>${esc(what)}</b><p class="sx-prog-s" data-lm>Menghubungi server…</p></div></div>`;
  const iv = setInterval(() => {
    const m = box.querySelector("[data-lm]");
    if (!m) { clearInterval(iv); return; }
    const sec = Math.floor((Date.now() - t0) / 1000);
    m.textContent = (sec < 5 ? "Menghubungi server…" : sec < 20 ? "Masih mengambil data dari server…" : "Server dengan banyak data bisa lama, mohon tunggu…") + ` ${mmss(sec)}`;
  }, 1000);
  return () => clearInterval(iv);
}

const skeleton = () => `<div class="skeleton" aria-busy="true"><div></div><div></div><div></div></div>`;
const errBox = (e, retry) => `<div class="error" role="alert">${esc(e.message || e)}${retry ? ` <button type="button" class="cbtn" data-retry="${retry}">Coba lagi</button>` : ""}</div>`;

// dialog di atas halaman (kerangka .sx-prog yang sama dengan popup upload)
function dialog(html, { label, onClose } = {}) {
  const back = document.createElement("div");
  back.className = "sx-prog-back";
  back.setAttribute("role", "dialog");
  back.setAttribute("aria-modal", "true");
  back.setAttribute("aria-label", label || "Dialog");
  back.innerHTML = `<div class="sx-prog hn-dlg">${html}</div>`;
  document.body.appendChild(back);
  const onKey = e => { if (e.key === "Escape") close(); };
  const close = () => { document.removeEventListener("keydown", onKey); back.remove(); if (onClose) onClose(); };
  document.addEventListener("keydown", onKey);
  return { el: back, q: s => back.querySelector(s), close };
}

// opts.hashTabs: tab dipilih lewat navigasi di luar halaman (hana.html: #/backup, #/restore, #/riwayat), chip tab disembunyikan lewat CSS.
export function hanaPage(opts = {}) {
  return {
    lead: `Backup dan restore schema (database company) SAP HANA langsung dari web ini. Login memakai IP, user, dan password SSH server HANA; password tidak disimpan.`,
    menu: "Titik pulih sebelum upload massal / cut off, dan rollback bila data salah",
    render: () => `<div class="hn" id="hn">${skeleton()}</div>`,
    mount: art => start($("#hn", art), opts)
  };
}

async function start(root, opts) {
  const S = { info: null, conn: null, tab: "backup", schemas: null, backups: null, history: null, appSchema: null, selSchema: "", selFile: "", q: "" };
  const hashTab = () => (location.hash.match(/^#\/?(backup|restore|riwayat)/) || [])[1] || "backup";
  if (opts.hashTabs) {
    S.tab = hashTab();
    window.addEventListener("hashchange", () => {
      if (!S.conn || !$("#hn-body", root)) return;
      S.tab = hashTab();
      $$("[data-tab]", root).forEach(x => { const on = x.dataset.tab === S.tab; x.setAttribute("aria-pressed", on); x.setAttribute("aria-selected", on); });
      loadTab();
    });
  }
  try { S.info = await call("info"); }
  catch (e) {
    root.innerHTML = errBox(e) + (e.status === 403 && /terkunci/.test(e.message) ? `<p><a class="cbtn primary" href="setup.html#/hana">Buka lewat Setup (masukkan password Setup)</a></p>` : "");
    return;
  }
  if (token()) {
    try { S.conn = JSON.parse(kv.get(sessionStorage, "hanaConn") || "null"); await call("history"); }   // cek token masih berlaku
    catch { S.conn = null; kv.set(sessionStorage, "hanaToken", null); }
  }

  function draw() {
    root.innerHTML = S.conn ? connected() : loginForm();
    wire();
    if (S.conn) loadTab();
  }

  // ---------- login ----------
  function loginForm(err) {
    const insecure = location.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
    return `<div class="hn-card"><h2 class="sx-h" style="margin-top:0">Login server HANA</h2>
      ${insecure ? `<div class="callout warn"><span class="ci">!</span><div class="ct"><b>Tidak aman</b>Halaman ini dibuka lewat HTTP, jadi password SSH terkirim sebagai teks biasa di jaringan. Pakai HTTPS, atau buka dari komputer server (localhost).</div></div>` : ""}
      ${err ? errBox(err) : ""}
      <form id="hn-login" autocomplete="off" class="hn-form">
        <label>IP / host server<input name="host" required placeholder="mis. 192.168.40.197" inputmode="url" value="${esc(kv.get(localStorage, "hanaHost") || "")}"></label>
        <label>Port SSH<input name="port" value="22" inputmode="numeric" pattern="[0-9]{1,5}"></label>
        <label class="hn-wide">Username<input name="user" required value="root" autocapitalize="off"></label>
        <label class="hn-wide">Password<span class="hn-pw"><input name="password" type="password" required autocomplete="off"><button type="button" class="cbtn" data-show aria-pressed="false">Tampilkan</button></span></label>
        <label class="hn-chk"><input type="checkbox" name="prod"> Ini server produksi <small>(restore jadi minta ketik ulang IP server)</small></label>
        <button class="cbtn primary" type="submit">Hubungkan</button>
      </form>
      <p class="sx-req">Password hanya dipakai untuk menjalankan perintah di server dan disimpan di memori aplikasi selama sesi (hilang bila keluar atau 30 menit tidak dipakai).</p></div>`;
  }

  function connected() {
    const c = S.conn;
    return `<div class="sx-head"><span class="badge yes">Terhubung</span> <b>${esc(c.user)}@${esc(c.host)}</b>${c.prod ? ` <span class="badge danger">Produksi</span>` : ""}
        <button type="button" class="cbtn" data-logout style="margin-left:auto">Keluar dari server</button></div>
      <div id="hn-ribbon"></div>
      <div class="chips" role="tablist" aria-label="Menu backup dan restore">${[["backup", "Backup"], ["restore", "Restore"], ["riwayat", "Riwayat"]].map(([k, l]) =>
        `<button type="button" role="tab" class="chip" data-tab="${k}" aria-pressed="${S.tab === k}" aria-selected="${S.tab === k}">${l}</button>`).join("")}</div>
      <div id="hn-body"></div><div class="sx-result" id="hn-result"></div>`;
  }

  // ---------- tab ----------
  async function loadTab() {
    const body = $("#hn-body", root);
    if (!body) return;
    const stop = loading(body, S.tab === "backup" ? "Mengambil daftar schema" : S.tab === "restore" ? "Mengambil daftar file backup" : "Memuat riwayat");
    try {
      if (S.tab === "backup") { if (!S.schemas) S.schemas = await call("schemas"); body.innerHTML = backupView(); }
      else if (S.tab === "restore") {
        if (!S.backups) S.backups = await call("backups");
        if (!S.appSchema) S.appSchema = await call("app-schema");
        body.innerHTML = restoreView();
      } else { S.history = await call("history"); body.innerHTML = historyView(); }
      wireBody();
    } catch (e) {
      if (e.status === 401) return expired();
      body.innerHTML = errBox(e, "tab");
      const b = $("[data-retry]", body); if (b) b.onclick = () => { S.schemas = S.backups = null; loadTab(); };
    } finally { stop(); }
  }

  function expired() {
    kv.set(sessionStorage, "hanaToken", null); kv.set(sessionStorage, "hanaConn", null); S.conn = null;
    root.innerHTML = loginForm(new Error("Sesi berakhir, login ulang ke server."));
    wire();
  }

  function backupView() {
    const list = S.schemas.filter(s => s.toLowerCase().includes(S.q.toLowerCase()));
    return `<div class="toolbar"><input type="search" id="hn-q" placeholder="Cari schema…" aria-label="Cari schema" value="${esc(S.q)}"><span class="count">${list.length} dari ${S.schemas.length} schema</span></div>
      ${S.schemas.length ? "" : `<div class="sx-note-box">Belum ada schema yang bisa di-backup di server ini.</div>`}
      <div class="table-wrap hn-list" role="listbox" aria-label="Schema">${list.map(s => `<button type="button" class="md-item${s === S.selSchema ? " on" : ""}" role="option" aria-selected="${s === S.selSchema}" data-schema="${esc(s)}"><span class="md-name">${esc(s)}</span></button>`).join("")}</div>
      <div class="sx-bar"><span class="sx-count">${S.selSchema ? `Dipilih: <b>${esc(S.selSchema)}</b>` : "Pilih satu schema"}</span>
        <button type="button" class="cbtn primary" data-do-backup${S.selSchema ? "" : " disabled"}>Mulai backup</button></div>`;
  }

  const srcOf = f => (f.split("/").pop() || "").replace(/\.tar\.gz$/, "").replace(/_\d{8}_\d{4}$/, "");
  function restoreView() {
    const groups = {};
    S.backups.forEach(f => (groups[f.split("/")[0]] = groups[f.split("/")[0]] || []).push(f));
    const keys = Object.keys(groups).sort().reverse();
    const sel = S.selFile;
    return `<div class="callout warn"><span class="ci">!</span><div class="ct"><b>Eksperimental</b>Script restore belum pernah dites di HANA sungguhan. Restore memakai IGNORE EXISTING: tabel yang sudah ada di schema tujuan <b>dilewati, bukan ditimpa</b>, jadi bukan rollback bersih. Untuk rollback, restore ke nama schema baru lalu arahkan aplikasi ke schema itu.</div></div>
      ${!S.info.restoreEnabled ? `<div class="error">Restore dimatikan di aplikasi ini (hana.restore.enabled=false).</div>` : ""}
      ${S.backups.length ? "" : `<div class="sx-note-box">Belum ada file backup di server ini.</div>`}
      ${keys.map((k, i) => `<details class="grp"${i === 0 || groups[k].includes(sel) ? " open" : ""}><summary><span><b>${esc(k)}</b></span><span class="muted">${groups[k].length} file</span></summary>
        ${groups[k].map(f => `<button type="button" class="md-item${f === sel ? " on" : ""}" data-file="${esc(f)}"><span class="md-name">${esc(f.split("/").pop())}</span><span class="muted">schema asal: ${esc(srcOf(f))}</span></button>`).join("")}</details>`).join("")}

      <div class="sx-bar"><span class="sx-count">${sel ? `Dipilih: <b>${esc(sel.split("/").pop())}</b>` : "Pilih satu file backup"}</span>
        <button type="button" class="cbtn danger" data-do-restore${sel && S.info.restoreEnabled ? "" : " disabled"}>Restore…</button></div>`;
  }

  function historyView() {
    if (!S.history.length) return `<div class="sx-note-box">Belum ada riwayat backup / restore dari aplikasi ini.</div>`;
    return `<div class="table-wrap"><table class="data"><thead><tr><th>Waktu</th><th>Jenis</th><th>Server</th><th>Schema</th><th>File</th><th>Hasil</th><th>Durasi</th><th></th></tr></thead>
      <tbody>${S.history.map(h => `<tr><td>${esc(h.waktu)}</td><td>${esc(h.jenis)}</td><td>${esc(h.server)}</td>
        <td>${esc(h.schema_asal)}${h.schema_tujuan ? ` → ${esc(h.schema_tujuan)}` : ""}</td><td class="sx-note">${esc((h.file || "").split("/").pop())}</td>
        <td><span class="badge ${h.status === "SUKSES" ? "yes" : "danger"}">${esc(h.status)}</span></td><td>${mmss(+h.detik || 0)}</td>
        <td><button type="button" class="cbtn" data-log="${esc(h.id)}">Lihat log</button></td></tr>`).join("")}</tbody></table></div>`;
  }

  // ---------- event ----------
  function wire() {
    const f = $("#hn-login", root);
    if (f) {
      const show = $("[data-show]", f);
      show.onclick = () => { const p = f.elements.password, on = p.type === "password"; p.type = on ? "text" : "password"; show.setAttribute("aria-pressed", on); show.textContent = on ? "Sembunyikan" : "Tampilkan"; };
      f.onsubmit = async e => {
        e.preventDefault();
        const btn = $("button[type=submit]", f); btn.disabled = true; btn.textContent = "Menghubungkan…";
        const slow = setTimeout(() => btn.textContent = "Masih menghubungi server…", 5000);
        try {
          const d = await call("login", { host: f.elements.host.value, port: f.elements.port.value, user: f.elements.user.value, password: f.elements.password.value, prod: f.elements.prod.checked });
          kv.set(sessionStorage, "hanaToken", d.token);
          S.conn = { host: d.host, user: d.user, prod: d.prod };
          kv.set(sessionStorage, "hanaConn", JSON.stringify(S.conn));
          kv.set(localStorage, "hanaHost", d.host);
          S.schemas = S.backups = null; S.selSchema = S.selFile = "";
          draw();
          if (d.activeJob) followJob(d.activeJob, "");
        } catch (err) {
          root.innerHTML = loginForm(err); wire();
        } finally { clearTimeout(slow); }
      };
      return;
    }
    $("[data-logout]", root).onclick = async () => {
      try { await call("logout", {}); } catch { }
      kv.set(sessionStorage, "hanaToken", null); kv.set(sessionStorage, "hanaConn", null); S.conn = null; S.schemas = S.backups = null;
      draw();
    };
    $$("[data-tab]", root).forEach(b => b.onclick = () => { S.tab = b.dataset.tab; $$("[data-tab]", root).forEach(x => { const on = x === b; x.setAttribute("aria-pressed", on); x.setAttribute("aria-selected", on); }); loadTab(); });
    const j = kv.get(localStorage, "hanaJob");
    if (j) followJob(j, "");
  }

  function wireBody() {
    const body = $("#hn-body", root);
    const q = $("#hn-q", body);
    if (q) q.oninput = () => { S.q = q.value; const pos = q.selectionStart; body.innerHTML = backupView(); wireBody(); const n = $("#hn-q", body); n.focus(); n.setSelectionRange(pos, pos); };
    $$("[data-schema]", body).forEach(b => b.onclick = () => { S.selSchema = b.dataset.schema; body.innerHTML = backupView(); wireBody(); });
    $$("[data-file]", body).forEach(b => b.onclick = () => { S.selFile = b.dataset.file; body.innerHTML = restoreView(); wireBody(); });
    const bk = $("[data-do-backup]", body); if (bk) bk.onclick = () => confirmBackup();
    const rs = $("[data-do-restore]", body); if (rs) rs.onclick = () => confirmRestore();
    $$("[data-log]", body).forEach(b => b.onclick = async () => {
      const d = dialog(`<h3>Log ${esc(b.dataset.log)}</h3><pre class="sx-pre" style="max-height:50vh;overflow:auto">Memuat…</pre><div class="hn-actions"><button type="button" class="cbtn" data-x>Tutup</button></div>`, { label: "Log operasi" });
      d.q("[data-x]").onclick = d.close;
      try { d.q("pre").textContent = (await call(`history/${encodeURIComponent(b.dataset.log)}/log`)) || "(log kosong)"; } catch (e) { d.q("pre").textContent = e.message; }
    });
  }

  // ---------- konfirmasi ----------
  function confirmBackup() {
    const schema = S.selSchema;
    const d = dialog(`<h3>Backup schema ${esc(schema)}?</h3>
      <p class="sx-prog-s">Server <b>${esc(S.conn.host)}</b>. Hasil: file .tar.gz di /hana/backup/&lt;tanggal&gt;/. Backup tidak mengubah isi schema, tapi bisa lama untuk database besar.</p>
      <div class="hn-actions"><button type="button" class="cbtn" data-x>Batal</button><button type="button" class="cbtn primary" data-go>Mulai backup</button></div>`, { label: "Konfirmasi backup" });
    d.q("[data-x]").onclick = d.close;
    d.q("[data-go]").onclick = async () => {
      d.q("[data-go]").disabled = true;
      try { const job = await call("backup", { schema }); d.close(); followJob(job.id, `Backup ${schema}`); }
      catch (e) { d.close(); $("#hn-result", root).innerHTML = errBox(e); }
    };
  }

  // Satu popup form: ringkasan file, pilih tujuan (schema baru / schema asal), peringatan, lalu konfirmasi 2 lapis (+IP bila produksi).
  function confirmRestore() {
    const file = S.selFile, source = srcOf(file), prod = S.conn.prod, app = S.appSchema || {};
    const d = dialog(`<h3>Restore backup <span class="badge danger">Destruktif</span></h3>
      <div class="sx-facts"><span>Server <b>${esc(S.conn.host)}</b></span><span>File <b>${esc(file.split("/").pop())}</b></span><span>Schema asal <b>${esc(source)}</b></span></div>
      <fieldset class="hn-set"><legend>Restore ke mana?</legend>
        <label class="hn-chk"><input type="radio" name="way" value="new" checked> Schema baru <small>(disarankan)</small></label>
        <input data-target value="${esc(source + "_" + today())}" aria-label="Nama schema tujuan" autocapitalize="characters" spellcheck="false">
        <label class="hn-chk"><input type="radio" name="way" value="same"> Schema asal <b>${esc(source)}</b> <small>(tabel yang sudah ada dilewati, tidak ditimpa)</small></label>
      </fieldset>
      <div data-note></div>
      <label class="hn-conf">1. Ketik ulang nama schema tujuan: <b data-tn></b><input data-c1 autocomplete="off" spellcheck="false"><span class="badge" data-b1>belum cocok</span></label>
      <label class="hn-conf">2. Ketik <b>RESTORE</b> (huruf besar semua)<input data-c2 autocomplete="off" spellcheck="false"><span class="badge" data-b2>belum cocok</span></label>
      ${prod ? `<label class="hn-conf">3. Server produksi, ketik ulang IP server: <b>${esc(S.conn.host)}</b><input data-c3 autocomplete="off" spellcheck="false"><span class="badge" data-b3>belum cocok</span></label>` : ""}
      <div class="hn-actions"><button type="button" class="cbtn" data-x>Batal</button><button type="button" class="cbtn danger" data-go disabled>Jalankan restore</button></div>`, { label: "Restore backup" });
    d.q("[data-x]").onclick = d.close;
    const targetNow = () => (d.q("input[name=way]:checked").value === "same" ? source : d.q("[data-target]").value.trim());
    const check = () => {
      const target = targetNow(), valid = /^[A-Za-z0-9_]{1,127}$/.test(target);
      const same = d.q("input[name=way]:checked").value === "same";
      d.q("[data-target]").disabled = same;
      d.q("[data-tn]").textContent = target;
      const inUse = valid && target.toUpperCase() === (app.schema || "").toUpperCase() && S.conn.host === app.host;
      d.q("[data-note]").innerHTML = !valid ? `<div class="error">Nama schema tujuan hanya boleh huruf, angka, dan garis bawah.</div>`
        : inUse ? `<div class="error">Schema <b>${esc(target)}</b> sedang dipakai aplikasi ini; server akan menolak. Pakai nama schema baru.</div>`
        : `<div class="callout danger"><span class="ci">!</span><div class="ct"><b>Tidak bisa dibatalkan</b>${same ? "Tabel yang sudah ada di schema tujuan dilewati, bukan ditimpa." : "Objek dibuat di schema <b>" + esc(target) + "</b> lewat RENAME SCHEMA."}</div></div>`;
      const need = [["c1", target], ["c2", "RESTORE"]].concat(prod ? [["c3", S.conn.host]] : []);
      let all = valid && !inUse;
      need.forEach(([k, want], i) => { const ok = d.q(`[data-${k}]`).value === want, b = d.q(`[data-b${i + 1}]`); b.textContent = ok ? "cocok" : "belum cocok"; b.className = "badge" + (ok ? " yes" : ""); all = all && ok; });
      d.q("[data-go]").disabled = !all;
    };
    $$("input", d.el).forEach(i => { i.oninput = check; i.onchange = check; });
    check();
    d.q("[data-target]").focus();
    d.q("[data-go]").onclick = async () => {
      const target = targetNow();
      d.q("[data-go]").disabled = true;
      try {
        const job = await call("restore", { source, file, target, confirmSchema: d.q("[data-c1]").value, confirmWord: d.q("[data-c2]").value, confirmIp: prod ? d.q("[data-c3]").value : "" });
        d.close(); followJob(job.id, `Restore ${source} → ${target}`);
      } catch (e) { d.close(); $("#hn-result", root).innerHTML = errBox(e); }
    };
  }

  // ---------- progres job ----------
  let following = "";
  function followJob(id, title) {
    if (following === id) return;
    following = id;
    kv.set(localStorage, "hanaJob", id);
    let hidden = false, last = null, from = 0, log = "";
    const d = dialog(`<h3 data-t>${esc(title || "Operasi berjalan")}</h3>
      <p class="sx-prog-n" data-st>Menghubungi server…</p>
      <div class="sx-prog-bar hn-indet" role="progressbar" aria-valuemin="0" aria-valuemax="100" data-bar><i></i></div>
      <p class="sx-prog-s" data-pg>Menunggu laporan dari server…</p><p class="sx-prog-s" data-tm>0:00</p>
      <p class="sx-prog-w">Proses berjalan di server, jadi aman bila dialog ini disembunyikan. Persentase adalah perkiraan per tahap dari server (ukuran data / jumlah objek); bila belum bisa dihitung, bar bergerak dan yang ditampilkan jumlah yang sudah diproses.</p>
      <pre class="sx-pre" data-lg hidden style="max-height:30vh;overflow:auto"></pre>
      <div class="hn-actions"><button type="button" class="cbtn" data-hide>Sembunyikan</button></div>`, { label: "Progres operasi", onClose: () => { hidden = true; ribbon(); } });
    d.q("[data-hide]").onclick = d.close;
    function ribbon() {
      const r = $("#hn-ribbon", root); if (!r) return;
      r.innerHTML = last && last.status === "running" ? `<div class="callout info"><span class="ci">i</span><div class="ct"><b>Berjalan</b>${esc(last.type)} ${esc(last.source)} · ${esc(last.stage)} · ${mmss(last.seconds)} <button type="button" class="cbtn" data-open>Buka</button></div></div>` : "";
      const o = $("[data-open]", r); if (o) o.onclick = () => { following = ""; followJob(id, title); };
    }
    // bar per tahap: ada total -> persen + sisa waktu (dari laju tahap ini); total tidak diketahui -> bar bergerak + jumlah yang sudah diproses
    const stageT = {};
    const paint = j => {
      const bar = d.q("[data-bar]"), pg = d.q("[data-pg]"), key = j.stageNo;
      if (!stageT[key]) stageT[key] = { t0: Date.now(), p0: j.progDone };
      if (j.status !== "running") {
        bar.classList.remove("hn-indet");
        if (j.status === "ok") bar.firstElementChild.style.width = "100%";
        pg.textContent = j.status === "ok" ? "100%" : "Berhenti sebelum selesai";
        return;
      }
      if (j.progTotal > 0) {
        const pct = Math.min(99, Math.floor(j.progDone * 100 / j.progTotal));
        bar.classList.remove("hn-indet"); bar.firstElementChild.style.width = pct + "%"; bar.setAttribute("aria-valuenow", String(pct));
        const el = (Date.now() - stageT[key].t0) / 1000, gained = j.progDone - stageT[key].p0;
        const eta = gained > 0 && el > 10 ? ` · sisa sekitar ${mmss(el / gained * Math.max(0, j.progTotal - j.progDone))}` : "";
        pg.textContent = `${pct}% · ${fmtAmount(j.progDone, j.progUnit)} dari perkiraan ${fmtAmount(j.progTotal, j.progUnit)}${eta}`;
      } else {
        bar.classList.add("hn-indet"); bar.removeAttribute("aria-valuenow");
        pg.textContent = j.progDone > 0 ? `${fmtAmount(j.progDone, j.progUnit)} sudah diproses (persen belum bisa dihitung)` : "Tahap ini belum melaporkan progres…";
      }
    };
    const tick = async () => {
      if (hidden) { following = ""; return; }
      try {
        last = await call(`jobs/${id}?from=${from}`);
        from = last.logLength; log += last.log;
        d.q("[data-t]").textContent = title || `${last.type} ${last.source}${last.target ? " → " + last.target : ""}`;
        d.q("[data-st]").textContent = last.stageTotal ? `Tahap ${last.stageNo} dari ${last.stageTotal} · ${last.stage}` : last.stage;
        d.q("[data-tm]").textContent = `Berjalan ${mmss(last.seconds)}`;
        paint(last);
        if (last.status === "running") { setTimeout(tick, 3000); return; }
        const ok = last.status === "ok";
        kv.set(localStorage, "hanaJob", null); following = "";
        d.q("[data-st]").innerHTML = `<span class="badge ${ok ? "yes" : "danger"}">${ok ? "Selesai" : "Gagal"}</span>`;
        d.q("[data-tm]").textContent = ok ? `Selesai dalam ${mmss(last.seconds)}.` : `${last.error || "Gagal"} (${mmss(last.seconds)})`;
        const lg = d.q("[data-lg]"); lg.hidden = false; lg.textContent = log.trim().split("\n").slice(-40).join("\n");
        d.q(".sx-prog-w").hidden = true;
        d.q("[data-hide]").textContent = "Tutup";
        S.backups = null; S.schemas = null; if (S.tab !== "backup") loadTab();
      } catch (e) {
        following = "";
        if (e.status === 401 || e.status === 404) { kv.set(localStorage, "hanaJob", null); hidden = true; d.close(); if (e.status === 401) expired(); else $("#hn-result", root).innerHTML = errBox(e); return; }
        d.q("[data-tm]").textContent = `Koneksi ke aplikasi terputus (${e.message}), mencoba lagi…`; following = id; setTimeout(tick, 5000);
      }
    };
    tick();
  }

  draw();
}
