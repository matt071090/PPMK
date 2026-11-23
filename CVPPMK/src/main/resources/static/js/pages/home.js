import { reviewableMenus, loadCapabilities } from "../data-policy.js";
// Home: ringkasan semua modul dalam satu layar. Hanya membaca API yang sudah ada (+ api/health, api/schedule/chat/latest).
// Fungsi hitung jadwal dipakai ulang dari schedule.js (mount Schedule hanya jalan di schedule.html).
import { countdown, effectiveStatus, todayLocal, progress, nextMilestone, needsAttention, withFixedPic, withTrainingRollup } from './schedule.js';
import { withReview } from './schedule-review.js';
import { addonPages } from './addon.js';
import { company, companyTitle, loadCompany as loadMetadata } from '../company.js';

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (s, o = { day: 'numeric', month: 'short', year: 'numeric' }) => new Intl.DateTimeFormat('id-ID', o).format(new Date(`${s}T12:00:00`));
const TABS = { ringkasan: 'Ringkasan', master: 'Master Data', training: 'Training', stock: 'Stock Opname', balance: 'Beginning Balance' };
const tabOf = it => it.section === 'master' ? 'master' : it.section === 'training' ? 'training' : it.section === 'balance' ? 'balance'
  : ['opname', 'cutoff', 'inventory', 'inventory-upload'].includes(it.id) ? 'stock' : it.id === 'training' ? 'training'
  : ['prepare', 'deadline', 'upload-master', 'verify'].includes(it.id) ? 'master' : 'ringkasan';
