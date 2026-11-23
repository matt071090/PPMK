// Chat ringan per thread untuk halaman Schedule (API: api/schedule/chat). Thread bebas selama cocok pola [A-Za-z0-9:_-]{1,60},
// jadi modul lain bisa memakai komponen yang sama: createChat({ threads, ... }).
// Keamanan: semua teks dari server ditulis dengan textContent (tidak pernah innerHTML).

import { companyKey } from '../company.js';
const POLL_OPEN = 6000, POLL_CLOSED = 30000;
const store = {
  get: k => { try { return localStorage.getItem(companyKey(k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(companyKey(k), v); } catch { } }
};

const SVG_NS = 'http://www.w3.org/2000/svg';
/** Ikon gelembung chat bergaya garis (stroke = warna teks), sama gaya dengan ikon lain di aplikasi. */
export function chatIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg'); svg.setAttribute('viewBox', '0 0 20 20'); svg.setAttribute('width', '16'); svg.setAttribute('height', '16'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('class', 'chat-ico');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M4.5 3.5h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5H9.2L5.8 16.4a.5.5 0 0 1-.8-.4v-2.5h-.5A1.5 1.5 0 0 1 3 12V5a1.5 1.5 0 0 1 1.5-1.5z');
  path.setAttribute('fill', 'none'); path.setAttribute('stroke', 'currentColor'); path.setAttribute('stroke-width', '1.6'); path.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(path); return svg;
}

/** "17 Nov 10:07" dari ISO UTC, waktu lokal perangkat. */
export function chatTime(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getMonth()];
  return `${d.getDate()} ${m} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const CSS = `
