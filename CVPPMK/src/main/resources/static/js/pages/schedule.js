import { company, loadCompany } from '../company.js';
/* Fungsi tanggal murni dipakai UI dan tes Node. Tanggal kalender lokal, bukan jam UTC. */
export function isValidDate(value) {
  if (typeof value !== 'string' || value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  return d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}
export function todayLocal(now = new Date()) {
  return `${String(now.getFullYear()).padStart(4, '0')}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
function dayNumber(value) {
  if (!isValidDate(value)) throw new RangeError('Tanggal harus YYYY-MM-DD yang valid.');
  const [y,m,d] = value.split('-').map(Number), utc = new Date(0);
  utc.setUTCFullYear(y,m-1,d); utc.setUTCHours(0,0,0,0);
  return utc.getTime() / 86400000;
}
export function countdown(target, today = todayLocal()) { return dayNumber(target) - dayNumber(today); }
export function effectiveStatus(status, endDate, today = todayLocal()) {
  if (!['belum','proses','selesai'].includes(status)) throw new RangeError('Status tersimpan tidak valid.');
  return countdown(endDate,today) < 0 && status !== 'selesai' ? 'telat' : status;
}
export function validRange(start, end) { return isValidDate(start) && isValidDate(end) && start <= end; }

export function needsAttention(items, today = todayLocal()) {
  return items.filter(it => it.status !== 'selesai' && countdown(it.endDate, today) <= 3)
    .sort((a,b) => a.endDate.localeCompare(b.endDate) || a.id.localeCompare(b.id));
}
// Tabs follow stored schedule content: removing a seed section does not migrate existing documents.
export function scheduleTabs(items) {
  return { ringkasan:'Ringkasan', master:'Master Data',
    ...(items.some(it => it.section === 'training' || it.id === 'training') ? { training:'Training' } : {}),
    stock:'Stock Opname', balance:'Beginning Balance' };
}
export function timelineMilestones(items) {
  return ['kickoff','training','upload-master','verify','opname','opname-toko','inventory','inventory-toko','golive','ap-ar','fa','gl','final']
    .map(id => items.find(it => it.id === id)).filter(Boolean);
}
// Teks ringkas untuk kartu garis waktu: kalimat yang memuat hari, tanggal, jam, atau tahun dibuang (tanggalnya sudah ada di sumbu).
const NOTE_DAY = /\b(?:Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu)\b/i;
const NOTE_DATE = /\b\d{1,2}(?:\s*[–-]\s*\d{1,2})?\s+(?:Jan|Feb|Mar|Apr|Mei|Jun|Jul|Agu|Sep|Okt|Nov|Des)[a-z]*\b/i;
const NOTE_TIME = /\b\d{1,2}[:.]\d{2}\b/;
const NOTE_YEAR = /\b20\d{2}\b/;
export function cardNote(note) {
  return String(note || '').split(/(?<=[.;])\s+/).map(s => s.trim())
    .filter(s => s && !(NOTE_DAY.test(s) || NOTE_DATE.test(s) || NOTE_TIME.test(s) || NOTE_YEAR.test(s)))
    .map(s => s.replace(/;$/, '.').replace(/^./, c => c.toUpperCase())).join(' ');
}
// Pekerjaan konsultan STEM: PIC otomatis "STEM" dan tidak bisa diubah (ubah daftar ini bila pembagian kerja berubah).
export const STEM_ITEMS = ['training', 'training-1', 'upload-master', 'inventory-upload', 'ap-ar', 'fa', 'gl'];
export const isStemItem = id => STEM_ITEMS.includes(id);
let fixedPicIds = null;
export const fixedCompanyPic = (id, code = company.code, ids = fixedPicIds) => ids ? ids.includes(id) : !code && isStemItem(id);
export function rollupStatus(statuses) {
  if (!statuses.length) return null;
  return statuses.every(s => s === 'selesai') ? 'selesai' : statuses.some(s => s === 'selesai' || s === 'proses') ? 'proses' : 'belum';
}
export function withTrainingRollup(items) {
  const days = items.filter(it => it.section === 'training');
  const status = rollupStatus(days.map(it => it.status));
  return status ? items.map(it => it.id === 'training' ? Object.assign({}, it, { status, auto: true }) : it) : items;
}
export function withFixedPic(items, enabled = true, ids = STEM_ITEMS, keepAssigned = false) {
  return items.map(it => enabled && ids.includes(it.id) ? Object.assign({}, it, { pic: keepAssigned && it.pic ? it.pic : 'STEM', picFixed: true }) : it);
}
// PIC: "" | "STEM" | "PPMK:<USER_CODE>" (user dari daftar user SAP di menu User). Nilai lain (teks lama) ditampilkan apa adanya.
export function activeUsers(rows) {
  // akun sistem SAP (SUPERUSER = Y: manager, B1i, AlertSvc, INTERFACE, ...) dan user terkunci tidak ditampilkan sebagai PIC
  return (Array.isArray(rows) ? rows : []).filter(r => Array.isArray(r) && r[0] != null && String(r[2] || '').toUpperCase() !== 'Y' && String(r[3] || '').toUpperCase() !== 'Y')
    .map(r => ({ code: String(r[0]), name: String(r[1] || r[0]) }));
}
/** Gabung user SAP dengan list user CV PPMK: hanya user yang ada di SAP, nama dari list dipakai bila ada.
 *  Kalau daftar SAP gagal dimuat, list dipakai apa adanya. Urut username. */
export function mergeUsers(sapUsers = [], listUsers = [], sapLoaded = true) {
  const map = new Map(sapUsers.map(u => [u.code, { ...u, inSap: true }]));
  for (const l of Array.isArray(listUsers) ? listUsers : []) {
    if (!l || !l.code) continue;
    const name = String(l.name || '').trim(), cur = map.get(l.code);
    if (cur) { if (name) cur.name = name; }
    else if (!sapLoaded) map.set(l.code, { code: l.code, name: name || l.code });   // daftar SAP gagal dimuat: pakai list saja
  }
  return [...map.values()].sort((a, b) => a.code.localeCompare(b.code));
}
/** "ACC-STF1 (Dewi)": username SAP selalu tampil, nama ditambahkan bila berbeda dari username. */
export const userLabel = u => u.name && u.name !== u.code ? `${u.code} (${u.name})` : u.code;
export function picLabel(value, users = [], group = company.picGroup) {
  const v=String(value||'').trim();if(!v)return '';
  if(v.startsWith(group+':')) { const code=v.slice(group.length+1),u=users.find(x=>x.code===code);return group+' · '+userLabel(u||{code,name:code}); }
  return v.startsWith('PPMK:')?'PPMK · '+v.slice(5):v;
}
export function picOptions(users = [], current = '', group = company.picGroup) {
  const opts = [{ value: '', label: '+ PIC', group: '' }, { value: 'STEM', label: 'STEM', group: '' }]
    .concat(users.map(u => ({ value: u.code ? group+':' + u.code : u.name, label: userLabel(u), group })));   // sudah di bawah grup "PPMK", jadi tanpa awalan supaya muat di kolom
  const cur = String(current || '').trim();
  if (cur && !opts.some(o => o.value === cur)) opts.push({ value: cur, label: picLabel(cur, users), group: '' });
  return opts;
}
export function usersFromSection(data, excludedCodes=[]) {
  const table=data?.results?.users;if(!table?.columns||table.error)return [];
  const ci=table.columns.indexOf('USER_CODE'),ni=table.columns.indexOf('U_NAME'),li=table.columns.indexOf('Locked');
  if(ci<0||ni<0||li<0)return [];
  const excluded=new Set(excludedCodes.map(c=>c.toUpperCase()));
  return table.rows.filter(r=>r[ci] && r[li]==='N'&&!excluded.has(String(r[ci]).toUpperCase())).map(r=>({code:String(r[ci]),name:String(r[ni]||r[ci])}));
}
export async function loadCompanyPicUsers(fetchImpl = fetch) {
  try {
    if(company.picSource==='sap') {const r=await fetchImpl('api/section/users',{cache:'no-store'});return r.ok?usersFromSection(await r.json(),company.picExcludedCodes):[];}
    if(company.picSource==='file'&&company.picUsersFile) {const r=await fetchImpl('data/'+company.picUsersFile,{cache:'no-store'}),list=r.ok?await r.json():null;return mergeUsers([],list?.users,false);}
  } catch { /* Unknown/unavailable directory keeps free text available. */ }
  return [];
}
export function resolvePicText(text,users=[],group=company.picGroup) {
  const hit=users.find(u=>userLabel(u)===text||u.code===text);return hit?group+':'+hit.code:text;
}
export function savedAt(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Belum tersedia';
  return new Intl.DateTimeFormat('id-ID', {day:'numeric',month:'short',year:'numeric'}).format(date)
    + ' ' + String(date.getHours()).padStart(2,'0') + ':' + String(date.getMinutes()).padStart(2,'0');
}
export function areaStatus(items, today = todayLocal()) {
  const states = items.map(it => effectiveStatus(it.status,it.endDate,today));
  return states.includes('telat') ? 'telat' : states.length && states.every(s=>s==='selesai') ? 'selesai'
    : states.some(s=>s==='proses'||s==='selesai') ? 'proses' : 'belum';
}

export function progress(items) {
  const done = items.filter(it => it.status === 'selesai').length;
  return {done, total:items.length, percent:items.length ? Math.round(done/items.length*100) : 0};
}
export function groupProgress(items) {
  return ['A','B','C','D','E'].map(group => {
    const rows = items.filter(it => it.section === 'master' && it.group === group);
    return {group, items:rows, ...progress(rows), startDate:rows.map(it=>it.startDate).sort()[0], endDate:rows.map(it=>it.endDate).sort().at(-1)};
  });
}
export function nextMilestone(items, today = todayLocal()) {
  return items.filter(it=>it.section==='milestone' && it.status!=='selesai' && it.startDate>=today)
    .sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.id.localeCompare(b.id))[0] ?? null;
}
export function todayMarker(items, today = todayLocal()) {
  if (!items.length) return null;
  const start = items.map(it=>it.startDate).sort()[0], end = items.map(it=>it.endDate).sort().at(-1);
  if (today<start || today>end) return null;
  const span=countdown(end,start);
  return {date:today, percent:span ? countdown(today,start)/span*100 : 0};
}
// Garis waktu Beginning Balance: cut off Inventory, serah+upload Inventory, cut off area lain, lalu serah->upload per area (A/P dan A/R digabung).
export const isInventoryActivity = id => /^(opname|cutoff|inventory(?:-upload)?)(?:-[a-z0-9-]+)?$/.test(id);
// Location labels come from seed titles; shared CV data has no suffix and retains its original labels.
export function inventoryLocations(items) {
  const get = id => items.find(it => it.id === id);
  return items.filter(it => it.id === 'balance-inv' || it.id.startsWith('balance-inv-')).map(balance => {
    const suffix = balance.id.slice('balance-inv'.length), label = balance.title.replace(/^Inventory\s*/, '');
    const shortLabel = label.split(/\s*\/\s*/).slice(0,2).join('/');
    return { balance, suffix, label, shortLabel, opname:get('opname'+suffix), cutoff:get('cutoff'+suffix), handover:get('inventory'+suffix), upload:get('inventory-upload'+suffix) };
  });
}
export function shortInventoryTitle(title, items) {
  return inventoryLocations(items).reduce((t, loc) => loc.label ? t.replace(loc.label, loc.shortLabel) : t, title);
}
export function inventoryFlow(loc) {
  const b=loc.balance, label=loc.shortLabel ? ' '+loc.shortLabel : '', target='stock';
  return [
    {id:'st-opname'+loc.suffix,title:'Hitung fisik'+label,startDate:loc.opname.startDate,endDate:loc.opname.endDate,status:loc.opname.status,note:loc.label ? loc.opname.note : 'Oleh tim perusahaan, tanpa penerimaan/pengiriman.',target},
    {id:'st-cutoff'+loc.suffix,title:'Cut off inventory'+label,startDate:b.cutoffDate,endDate:b.cutoffDate,status:loc.cutoff.status,note:'',target},
    {id:'st-serah'+loc.suffix,title:'Serah ke STEM'+label,startDate:b.handoverDate,endDate:b.handoverDate,status:loc.handover.status,note:loc.label ? loc.handover.note : '',time:b.handoverTime,target},
    {id:'st-upload'+loc.suffix,title:'Upload SAP'+label,startDate:b.uploadDate,endDate:b.uploadDate,status:(loc.upload||b).status,note:!b.uploadTime ? b.note : 'Dicek tim perusahaan.',time:b.uploadTime,target}
  ];
}
// Merge matching physical-count/cutoff cards only; distinct handover/upload times keep their own cards.
export function combinedInventoryFlow(items) {
  const locations=inventoryLocations(items), out=[];
  for (const loc of locations) for (const [stage,e] of inventoryFlow(loc).entries()) {
    const previous=stage<2 && out.find(x=>x.stage===stage && x.startDate===e.startDate && x.endDate===e.endDate && x.time===e.time);
    if(previous) {
      previous.title=(stage===0?'Hitung fisik':'Cut off inventory')+' '+locations.filter(l=>previous.ids.includes('st-'+(stage===0?'opname':'cutoff')+l.suffix)||l===loc).map(l=>l.shortLabel).join(' · ');
      previous.ids.push(e.id); previous.status=rollupStatus([previous.status,e.status]);
      previous.note=stage===0?'Hitung fisik oleh tim perusahaan, tanpa penerimaan/pengiriman.':'';
    } else out.push({...e,stage,ids:[e.id]});
  }
  return out.sort((a,b)=>a.startDate.localeCompare(b.startDate)||(a.time||'').localeCompare(b.time||'')||a.stage-b.stage);
}
export function balanceTimeline(items) {
  const get = id => items.find(it => it.id === id);
  const lo = (...v) => v.filter(Boolean).sort()[0], hi = (...v) => v.filter(Boolean).sort().slice(-1)[0];
  const rest = ['balance-ap', 'balance-ar', 'balance-asset', 'balance-ledger'].map(get).filter(Boolean);
  const out = [];
  for (const {balance:inv, suffix, label} of inventoryLocations(items)) {
    out.push({ id: 'bb-inv-cutoff'+suffix, title: 'Cut off Inventory'+(label?' '+label:''), startDate: inv.cutoffDate, endDate: inv.cutoffDate, status: inv.status, note: '', target: 'balance' });
    out.push({ id: 'bb-inv-upload'+suffix, title: 'Serah & upload Inventory'+(label?' '+label:''), startDate: inv.handoverDate, endDate: inv.uploadDate, status: inv.status, note: inv.uploadTime ? 'Serah ke STEM lalu upload SAP.' : inv.note, time: inv.uploadTime, target: 'balance' });
  }
  if (rest.length) out.push({ id: 'bb-cutoff', title: 'Cut off A/P, A/R, Fixed Asset, G/L', startDate: lo(...rest.map(it => it.cutoffDate)), endDate: hi(...rest.map(it => it.cutoffDate)), status: areaStatus(rest), note: '', target: 'balance' });
  for (const [ids, title] of [[['balance-ap', 'balance-ar'], 'A/P dan A/R'], [['balance-asset'], 'Fixed Asset'], [['balance-ledger'], 'G/L']]) {
    const g = ids.map(get).filter(Boolean); if (!g.length) continue;
    out.push({ id: 'bb-' + ids[0], title, startDate: lo(...g.map(it => it.handoverDate)), endDate: hi(...g.map(it => it.uploadDate)), status: areaStatus(g), note: 'Serah ke STEM lalu upload SAP.', target: 'balance' });
  }
  return out.sort((a, b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));
}
// Titik "Upload A/P dan A/R", "Upload Fixed Asset", "Upload G/L" di garis waktu: tampil sebagai rentang serah (submit) -> upload,
// diambil dari baris Beginning Balance supaya satu sumber tanggal.
export const SUBMIT_SOURCES = { 'ap-ar': ['balance-ap', 'balance-ar'], fa: ['balance-asset'], gl: ['balance-ledger'] };
export function withSubmitRange(entry, items) {
  const src = SUBMIT_SOURCES[entry.id];
  if (!src) return entry;
  const rows = src.map(id => items.find(it => it.id === id)).filter(Boolean);
  const hand = rows.map(r => r.handoverDate).filter(isValidDate).sort(), up = rows.map(r => r.uploadDate).filter(isValidDate).sort();
  if (!hand.length || !up.length || hand[0] > up[up.length - 1]) return entry;
  return Object.assign({}, entry, { startDate: hand[0], endDate: up[up.length - 1], title: entry.title.replace(/^Upload /, 'Serah & upload '), note: 'Serah ke STEM lalu upload SAP.' });
}
// Penanda "Hari ini" di garis waktu: indeks titik yang akan didahului penanda (0 = sebelum titik pertama, panjang daftar = setelah titik terakhir).
// Titik yang mulai hari ini berada setelah penanda; titik yang sudah mulai lebih awal berada sebelumnya. null bila hari ini di luar rentang garis waktu.
export function timelineTodayIndex(items, today = todayLocal()) {
  if (!todayMarker(items, today)) return null;
  return items.filter(it => it.startDate < today).length;
}
export function compactTimelineDate(start,end=start) {
  if(!validRange(start,end)) throw new RangeError('Rentang tanggal tidak valid.');
  const months=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const short=v=>`${Number(v.slice(8))} ${months[Number(v.slice(5,7))-1]}`;
  return {label:start===end?short(start):start.slice(0,7)===end.slice(0,7)?`${Number(start.slice(8))}–${short(end)}`:`${short(start)}–${short(end)}`,
    year:start.slice(0,4)===end.slice(0,4)?start.slice(0,4):`${start.slice(0,4)}–${end.slice(0,4)}`};
}

export function draftChanges(original, items) {
  return items.flatMap(it => {
    const before = original.find(row=>row.id===it.id);
    const fields = Object.keys(it).filter(key=>key!=='id' && it[key]!==before?.[key]);
    return fields.length ? [{id:it.id,title:it.title,fields}] : [];
  });
}

if (typeof document !== 'undefined' && document.getElementById('draft-bar')) loadCompany().then(mount).catch(e => { document.getElementById('notice').textContent = e.message; });
function mount() {
  const $ = s => document.querySelector(s), view = $('#view'), notice = $('#notice');
  if (company.code) {
    $('#pic-suggestions-help').innerHTML = 'Klik kolom <b>PIC</b> pada baris kegiatan. Pilih STEM atau user dari saran, atau ketik nama PIC sendiri. Cek dan konfirmasi daftar pada <a href="index.html#/users">User (1.5)</a>.';
    $('#cv-pic-help').hidden = true; $('#fixed-pic-help').hidden = true;
  }
  let names = scheduleTabs([]);
  const chatThreads = [];
  let chat = null, reviewPages = null, RV = null, editable = false, lockConfigured = true;
  let picUsers = [];
  async function loadPicUsers() {
    picUsers = await loadCompanyPicUsers();
    if(doc&&!editorId)render();
  }
  const picShown = v => v && (String(v).startsWith(company.picGroup+':')||String(v).startsWith('PPMK:')) ? picLabel(v,picUsers).replace(new RegExp('^'+company.picGroup+' · '),'') : (v||'');
  const picSelectHtml = (value, attrs, cls) =>
    `<input class="control pic-input ${cls || ''}" type="text" maxlength="200" placeholder="Pilih atau ketik PIC" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" value="${esc(picShown(value))}" ${attrs}>`;
  // daftar saran PIC buatan sendiri (datalist bawaan browser tidak bisa diatur tampilannya)
  const picPop = document.createElement('ul'); picPop.className = 'pic-pop'; picPop.setAttribute('role', 'listbox'); picPop.hidden = true; document.body.appendChild(picPop);
  let picFor = null, picIdx = -1;
  const picChoices = () => picOptions(picUsers);
  function picPlace() { if (!picFor) return; const r = picFor.getBoundingClientRect(); picPop.style.left = `${r.left + scrollX}px`; picPop.style.top = `${r.bottom + scrollY + 4}px`; picPop.style.width = `${Math.max(r.width, 220)}px`; }
  function picFilter() {
    if (!picFor) return;
    const raw = picFor.value.trim(), q = raw.toLowerCase(), list = picChoices().filter(c => !q || c.label.toLowerCase().includes(q));
    const exact = list.some(c => c.label.toLowerCase() === q);
    picIdx = -1;
    picPop.innerHTML = `<li class="hint" aria-hidden="true">Pilih dari daftar, atau ketik nama lain lalu Enter.</li>`
      + list.map((c,i) => `${c.group && (!i||list[i-1].group!==c.group)?`<li class="hint" role="presentation">${esc(c.group)}</li>`:''}<li role="option" data-v="${esc(c.value)}">${esc(c.label)}</li>`).join('')
      // teks bebas: di bawah cocokan (panah langsung ke nama yang cocok); bila tidak ada yang cocok, jadi satu-satunya pilihan
      + (raw && !exact ? `<li role="option" class="free" data-v="${esc(raw)}">Pakai <b>&ldquo;${esc(raw)}&rdquo;</b> (ketik sendiri)</li>` : '');
    picPlace(); picPop.hidden = false; picFor.setAttribute('aria-expanded', 'true');
  }
  function picClose() { picPop.hidden = true; if (picFor) picFor.setAttribute('aria-expanded', 'false'); picFor = null; picIdx = -1; }
  function picPick(v) { const inp = picFor; picClose(); if (!inp) return; inp.value = picShown(v); inp.dataset.selectedPic=v; inp.dispatchEvent(new Event('change', { bubbles: true })); }
  function picMove(d) { const items = [...picPop.querySelectorAll('li[data-v]')]; if (!items.length) return; picIdx = (picIdx + d + items.length) % items.length; items.forEach((li, i) => li.classList.toggle('on', i === picIdx)); items[picIdx].scrollIntoView({ block: 'nearest' }); }
  picPop.addEventListener('mousedown', e => { e.preventDefault(); const li = e.target.closest('li[data-v]'); if (li) picPick(li.dataset.v); });
  document.addEventListener('focusin', e => { if (e.target.classList && e.target.classList.contains('pic-input')) { picFor = e.target; picFilter(); } });
  document.addEventListener('input', e => { if (e.target === picFor) { delete e.target.dataset.selectedPic; picFilter(); } });
  document.addEventListener('keydown', e => {
    if (!picFor || e.target !== picFor) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (picPop.hidden) picFilter(); picMove(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); picMove(-1); }
    else if (e.key === 'Enter') { const on = picPop.hidden ? null : picPop.querySelector('li.on'); e.preventDefault(); if (on) picPick(on.dataset.v); else { const inp = picFor; picClose(); inp.blur(); } }
    else if (e.key === 'Escape') { picPop.hidden = true; }
  });
  document.addEventListener('focusout', e => { if (e.target === picFor) setTimeout(() => { if (document.activeElement !== e.target) picClose(); }, 0); });
  window.addEventListener('scroll', () => { if (picFor && !picPop.hidden) picPlace(); }, true);
  window.addEventListener('resize', () => { if (picFor && !picPop.hidden) picPlace(); });
  const threadTitle = id => id === 'umum' ? 'Umum' : id.startsWith('tab:') ? (names[id.slice(4)] || id) : id.startsWith('item:') ? (doc?.data.items.find(it=>it.id===id.slice(5))?.title || id) : id;
  Promise.all([import('./schedule-chat.js'), import('./schedule-review.js')]).then(async ([C, R]) => {
    RV = R;
    chat = C.createChat({ threads: chatThreads, titleOf: threadTitle });
    reviewPages = await R.loadReview(); if (doc) render();
    const refreshReview = async () => { const next = await R.loadReview(); if (JSON.stringify(next) !== JSON.stringify(reviewPages)) { reviewPages = next; if (doc && !editorId) render(); } };
    setInterval(refreshReview, 30000); window.addEventListener('focus', refreshReview);
    if (doc) render();
  }).catch(() => { /* chat/Review gagal dimuat: Schedule tetap jalan tanpa keduanya */ });
  let baseline = [], doc = null, dirty = false, busy = false, conflict = false, editorId = null, renderedTab = 'ringkasan';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const current = () => Object.hasOwn(names, location.hash.replace(/^#\/?/,'')) ? location.hash.replace(/^#\/?/,'') : 'ringkasan';
  const format = s => { if (!isValidDate(s)) return s; return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${s}T12:00:00`)); };
  const message = text => { notice.textContent = text; };
  function controls() { $('#discard').disabled = busy; $('#draft-bar').hidden = !dirty; $('#saved-tools').hidden = dirty && !conflict; $('#draft-count').textContent = `${doc ? draftChanges(baseline,doc.data.items).length : 0} perubahan belum disimpan`;  $('#save').disabled = !doc || !dirty || busy || conflict; $('#reload').disabled = busy; view.querySelectorAll('button,input,select,textarea').forEach(e => e.disabled = busy); }
  function render() {
    names = scheduleTabs(doc?.data?.items || []);
    chatThreads.splice(0, chatThreads.length, {id:'umum',label:'Umum'}, ...Object.entries(names).filter(([k])=>k!=='ringkasan').map(([k,v])=>({id:'tab:'+k,label:v})));
    if (doc && !names.training && /^#\/?training$/.test(location.hash)) history.replaceState(null, '', '#/ringkasan');
    const tab = current(), projectName = company.code ? company.name : (doc?.data?.project?.name || company.name);
    renderedTab=tab; $('#page-title').textContent = names[tab]; document.title = `${names[tab]} · Schedule ${projectName}`;
    const brand = document.getElementById('schedule-company-name'); if (brand) brand.textContent = projectName;
    const logo = document.getElementById('schedule-company-logo'); if (logo) logo.textContent = company.code ? company.code.toUpperCase() : 'PP';
    document.querySelectorAll('[data-tab]').forEach(a => { a.closest('li').hidden = !Object.hasOwn(names, a.dataset.tab); a.classList.toggle('active',a.dataset.tab===tab); if(a.dataset.tab===tab) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
    if (!doc) return;
    $('#revision').textContent = `Disimpan terakhir: ${savedAt(doc.updatedAt)}${dirty ? ' • Ada perubahan lokal' : ''}`;
    const all = withTrainingRollup(withFixedPic(RV ? RV.withReview(doc.data.items, reviewPages) : doc.data.items, true, fixedPicIds || (company.code ? [] : STEM_ITEMS), !!company.code));
    const belongs = it => it.section === tab || tab==='stock' && (it.id==='balance-inv'||it.id.startsWith('balance-inv-')) || it.section === 'milestone' && (
      tab === 'master' && ['prepare','deadline','upload-master','verify'].includes(it.id) ||
      tab === 'stock' && isInventoryActivity(it.id) ||
      tab === 'ringkasan' && (it.cutover || it.id === 'kickoff'));
    const items = all.filter(belongs).sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.endDate.localeCompare(b.endDate));
    const symbols = {selesai:'✓',proses:'◐',belum:'○',telat:'!'};
    const badge = status => `<span class="badge ${status}">${symbols[status]} ${esc(status)}</span>`;
    const dates = it => `${esc(format(it.startDate))}${it.endDate!==it.startDate ? ' s/d '+esc(format(it.endDate)):''}`;
    const targetOf = it => isInventoryActivity(it.id)?'stock':it.id==='training'?'training':['prepare','deadline','upload-master','verify'].includes(it.id)?'master':'ringkasan';
    const entryOf = it => withSubmitRange({id:it.id,title:it.title,startDate:it.startDate,endDate:it.endDate,status:it.status,note:it.notes||it.note||'',target:targetOf(it)}, all);
    // Garis waktu bersama (Ringkasan dan Stock Opname). Entri: {id,title,startDate,endDate,status,note,target,time?}. Tanggal/jam di sumbu, bukan di kartu.
    const timelineHtml = (list, nextId, marker) => `<div class="timeline-shell"><ol class="timeline" style="--count:${list.length || 1}">${list.map((e,i)=>{
      const status=effectiveStatus(e.status,e.endDate), short=compactTimelineDate(e.startDate,e.endDate);
      const note=cardNote(e.note || ''), title=shortInventoryTitle(e.title,all), sub=esc(short.year)+(e.time?' · '+esc(e.time):'');
      const todayCls=marker===i?'':marker===list.length&&i===list.length-1?' after':null;
      const today=todayCls===null?'':`<span class="timeline-today${todayCls}" title="${esc(format(todayLocal()))}">Hari ini</span>`;
      return `<li class="${e.id===nextId?'upcoming':''}"><span class="timeline-date" aria-hidden="true">${esc(short.label)}<small>${sub}</small></span><span class="timeline-axis" aria-hidden="true"><span class="timeline-dot ${status}">${status==='selesai'?'✓':status==='telat'?'!':''}</span>${today}</span><a class="timeline-card" href="#/${e.target}" title="${esc(e.title+' · '+format(e.startDate)+(e.endDate!==e.startDate?' s/d '+format(e.endDate):'')+(e.time?' · '+e.time:'')+(note?' · '+note:''))}"><span class="mobile-date">${esc(short.label)} <small>${sub}</small></span><b>${esc(title)}</b>${note?`<span class="timeline-note">${esc(note)}</span>`:''}<span class="timeline-foot">${badge(status)}${e.id===nextId?'<span class="next-label">Berikutnya</span>':''}</span><span class="sr-only">${dates(e)}</span></a></li>`;
    }).join('')}</ol></div>`;
    const rules = doc.data.rules.filter((rule,i)=>tab==='ringkasan'||i===0&&tab==='master');
    const lockNote = editable ? '' : `<div class="callout warn lock-note"><b>Mode lihat.</b> PIC dan status bisa diubah lalu Simpan; tanggal dan catatan hanya admin. Diskusi bisa dipakai semua. ${lockConfigured ? `<form id="unlock-form" class="unlock"><label class="sr-only" for="unlock-pw">Password admin</label><input id="unlock-pw" class="control" type="password" autocomplete="current-password" placeholder="Password admin (sama dengan Setup)" maxlength="200"><button class="control secondary" type="submit">Buka kunci</button><span id="unlock-msg" role="alert"></span></form>` : ''}</div>`;
    $('#chat-head-slot').innerHTML = `<span data-chat-slot="${tab==='ringkasan'?'umum':'tab:'+tab}"></span>`;
    let html = lockNote + (rules.length>1 ? `<div class="callout info rules-note"><ul>${rules.map(rule=>`<li>${esc(rule)}</li>`).join('')}</ul></div>` : rules.map(rule=>`<p class="callout info">${esc(rule)}</p>`).join(''));
    if (tab === 'ringkasan') {
      const days = countdown(doc.data.project.goLiveDate);
      const counts={selesai:0,proses:0,belum:0,telat:0}; all.forEach(it=>{ counts[effectiveStatus(it.status,it.endDate)]++; });
      const total=progress(all);
      const goLong=new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(`${doc.data.project.goLiveDate}T12:00:00`));
      const kpi=(key,label)=>`<div class="kpi ${key}" ${key==='telat'?'title="Tanggal akhir sudah lewat dan status belum selesai."':''}><strong>${counts[key]}</strong><span>${symbols[key]} ${label}</span></div>`;
      html += `<section class="hero" aria-label="Ringkasan Go Live"><div class="countdown"><strong>${Math.abs(days)}</strong><span>${days>0?'hari menuju Go Live':days===0?'Go Live hari ini':'hari sejak Go Live'}</span><small>Go Live: ${esc(goLong)}</small></div>
        <div class="kpi-side"><div class="kpi-bar">${kpi('selesai','Selesai')}${kpi('proses','Proses')}${kpi('belum','Belum')}${kpi('telat','Telat')}</div>
        <div class="progress-line"><span><b>${total.done}</b> dari ${total.total} kegiatan selesai (${total.percent}%)</span><progress max="100" value="${total.percent}" aria-label="Progres keseluruhan">${total.percent}%</progress></div></div></section>`;
      const next=nextMilestone(all), timeline=timelineMilestones(all);
      if(next && !timeline.some(it=>it.id===next.id)) timeline.push(next);
      timeline.sort((a,b)=>a.startDate.localeCompare(b.startDate)||a.id.localeCompare(b.id));
      const locations=inventoryLocations(all);
      const entries=locations.length>1 ? [
        ...timeline.filter(it=>!isInventoryActivity(it.id)).map(entryOf), ...combinedInventoryFlow(all)
      ].sort((a,b)=>a.startDate.localeCompare(b.startDate)||(a.time||'').localeCompare(b.time||'')) : timeline.map(entryOf).map(e=>{
        const loc=locations.find(l=>l.handover?.id===e.id);
        if(!loc?.upload) return e;
        return {...e,title:'Serah & upload '+(loc.label||'inventory'),status:rollupStatus([e.status,loc.upload.status]),time:loc.balance.uploadTime||loc.balance.handoverTime,note:loc.balance.uploadTime?e.note:loc.balance.note};
      }), marker=timelineTodayIndex(entries);
      if(next) html += `<p class="next">Berikutnya: <b>${esc(next.title)}</b> dalam ${countdown(next.startDate)} hari</p>`;
      html += `<h2>Garis waktu</h2><p class="legend">✓ selesai · ◐ proses · ○ belum · ! telat <abbr title="Telat: tanggal akhir sudah lewat dan status belum selesai (tanggal lokal perangkat).">ⓘ</abbr> Pilih kartu untuk membuka tab kegiatan.</p>${timelineHtml(entries, next?.id, marker)}`;
      const attention = needsAttention(all);
      html += ` ${attention.length ? `<section class="attention"><h2>Perlu dicek</h2>`+ `<ul>${attention.map(it=>`<li><a href="#/${it.section==='milestone' ? isInventoryActivity(it.id)?'stock':it.id==='training'?'training':['prepare','deadline','upload-master','verify'].includes(it.id)?'master':'ringkasan' : it.section}">${esc(it.title)}</a> · ${esc(format(it.endDate))} ${badge(effectiveStatus(it.status,it.endDate))}</li>`).join('')}</ul>`+'</section>' : '<p class="muted">Perlu dicek: tidak ada kegiatan mendesak.</p>'}`;
      const get = id => all.find(it=>it.id===id);
      const cell = (label, value) => `<td data-label="${label}">${value}</td>`;
      const master = all.filter(it=>it.section==='master'||['prepare','deadline','upload-master','verify'].includes(it.id));
      const dateOf = (id,key='endDate') => get(id) ? esc(format(get(id)[key])) : '-';
      const row = (title,cutoff,handover,upload,group) => `<tr>${cell('Area',esc(title))}${cell('Cut Off',cutoff)}${cell('Serah ke STEM',handover)}${cell('Upload SAP',upload)}${cell('PIC',esc([...new Set(group.map(it=>picLabel(it.pic,picUsers)).filter(Boolean))].join(', ')||'-'))}${cell('Status',badge(areaStatus(group)))}</tr>`;
      html += '<h2>Ringkasan per area</h2><div class="table-wrap"><table class="settings area-table"><thead><tr><th>Area</th><th>Cut Off</th><th>Serah ke STEM</th><th>Upload SAP</th><th>PIC</th><th>Status</th></tr></thead><tbody>';
      html += row('Master Data','-',dateOf('deadline'),dateOf('upload-master')+'<small>Verifikasi: '+dateOf('verify')+'</small>',master);
      for (const ids of [...inventoryLocations(all).map(l=>[l.balance.id]),['balance-ap','balance-ar'],['balance-asset'],['balance-ledger']]) {
        const group = ids.map(get).filter(Boolean); if(!group.length) continue;
        // Jika A/P dan A/R diedit berbeda, tampilkan kedua jadwal dengan label.
        const values = (key,time) => group.map(it=>`${group.length>1?esc(it.title)+': ':''}${esc(format(it[key]))} ${time?esc(it[time] || ''):''}`).join('<br>');
        html += row(group.length>1?'A/P dan A/R':group[0].title,values('cutoffDate'),values('handoverDate','handoverTime'),values('uploadDate','uploadTime'),group);
      }
      html += '</tbody></table></div><p>Status area menggabungkan checklist terkait; milestone dan checklist tetap disimpan terpisah.</p>';
      html += '<h2>Kegiatan cutover</h2><p class="muted">Urutan cutover dan milestone proyek. PIC dan status bisa diubah langsung di sini; kegiatan yang juga muncul di tab lain memakai data yang sama.</p>';
    }
    if (tab === 'stock') {
      const locations=inventoryLocations(all);
      html += '<div id="inventory-flows"><h2>Alur inventory</h2>';
      for (const steps of locations.length>1 ? [combinedInventoryFlow(all)] : locations.map(inventoryFlow)) {
        html += `<p class="legend">✓ selesai · ◐ proses · ○ belum · ! telat <abbr title="Telat: tanggal akhir sudah lewat dan status belum selesai (tanggal lokal perangkat).">ⓘ</abbr></p>${timelineHtml(steps,null,timelineTodayIndex(steps))}`;
      }
      const locationRules=doc.data.rules.filter(rule=>locations.some(loc=>loc.label && rule.startsWith(loc.label+':')));
      html += `<section class="rules"><h2>Aturan</h2><ul>${locationRules.length?locationRules.map(rule=>`<li>${esc(rule)}</li>`).join(''):'<li>Tanpa penerimaan/pengiriman selama opname.</li><li>Transaksi 31 Des diakui Januari 2027.</li><li>Pergerakan setelah cut off dikoordinasikan dengan STEM.</li>'}</ul></section></div>`;
    }
    if (tab === 'balance') { const steps=balanceTimeline(all); html += `<h2>Alur saldo awal</h2><p class="legend">✓ selesai · ◐ proses · ○ belum · ! telat <abbr title="Telat: tanggal akhir sudah lewat dan status belum selesai (tanggal lokal perangkat).">ⓘ</abbr></p>${steps.length?timelineHtml(steps, null, timelineTodayIndex(steps)):''}<p>Status di sini mencatat kesiapan saldo awal per area, terpisah dari status milestone Ringkasan.</p>`; }
    html += '<div id="editor-slot"></div>';
    const reviewNote = r => r ? r.pages.map(p=>`<a class="review-link" href="${RV.reviewHref(p.id)}" title="Buka halaman Review ${esc(p.id)}">${r.pages.length>1?esc(p.id)+': ':''}${esc(RV.REVIEW_LABEL[p.status]||'Review')}</a>`).join(' · ') : '';
    function statusCell(it,status) {
      if (it.auto) return `<span class="badge ${status} auto">${symbols[status]} ${esc(status)}</span><small class="review-src">Otomatis dari Review: ${reviewNote(it.review)}</small>`;
      const select = `<select class="control badge ${status}" data-status="${esc(it.id)}" aria-label="Status ${esc(it.title)}">${['belum','proses','selesai'].map(st=>`<option value="${st}" ${st===it.status?'selected':''}>${symbols[st]} ${st===it.status&&status==='telat'?'Telat · ':''}${st}</option>`).join('')}</select>`;
      return it.review && it.review.state!=='unknown' ? select+`<small class="review-src">Review: ${reviewNote(it.review)}</small>` : select;
    }
    function table(rows) {
      return `<div class="table-wrap"><table class="settings activity-table"><thead><tr><th>Kegiatan</th><th>Jadwal</th><th>PIC</th><th>Status</th><th>Aksi</th></tr></thead><tbody>${rows.map(it=>{
        const status=effectiveStatus(it.status,it.endDate);
        const note=it.section==='master' && /^Batas akhir data dari user:/.test(it.note) ? '' : it.note;
        const date=it.section==='balance' ? `Cut off ${esc(format(it.cutoffDate))} · Serah ${esc(format(it.handoverDate))} ${esc(it.handoverTime)} · Upload ${esc(format(it.uploadDate))} ${esc(it.uploadTime || '')}` : dates(it);
        return `<tr><td class="item-title"><b>${esc(it.title)}</b>${note?`<details class="item-note" ${tab==='training'?'open':''}><summary>Catatan${tab==='training'?' materi & peserta':''}</summary>${esc(note)}</details>`:''}</td><td class="item-date">${date}</td><td class="item-pic">${it.picFixed ? `<span class="pic-fixed" title="PIC kegiatan STEM terkunci; perubahan melalui editor admin">${esc(picShown(it.pic))}${company.code ? ' 🔒<small>terkunci</small>' : '<small>otomatis</small>'}</span>` : picSelectHtml(it.pic, `data-pic="${esc(it.id)}" aria-label="PIC ${esc(it.title)}"`)}</td><td class="item-status">${statusCell(it,status)}</td><td class="item-action"><button class="control secondary" data-edit="${esc(it.id)}" aria-label="Ubah ${esc(it.title)}">Ubah</button><span data-chat-slot="item:${esc(it.id)}"></span></td></tr>`;
      }).join('')}</tbody></table></div>`;
    }
    if(tab==='master') {
      { const steps=items.filter(it=>it.section==='milestone').map(entryOf); html += `<h2>Garis waktu</h2><p class="legend">✓ selesai · ◐ proses · ○ belum · ! telat <abbr title="Telat: tanggal akhir sudah lewat dan status belum selesai (tanggal lokal perangkat).">ⓘ</abbr></p>${timelineHtml(steps, null, timelineTodayIndex(steps))}`; }
      html += '<h2>Milestone</h2>'+table(items.filter(it=>it.section==='milestone'));
      const deadline=all.find(it=>it.id==='deadline');
      if(deadline) html += `<p class="muted">Batas akhir data dari user: ${esc(format(deadline.endDate))}.</p>`;
      html += groupProgress(all).map(g=>`<details class="stage" data-group="${g.group}" ${matchMedia('(min-width: 601px)').matches||g.items.some(it=>effectiveStatus(it.status,it.endDate)==='telat')?'open':''}><summary><b>Tahap ${g.group}</b><span>${esc(format(g.startDate))} s/d ${esc(format(g.endDate))} · ${g.done}/${g.total} selesai</span><progress max="100" value="${g.percent}" aria-label="Progres Tahap ${g.group}">${g.percent}%</progress></summary>${table(g.items)}</details>`).join('');
    } else {
      if (tab === 'training') { const steps=items.filter(it=>it.section==='training').map(entryOf); if (steps.length > 1) html += `<h2>Garis waktu</h2><p class="legend">✓ selesai · ◐ proses · ○ belum · ! telat <abbr title="Telat: tanggal akhir sudah lewat dan status belum selesai (tanggal lokal perangkat).">ⓘ</abbr></p>${timelineHtml(steps, null, timelineTodayIndex(steps))}`; }
      html += table(items);
    }
    view.innerHTML = html; mountChatSlots(); applyAccess(); controls();
  }
  function editorName() { try { return localStorage.getItem('editor') || ''; } catch { return ''; } }
  function applyAccess() {
    if (editable) return;
    view.querySelectorAll('[data-edit]').forEach(b => b.remove());
  }
  async function loadAccess() {
    try {
      const response = await fetch('api/schedule/access', { cache: 'no-store' });
      const a = await response.json();
      if (!response.ok || typeof a.editable !== 'boolean') throw new Error('Akses admin belum diketahui');
      editable = a.editable;
      fixedPicIds = Array.isArray(a.fixedPicIds) ? a.fixedPicIds.filter(id => typeof id === 'string') : null;
      if (!editable) { const s = await (await fetch('api/setup-access', { cache: 'no-store' })).json().catch(() => ({})); lockConfigured = s.configured !== false; }
    } catch { editable = false; /* fail closed: PIC/status remain available; admin fields stay locked */ }
  }
  view.addEventListener('submit', async e => {
    if (e.target.id !== 'unlock-form') return;
    e.preventDefault(); const msg = $('#unlock-msg'), pw = $('#unlock-pw').value;
    if (!pw) { msg.textContent = 'Isi password dulu.'; return; }
    try {
      const r = await fetch('api/setup-access/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || 'Password salah.'); }
      await loadAccess(); render(); message(editable ? 'Mode admin aktif.' : '');
    } catch (ex) { msg.textContent = ex.message || 'Gagal membuka kunci.'; }
  });
  function mountChatSlots() {
    if (!chat) return;
    document.querySelectorAll('[data-chat-slot]').forEach(slot => slot.replaceWith(chat.badge(slot.dataset.chatSlot, threadTitle(slot.dataset.chatSlot), !slot.dataset.chatSlot.startsWith('item:'))));
  }
  function openEditor(id) {
    if (!editable) return;
    const it = doc.data.items.find(it=>it.id===id); if(!it) return;
    editorId = id;
    const field = (key,label,type='text') => `<label>${label}<input class="control" name="${key}" type="${type}" value="${esc(it[key])}" ${type==='date'?'required min="0001-01-01" max="9999-12-31"':'maxlength="200"'}></label>`;
    const dates = it.section==='balance' ? field('cutoffDate','Cut off','date')+field('handoverDate','Serah ke STEM','date')+field('uploadDate','Upload SAP','date')+field('handoverTime','Jam serah (HH:mm)')+field('uploadTime','Jam upload (HH:mm-HH:mm)') : field('startDate','Tanggal mulai','date')+field('endDate','Tanggal akhir','date');
    $('#editor-slot').innerHTML = `<form class="editor"><h2>Ubah ${esc(it.title)}</h2><div class="fields">${dates}${fixedCompanyPic(it.id) && !company.code ? `<div class="pic-fixed-row"><span>PIC</span><span class="pic-fixed">STEM<small>otomatis</small></span><input type="hidden" name="pic" value="STEM"></div>` : `<label>PIC${picSelectHtml(it.pic, `name="pic"`)}</label>`}<label>Status<select class="control" name="status">${['belum','proses','selesai'].map(s=>`<option ${s===it.status?'selected':''}>${s}</option>`).join('')}</select></label></div><label>Catatan<textarea class="control" name="note" maxlength="2000">${esc(it.note)}</textarea></label><div class="actions"><button class="control primary" type="submit">Terapkan ke draf</button><button class="control" type="button" id="cancel-edit">Batal</button></div><p>Setelah diterapkan, tekan Simpan perubahan untuk menyimpan ke server.</p><p id="edit-error" role="alert"></p></form>`;
    $('#cancel-edit').onclick = () => { editorId=null; render(); };
    const form = $('#editor-slot form'); form.onsubmit = e => {
      e.preventDefault(); const patch = Object.fromEntries(new FormData(form));
      if(form.querySelector('[name=pic]')?.type!=='hidden')patch.pic=form.querySelector('[name=pic]').dataset.selectedPic ?? resolvePicText(patch.pic,picUsers);
      if(it.section==='balance') {patch.startDate=patch.cutoffDate;patch.endDate=patch.uploadDate;}
      if(!validRange(patch.startDate,patch.endDate) || (it.section==='balance' && (!validRange(patch.cutoffDate,patch.handoverDate)||!validRange(patch.handoverDate,patch.uploadDate)))) { $('#edit-error').textContent='Tanggal tidak valid atau urutannya terbalik.'; return; }
      for(const key of ['handoverTime','uploadTime']) if (key in patch && patch[key] && patch[key]!=='24:00' && (!/^(?:[01]\d|2[0-3]):[0-5]\d(?:-(?:[01]\d|2[0-3]):[0-5]\d)?$/.test(patch[key]) || (patch[key].length===11 && patch[key].slice(0,5)>patch[key].slice(6)))) { $('#edit-error').textContent='Jam tidak valid. Gunakan HH:mm atau HH:mm-HH:mm berurutan.'; return; }
      Object.assign(it,patch); editorId=null; dirty=draftChanges(baseline,doc.data.items).length>0; render(); message('Perubahan ada di draf. Tekan Simpan perubahan.');
    };
    form.querySelector('input').focus(); form.scrollIntoView({block:'nearest'});
  }
  view.onchange = e => {
    const id=e.target.dataset.status||e.target.dataset.pic;
    if(!id||busy) return;
    if(editorId && !confirm('Buang isian formulir yang belum diterapkan?')) { e.target.value=doc.data.items.find(row=>row.id===id)[e.target.dataset.status?'status':'pic']; return; }
    editorId=null;
    const it=doc.data.items.find(row=>row.id===id);
    it[e.target.dataset.status?'status':'pic']=e.target.dataset.status?e.target.value:(e.target.dataset.selectedPic ?? resolvePicText(e.target.value.trim(),picUsers)).slice(0,200);
    dirty=draftChanges(baseline,doc.data.items).length>0;
    const expanded=[...view.querySelectorAll('.stage[open]')].map(el=>el.dataset.group);
    render(); view.querySelectorAll('.stage').forEach(el=>el.open=expanded.includes(el.dataset.group)||el.querySelector('.telat')!==null);
    message(dirty?'Perubahan masuk draf.':'Draf sama dengan data tersimpan.');
  };
  $('#discard').onclick=()=>{if(confirm('Batalkan semua perubahan draf?')) {doc.data.items=structuredClone(baseline);dirty=false;editorId=null;render();message('Draf dibatalkan.');}};
  view.onclick = e => { const button=e.target.closest('[data-edit]'); if(button&&!busy) { if(editorId && !confirm('Ganti kegiatan? Isian formulir yang belum diterapkan akan dibuang.')) return; openEditor(button.dataset.edit); } };
  async function request(method, body) {
    const response = await fetch('api/schedule',{method,cache:'no-store',headers:body?{'Content-Type':'application/json','X-Editor':encodeURIComponent(editorName())}:{},body:body?JSON.stringify(body):undefined});
    let payload; try { payload=await response.json(); } catch { throw new Error(`Server mengirim respons tidak valid (${response.status}).`); }
    if(!response.ok) { const error = new Error(payload.message || `Permintaan gagal (${response.status}).`); error.status=response.status; throw error; }
    if(!Number.isInteger(payload.rev)||!payload.data||!Array.isArray(payload.data.items)) throw new Error('Struktur jadwal dari server tidak valid.');
    return payload;
  }
  async function load() {
    if ((dirty||editorId) && !confirm('Buang perubahan lokal dan muat ulang dari server?')) return;
    busy=true; controls(); message('Memuat jadwal...');
    try { await loadAccess(); doc=await request('GET'); baseline=structuredClone(doc.data.items); dirty=false; conflict=false; editorId=null; render(); message(''); }
    catch(e) { message(`${e.message} Tekan Muat ulang untuk mencoba lagi.`); }
    finally { busy=false; controls(); }
  }
  $('#reload').onclick=load;
  $('#save').onclick=async()=> {
    if(editorId) {message('Terapkan atau batalkan formulir terlebih dahulu.');return;}
    if(!editorName() && draftChanges(baseline,doc.data.items).some(c=>c.fields.includes('pic'))) {
      const n=(prompt('Nama kamu (dicatat di diskusi kegiatan saat PIC diubah):')||'').trim().slice(0,60);
      if(!n) {message('Isi nama dulu supaya perubahan PIC tercatat.');return;}
      try{localStorage.setItem('editor',n);}catch{}
    }
    busy=true; controls(); message('Menyimpan jadwal...');
    try { doc.data.items.forEach(it=>{ if(fixedCompanyPic(it.id)) { if(!company.code) it.pic='STEM'; else if(!editable) it.pic=baseline.find(x=>x.id===it.id)?.pic || 'STEM'; else if(!it.pic) it.pic='STEM'; } }); doc=await request('PUT',{rev:doc.rev,data:doc.data});baseline=structuredClone(doc.data.items);dirty=false;render();message('Jadwal tersimpan.'); }
    catch(e) { if(e.status===409) conflict=true;message(e.status===409?'Konflik revisi: draf tetap di layar. Salin perubahan Anda, lalu Muat ulang dan terapkan kembali.':`${e.message} Draf tetap tersedia; coba simpan lagi.`); }
    finally {busy=false;controls();}
  };
  window.addEventListener('hashchange',()=>{ if(editorId && !confirm('Pindah tab dan buang isian formulir yang belum diterapkan?')) { history.replaceState(null,'',`#/${renderedTab}`); return; } editorId=null;render();document.body.classList.remove('nav-open');$('#menu-btn').setAttribute('aria-expanded','false'); });
  window.addEventListener('beforeunload',e=>{if(dirty||editorId){e.preventDefault();e.returnValue='';}});
  $('#menu-btn').onclick=()=>{$('#menu-btn').setAttribute('aria-expanded',document.body.classList.toggle('nav-open'));};
  $('#nav-toggle').onclick=e=>{ const collapsed=e.currentTarget.parentElement.classList.toggle('collapsed');e.currentTarget.setAttribute('aria-expanded',!collapsed); };
  $('#theme-btn').onclick=()=>{const root=document.documentElement;const dark=root.dataset.theme?root.dataset.theme==='dark':matchMedia('(prefers-color-scheme: dark)').matches;root.dataset.theme=dark?'light':'dark';try{localStorage.setItem('theme',root.dataset.theme);}catch{}};
  // Hitung ulang saat hari lokal berubah, tanpa mengganggu formulir yang sedang diisi.
  let day=todayLocal();setInterval(()=>{const next=todayLocal();if(day!==next&&!editorId){day=next;render();}},30000);
  render();load();loadPicUsers();
}