const getJson = async (url, timeoutMs = 20000) => {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try { const r = await fetch(url, { cache: 'no-store', signal: ctl.signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  finally { clearTimeout(t); }
};
const settle = p => p.then(v => ({ ok: true, v }), e => ({ ok: false, e }));

// ---------- tema & menu HP ----------
$('#theme-btn').onclick = () => {
  const el = document.documentElement, t = el.dataset.theme === 'dark' ? 'light' : 'dark';
  el.dataset.theme = t; try { localStorage.setItem('theme', t); } catch { }
};
$('#menu-btn').onclick = () => $('#menu-btn').setAttribute('aria-expanded', document.body.classList.toggle('nav-open'));

// ---------- data ----------
async function load() {
  // data cepat dulu (file/JSON lokal); daftar menu Addon dari DB bisa lambat, jadi menyusul tanpa menahan halaman
  const addonP = settle(getJson('api/addon/objects', 25000));
  const [sch, rev, sec, mode, chat] = await Promise.all([
    settle(getJson('api/schedule')), settle(getJson('api/review')), settle(getJson('sections.json')),
    settle(getJson('api/review/mode')), settle(getJson('api/schedule/chat/latest?limit=5'))
  ]);
  const reviewPages = rev.ok ? (rev.v.pages || {}) : null;
  const items = sch.ok ? withTrainingRollup(withFixedPic(withReview(sch.v.data.items, reviewPages), !company.code)) : null;

  // menu Check List: sama seperti sidebar app (bab tersembunyi/dev dibuang, menu onlyIfData tidak dihitung, + menu Addon yang ditampilkan)
  const staticMenus = sec.ok ? sec.v.filter(c => !c.hidden && !c.dynamic && ((mode.ok && mode.v.editable) || !c.devOnly))
    .flatMap(c => c.pages.filter(p => p.status && !p.hidden && !p.onlyIfData && ((mode.ok && mode.v.editable) || !p.devOnly)).map(p => ({ id: p.id, title: p.title }))) : null;
  render({ sch, items, reviewPages, menus: staticMenus, chat, addonState: 'loading' });
  loadHealth(false);
  loadCompany();
  const addon = await addonP;
  if (staticMenus && addon.ok) render({ sch, items, reviewPages, menus: staticMenus.concat(reviewableMenus(addonPages(addon.v.objects || [])).map(p => ({ id: p.id, title: p.title }))), chat, addonState: 'ok' });
  else if (staticMenus) render({ sch, items, reviewPages, menus: staticMenus, chat, addonState: 'failed' });
}

let healthHtml = null;
function render({ sch, items, reviewPages, menus, chat, addonState }) {
  let html = '';
  // 1. hero: hitung mundur + kegiatan berikutnya + progres
  if (sch.ok) {
    const goLive = sch.v.data.project.goLiveDate, days = countdown(goLive), total = progress(items), next = nextMilestone(items);
    html += `<section class="hm-hero" aria-label="Go Live">
      <div class="countdown"><strong>${Math.abs(days)}</strong><span>${days > 0 ? 'hari menuju Go Live' : days === 0 ? 'Go Live hari ini' : 'hari sejak Go Live'}</span>
        <small>Go Live: ${esc(fmt(goLive, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</small></div>
      <div class="next-box">${next ? `<div><div class="lbl">Berikutnya</div><b><a href="schedule.html#/${tabOf(next)}">${esc(next.title)}</a></b>
        <div class="muted">${esc(fmt(next.startDate))}${next.endDate !== next.startDate ? ' s/d ' + esc(fmt(next.endDate)) : ''}, dalam ${countdown(next.startDate)} hari</div></div>` : '<div class="muted">Semua kegiatan sudah lewat.</div>'}
        <div><div class="muted" style="margin-bottom:6px"><b style="color:var(--text)">${total.done}</b> dari ${total.total} kegiatan jadwal selesai (${total.percent}%)</div>
        <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${total.percent}" aria-label="Progres jadwal"><i style="width:${total.percent}%"></i></div></div></div>
    </section>`;
  } else html += `<p class="callout warn">Jadwal belum bisa dimuat. <a href="schedule.html">Buka Schedule</a></p>`;

  // 2. kartu modul
  const st = items ? items.map(it => effectiveStatus(it.status, it.endDate)) : [];
  const cnt = s => st.filter(x => x === s).length;
  const rv = s => menus && reviewPages ? menus.filter(m => (reviewPages[m.id]?.status || 'none') === s).length : null;
  html += `<section class="mods" aria-label="Modul">
    <a class="mod m-sched" href="schedule.html"><h2>Schedule</h2>
      ${items ? `<div class="big">${cnt('selesai')} <small>dari ${items.length} kegiatan selesai</small></div><div class="sub">Proses ${cnt('proses')} · Telat ${cnt('telat')}</div>` : '<div class="sub">Belum bisa dimuat.</div>'}
      <span class="go">Buka Schedule</span></a>
    <a class="mod m-check" href="index.html#/ringkasan"><h2>Project Check List</h2>
      ${menus && reviewPages ? `<div class="big">${rv('ok')} <small>dari ${menus.length} menu sesuai</small></div><div class="sub">Belum sesuai ${rv('nok')} · Belum direview ${rv('none')}${addonState === 'ok' ? '' : addonState === 'loading' ? ' (menu Addon sedang dimuat)' : ' (menu Addon belum bisa dimuat)'}</div>` : '<div class="sub">Status review belum bisa dimuat.</div>'}
      <span class="go">Buka Check List</span></a>
    <a class="mod m-setup admin-only" href="setup.html"><h2>Setup &amp; Cut Off</h2>
      <div class="sub">Bandingkan data DB sumber, export, dan upload ke SAP lewat Service Layer.</div>
      <div class="sub" id="setup-sl">Service Layer: mengecek...</div><span class="go">Buka Setup</span></a>
    <a class="mod m-tools admin-only" href="hana.html"><h2>Tools</h2>
      <div class="sub">Backup &amp; Restore HANA, Count Document, Daftar Query, RPT Editor.</div><span class="go">Buka Tools</span></a>
  </section>`;

  // 3. perlu dicek (gabungan) | koneksi + diskusi
  const todo = [];
  if (items) for (const it of needsAttention(items)) {
    const s = effectiveStatus(it.status, it.endDate);
    todo.push({ href: `schedule.html#/${tabOf(it)}`, title: it.title, sub: `Schedule · ${fmt(it.endDate)}`, tag: s === 'telat' ? ['telat', 'Telat'] : ['soon', `${countdown(it.endDate)} hari lagi`] });
  }
  if (menus && reviewPages) for (const m of menus.filter(m => reviewPages[m.id]?.status === 'nok'))
    todo.push({ href: `index.html#/${m.id}`, title: m.title, sub: `Check List${reviewPages[m.id].note ? ' · ' + reviewPages[m.id].note : ''}`, tag: ['nok', 'Belum sesuai'] });
  const shown = todo.slice(0, 6);
  html += `<div class="cols"><div><section class="panel" aria-label="Perlu dicek"><h2>Perlu dicek ${todo.length ? `<span class="pill">${todo.length}</span>` : ''}</h2>
    ${todo.length ? `<ul class="list">${shown.map(x => `<li><div class="t"><a href="${x.href}">${esc(x.title)}</a><small>${esc(x.sub)}</small></div><span class="tag ${x.tag[0]}">${esc(x.tag[1])}</span></li>`).join('')}</ul>
      ${todo.length > shown.length ? `<p class="muted" style="margin:8px 0 0">dan ${todo.length - shown.length} hal lain.</p>` : ''}`
      : '<p class="muted" style="margin:0">Tidak ada yang perlu dicek: tidak ada kegiatan telat atau jatuh tempo 3 hari ke depan, dan tidak ada menu Belum sesuai.</p>'}
  </section>${upcomingHtml(items)}</div><div>
    <section class="panel admin-only" aria-label="Status koneksi"><h2>Status koneksi <button class="control" id="health-btn" type="button">Cek ulang</button></h2><ul class="list" id="health"><li><div class="t muted">Mengecek koneksi...</div></li></ul></section>
    <section class="panel" aria-label="Diskusi terbaru"><h2>Diskusi terbaru</h2><ul class="list" id="chat"></ul></section>
  </div></div>`;
  $('#home').innerHTML = html;
  if (healthHtml) { $('#health').innerHTML = healthHtml.list; const s = $('#setup-sl'); if (s) s.textContent = healthHtml.sl; }
  $('#health-btn').onclick = () => loadHealth(true);

  // diskusi terbaru: teks ditulis dengan textContent (tidak pernah sebagai HTML)
  const ul = $('#chat'), msgs = chat.ok ? chat.v.messages || [] : null;
  if (!msgs) ul.innerHTML = '<li><div class="t muted">Diskusi belum bisa dimuat.</div></li>';
  else if (!msgs.length) ul.innerHTML = '<li><div class="t muted">Belum ada diskusi. Mulai dari tombol Diskusi di Schedule.</div></li>';
  else for (const m of msgs) {
    const li = document.createElement('li'); li.className = 'msg';
    const t = document.createElement('div'); t.className = 't';
    const a = document.createElement('a'); a.href = 'schedule.html#/' + threadTab(m.thread, items); a.textContent = threadTitle(m.thread, items);
    const meta = document.createElement('small'); meta.textContent = `${m.editor} · ${timeOf(m.at)}`;
    const p = document.createElement('p'); p.textContent = m.text.length > 160 ? m.text.slice(0, 157) + '...' : m.text;
    t.append(a, meta, p); li.append(t); ul.append(li);
  }
}

// kegiatan terdekat yang belum selesai (yang sedang berjalan ikut tampil), maks 6
function upcomingHtml(items) {
  if (!items) return '';
  const today = todayLocal(), sym = { selesai: '✓', proses: '◐', belum: '○', telat: '!' };
  const list = items.filter(it => it.endDate >= today && effectiveStatus(it.status, it.endDate) !== 'selesai')
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate)).slice(0, 6);
  const pic = v => !v ? '-' : v.startsWith('PPMK:') ? v.slice(5) : v;
  const when = it => fmt(it.startDate, { day: 'numeric', month: 'short' }) + (it.endDate !== it.startDate ? ' s/d ' + fmt(it.endDate, { day: 'numeric', month: 'short' }) : '');
  return `<section class="panel" aria-label="Kegiatan mendatang"><h2>Kegiatan mendatang <a class="control" href="schedule.html" style="text-decoration:none">Lihat jadwal</a></h2>
    ${list.length ? `<ul class="list">${list.map(it => { const s = effectiveStatus(it.status, it.endDate); return `<li><span class="when">${esc(when(it))}</span>
      <div class="t"><a href="schedule.html#/${tabOf(it)}">${esc(it.title)}</a></div><span class="pic" title="PIC">${esc(pic(it.pic))}</span>
      <span class="tag ${s === 'telat' ? 'telat' : s === 'proses' ? 'proses' : 'belum'}">${sym[s]} ${esc(s)}</span></li>`; }).join('')}</ul>`
      : '<p class="muted" style="margin:0">Tidak ada kegiatan mendatang.</p>'}</section>`;
}

const threadTitle = (th, items) => th === 'umum' ? 'Umum' : th.startsWith('tab:') ? (TABS[th.slice(4)] || 'Schedule')
  : th.startsWith('item:') ? (items?.find(it => it.id === th.slice(5))?.title || 'Kegiatan') : th;
const threadTab = (th, items) => th.startsWith('tab:') && TABS[th.slice(4)] ? th.slice(4)
  : th.startsWith('item:') ? (() => { const it = items?.find(x => x.id === th.slice(5)); return it ? tabOf(it) : 'ringkasan'; })() : 'ringkasan';
const timeOf = iso => { const d = new Date(iso); return isNaN(d) ? '' : new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d); };