.chat-fab{position:fixed;right:16px;bottom:16px;z-index:60;display:flex;align-items:center;gap:8px;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--accent);background:var(--accent);color:#fff;font-weight:600;box-shadow:var(--shadow-lg)}
.chat-fab .dot{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--danger);color:#fff;font-size:12px;line-height:20px;text-align:center}
.chat-panel{position:fixed;z-index:70;right:16px;bottom:16px;width:min(380px,calc(100vw - 32px));height:min(560px,calc(100vh - 32px));display:none;flex-direction:column;background:var(--surface);color:var(--text);border:1px solid var(--border-strong);border-radius:12px;box-shadow:var(--shadow-lg);overflow:hidden}
.chat-panel.open{display:flex}
.chat-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--surface-2)}
.chat-head select{flex:1;min-width:0;min-height:40px;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);color:var(--text);padding:0 8px;font:inherit}
.chat-head button{min-width:40px;min-height:40px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text)}
.chat-msgs{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
.chat-empty{margin:auto;color:var(--muted);text-align:center;font-size:14px}
.chat-msg{max-width:88%;padding:8px 10px;border-radius:10px;background:var(--surface-2);border:1px solid var(--border);align-self:flex-start;overflow-wrap:anywhere}
.chat-msg.me{align-self:flex-end;background:var(--accent-soft);border-color:var(--accent)}
.chat-msg.sys{align-self:center;max-width:96%;background:transparent;border-style:dashed;text-align:center}
.chat-msg.sys .chat-text{font-size:13px;color:var(--text-2)}
.chat-meta{font-size:12px;color:var(--muted);margin-bottom:2px}
.chat-meta b{color:var(--text-2)}
.chat-text{white-space:pre-wrap;font-size:14px;line-height:1.45}
.chat-form{border-top:1px solid var(--border);padding:10px 12px;display:grid;gap:8px;background:var(--surface-2)}
.chat-form input,.chat-form textarea{width:100%;border:1px solid var(--border-strong);border-radius:8px;background:var(--surface);color:var(--text);padding:8px 10px;font:inherit;font-size:14px}
.chat-form textarea{min-height:56px;resize:vertical}
.chat-row{display:flex;gap:8px;align-items:center}
.chat-row .hint{flex:1;font-size:12px;color:var(--muted)}
.chat-send{min-height:40px;padding:0 16px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:#fff;font-weight:600}
.chat-send:disabled{opacity:.5}
.chat-err{color:var(--danger);font-size:12px;min-height:16px}
.chat-badge{display:inline-flex;align-items:center;gap:4px;min-height:32px;min-width:40px;justify-content:center;padding:0 8px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text-2);font-size:13px}
.chat-badge.new{border-color:var(--accent);color:var(--accent-strong);font-weight:600}
.chat-badge .chat-ico,.chat-fab .chat-ico{flex:none}
.chat-badge.new .chat-ico{color:var(--accent-strong)}
.chat-badge{gap:6px}
@media (max-width:600px){.chat-panel{right:0;bottom:0;width:100vw;height:min(78vh,100vh);border-radius:12px 12px 0 0}.chat-fab{right:12px;bottom:12px}}
`;

/**
 * createChat({ api, threads:[{id,label}], titleOf(threadId)->label })
 * -> { open(threadId), badge(threadId) -> HTMLElement tombol lencana, refreshSummary() }
 */
export function createChat({ api = 'api/schedule/chat', threads = [], titleOf = id => id,
  title = 'Diskusi Schedule', seenKey = 'sched-chat-seen' } = {}) {
  if (!document.getElementById('chat-css')) { const s = document.createElement('style'); s.id = 'chat-css'; s.textContent = CSS; document.head.appendChild(s); }
  let current = threads[0] ? threads[0].id : 'umum', lastId = 0, summary = {}, timer = null, sending = false;
  const seen = () => { try { return JSON.parse(store.get(seenKey) || '{}'); } catch { return {}; } };
  const markSeen = (t, id) => { const s = seen(); if ((s[t] || 0) < id) { s[t] = id; store.set(seenKey, JSON.stringify(s)); } };
  const name = () => store.get('editor') || '';

  const fab = el('button', 'chat-fab'); fab.type = 'button'; fab.setAttribute('aria-label', 'Buka diskusi');
  fab.append(chatIcon(), txt('Diskusi'));
  const fabDot = el('span', 'dot'); fabDot.hidden = true; fab.append(fabDot);
  const panel = el('section', 'chat-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', title);
  const head = el('div', 'chat-head'), sel = el('select'); sel.setAttribute('aria-label', 'Pilih topik diskusi');
  const closeBtn = el('button'); closeBtn.type = 'button'; closeBtn.setAttribute('aria-label', 'Tutup'); closeBtn.textContent = '✕';
  head.append(sel, closeBtn);
  const msgs = el('div', 'chat-msgs'); msgs.setAttribute('aria-live', 'polite');
  const form = el('form', 'chat-form');
  const nameIn = el('input'); nameIn.placeholder = 'Nama kamu'; nameIn.maxLength = 60; nameIn.setAttribute('aria-label', 'Nama pengirim'); nameIn.autocomplete = 'name';
  const textIn = el('textarea'); textIn.placeholder = 'Tulis pesan…'; textIn.maxLength = 1000; textIn.setAttribute('aria-label', 'Pesan');
  const row = el('div', 'chat-row'), hint = el('span', 'hint'), send = el('button', 'chat-send'); send.type = 'submit'; send.textContent = 'Kirim';
  hint.textContent = 'Enter kirim, Shift+Enter baris baru'; row.append(hint, send);
  const err = el('div', 'chat-err'); err.setAttribute('role', 'alert');
  form.append(nameIn, textIn, row, err);
  panel.append(head, msgs, form);
  document.body.append(fab, panel);

  function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
  function txt(s) { return document.createTextNode(s); }

  function fillSelect(extra) {
    const list = threads.slice(); if (extra && !list.some(t => t.id === extra)) list.push({ id: extra, label: titleOf(extra) });
    sel.textContent = '';
    for (const t of list) { const o = el('option'); o.value = t.id; o.textContent = t.label + (summary[t.id] ? ` (${summary[t.id].count})` : ''); sel.appendChild(o); }
    sel.value = current;
  }

  function draw(list, replace) {
    if (replace) { msgs.textContent = ''; lastId = 0; }
    if (replace && !list.length) { const e = el('div', 'chat-empty'); e.textContent = 'Belum ada pesan di topik ini. Mulai diskusi di bawah.'; msgs.appendChild(e); return; }
    if (list.length) { const e = msgs.querySelector('.chat-empty'); if (e) e.remove(); }
    const stick = msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 60;
    for (const m of list) {
      const box = el('div', 'chat-msg' + (m.kind === 'pic' ? ' sys' : m.editor === name() ? ' me' : ''));
      const meta = el('div', 'chat-meta'), b = el('b'); b.textContent = m.editor; meta.append(b, txt(' · ' + chatTime(m.at)));
      const t = el('div', 'chat-text'); t.textContent = m.text;
      box.append(meta, t); msgs.appendChild(box); lastId = Math.max(lastId, m.id);
    }
    if (replace || stick) msgs.scrollTop = msgs.scrollHeight;
    if (lastId) markSeen(current, lastId);
    renderDots();
  }

  async function fetchMsgs(replace) {
    const t = current;
    try {
      const r = await fetch(`${api}?thread=${encodeURIComponent(t)}&after=${replace ? 0 : lastId}`, { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const d = await r.json();
      if (t !== current) return;
      draw(d.messages || [], replace);
      err.textContent = '';
    } catch { if (replace) err.textContent = 'Chat belum bisa dimuat. Coba lagi sebentar.'; }
  }

  async function refreshSummary() {
    try {
      const r = await fetch(`${api}/summary`, { cache: 'no-store' });
      if (!r.ok) return;
      summary = (await r.json()).threads || {};
      renderDots();
    } catch { }
  }

  function renderDots() {
    const s = seen(); let total = 0;
    for (const [t, v] of Object.entries(summary)) if (v.lastId > (s[t] || 0)) total++;
    fabDot.textContent = String(total); fabDot.hidden = total === 0;
    document.querySelectorAll('[data-chat-badge]').forEach(b => paintBadge(b, b.dataset.chatBadge));
  }

  function paintBadge(b, thread) {
    const v = summary[thread], n = v ? v.count : 0, fresh = v && v.lastId > (seen()[thread] || 0);
    b.textContent = ''; b.append(chatIcon());
    const label = (b.dataset.full ? 'Diskusi ' : '') + (n || ''); if (label.trim()) { const t = document.createElement('span'); t.textContent = label.trim(); b.append(t); }
    b.classList.toggle('new', !!fresh);
    b.setAttribute('aria-label', `Diskusi ${titleOf(thread)}: ${n} pesan${fresh ? ', ada yang baru' : ''}`);
  }

  function schedule() { clearTimeout(timer); timer = setTimeout(async () => { await (panel.classList.contains('open') ? fetchMsgs(false) : null); await refreshSummary(); schedule(); }, panel.classList.contains('open') ? POLL_OPEN : POLL_CLOSED); }

  function open(thread) {
    current = thread || current;
    nameIn.value = name();
    fillSelect(current); panel.classList.add('open'); fab.hidden = true;
    fetchMsgs(true); schedule();
    setTimeout(() => (name() ? textIn : nameIn).focus(), 50);
  }
  function close() { panel.classList.remove('open'); fab.hidden = false; renderDots(); schedule(); fab.focus(); }

  fab.onclick = () => open();
  closeBtn.onclick = close;
  panel.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  sel.onchange = () => { current = sel.value; fetchMsgs(true); };
  textIn.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
  form.addEventListener('submit', async e => {
    e.preventDefault(); if (sending) return;
    const who = nameIn.value.trim(), text = textIn.value.trim();
    if (!who) { err.textContent = 'Isi nama dulu.'; nameIn.focus(); return; }
    if (!text) { err.textContent = 'Pesan masih kosong.'; return; }
    sending = true; send.disabled = true; err.textContent = '';
    try {
      const r = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ thread: current, editor: who, text }) });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || 'Gagal mengirim.'); }
      store.set('editor', who); textIn.value = '';
      await fetchMsgs(false); await refreshSummary(); fillSelect(current);
    } catch (ex) { err.textContent = ex.message || 'Gagal mengirim. Coba lagi.'; }
    finally { sending = false; send.disabled = false; textIn.focus(); }
  });

  refreshSummary().then(() => { fillSelect(); }); schedule();

  return {
    open,
    refreshSummary,
    /** Tombol lencana (ikon chat + jumlah pesan) untuk satu thread (dipasang di baris tabel). */
    badge(thread, label, full) {
      const b = el('button', 'chat-badge'); b.type = 'button'; b.dataset.chatBadge = thread; if (full) b.dataset.full = '1'; b.title = 'Diskusi: ' + (label || titleOf(thread));
      paintBadge(b, thread); b.onclick = () => open(thread); return b;
    },
    repaint: renderDots
  };
}