async function loadHealth(fresh) {
  const ul = $('#health'), btn = $('#health-btn');
  if (!ul) return;
  if (btn) btn.disabled = true;
  try {
    const h = await getJson('api/health' + (fresh ? '?fresh=true' : ''), 20000);
    const row = (label, x) => `<li><div class="t"><b>${label}</b><small>${esc(x.target || '')}${x.ok ? (x.ms != null ? ` · ${x.ms} ms` : '') : ' · ' + esc(x.message || 'Gagal')}</small></div><span class="tag ${x.ok ? 'good' : 'bad'}">${x.ok ? '✓ Tersambung' : '✕ Gagal'}</span></li>`;
    healthHtml = { list: row('Database HANA', h.db) + row('Service Layer', h.sl), sl: h.sl.ok ? 'Service Layer: tersambung.' : 'Service Layer: gagal login, upload belum bisa dipakai.' };
    if ($('#health')) $('#health').innerHTML = healthHtml.list;
    const s = $('#setup-sl'); if (s) s.textContent = healthHtml.sl;
  } catch {
    if ($('#health')) $('#health').innerHTML = '<li><div class="t muted">Status koneksi belum bisa dicek.</div><span class="tag bad">✕</span></li>';
  } finally { if (btn) btn.disabled = false; }
}

async function loadCompany() {
  if (company.code) { $('#company-name').textContent = company.name; $('#home-company-logo').textContent = company.code.toUpperCase(); document.title = `Home · ${company.name}`; return; }
  try {
    const d = await getJson('api/section/company-details', 30000), r = d.results && d.results.company;
    const i = r && r.columns ? r.columns.indexOf('CompnyName') : -1;
    if (i >= 0 && r.rows[0] && r.rows[0][i]) {
      $('#company-name').textContent = r.rows[0][i];
      document.title = companyTitle('Home', r.rows[0][i]);
    }
  } catch { /* nama default tetap dipakai */ }
}

Promise.all([loadMetadata(), loadCapabilities()]).then(load).catch(e => { $('#home').textContent = e.message; });
