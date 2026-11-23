// Menu modul di atas sidebar semua halaman: Home, Schedule, Project Check List (semua orang) + Setup & Cut Off, Tools (hanya admin).
// Admin = Setup terbuka (api/setup-access: otomatis di mode dev; di war setelah password Setup, berlaku per sesi browser).
// Submenu milik halaman tetap di bawahnya. Skrip biasa (bukan module) supaya bisa dipasang di semua halaman.
// Catatan: menyembunyikan menu hanya tampilan; kunci sebenarnya tetap di server (Setup menolak tanpa password).
(function () {
  var ICON = {
    home: '<path d="M3.5 9.5L10 4l6.5 5.5V16a1 1 0 0 1-1 1h-3.5v-4.5h-4V17H4.5a1 1 0 0 1-1-1z"/>',
    schedule: '<path d="M4 5h12v11H4zM4 8.5h12M7 3v3.5M13 3v3.5"/>',
    checklist: '<path d="M4 5.5l1.5 1.5L8 4.5M4 11l1.5 1.5L8 10M10.5 6h5.5M10.5 11.5h5.5M4 16h12"/>',
    setup: '<path d="M4 5h12M4 10h12M4 15h7M14 13l2 2 3-4"/>',
    tools: '<path d="M4 6c0-1.7 2.7-3 6-3s6 1.3 6 3-2.7 3-6 3-6-1.3-6-3zM4 6v8c0 1.7 2.7 3 6 3s6-1.3 6-3V6M4 10c0 1.7 2.7 3 6 3s6-1.3 6-3"/>',
    lock: '<path d="M6 9V7a4 4 0 0 1 8 0v2M5 9h10v8H5z"/>'
  };
  var MODS = [
    ['home', 'Home', 'home.html', 'Ringkasan semua modul', false],
    ['schedule', 'Schedule', 'schedule.html', 'Jadwal menuju Go Live', false],
    ['checklist', 'Project Check List', 'index.html#/ringkasan', 'Review konfigurasi SAP B1 per menu', false],
    ['setup', 'Setup & Cut Off', 'setup.html', 'Bandingkan data, export, upload ke SAP (admin)', true],
    ['tools', 'Tools', 'hana.html', 'Backup HANA, Count Document, RPT Editor (admin)', true]
  ];
  var KEY = 'cvppmk-access:' + location.pathname.split('/').slice(0, -1).join('/');
  function current() {
    var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (page.indexOf('home') === 0) return 'home';
    if (page.indexOf('schedule') === 0) return 'schedule';
    if (page.indexOf('setup') === 0) return 'setup';
    if (/^(hana|countdoc|rpt)/.test(page)) return 'tools';
    return 'checklist';
  }
  function svg(name) {
    return '<svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + ICON[name] + '</svg>';
  }
  function cached() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function remember(a) { try { sessionStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { } }

  // access: {unlocked, dev, configured} atau null (belum diketahui: menu admin disembunyikan)
  function render(access) {
    var aside = document.querySelector('aside.sidebar');
    if (!aside) return;
    var nav = aside.querySelector('.modnav');
    if (!nav) { nav = document.createElement('nav'); nav.className = 'modnav'; nav.setAttribute('aria-label', 'Modul'); aside.insertBefore(nav, aside.firstChild); aside.classList.add('has-modnav'); }
    var cur = current(), admin = !!(access && access.unlocked);
    var html = MODS.filter(function (m) { return !m[4] || admin || m[0] === cur; }).map(function (m) {
      var active = m[0] === cur;
      return '<a class="mod-link' + (active ? ' active' : '') + '" href="' + m[2] + '" title="' + m[3] + '"' + (active ? ' aria-current="page"' : '') + '>' + svg(m[0]) + '<span>' + m[1] + '</span></a>';
    }).join('');
    // masuk / keluar admin (tidak ditampilkan di mode dev: di sana selalu admin)
    if (access && !access.dev) {
      if (admin) html += '<button type="button" class="mod-link mod-admin" data-act="logout" title="Tutup akses Setup & Tools di browser ini">' + svg('lock') + '<span>Keluar admin</span></button>';
      else if (access.configured) html += '<a class="mod-link mod-admin" href="setup.html" title="Masukkan password Setup untuk membuka Setup & Cut Off dan Tools">' + svg('lock') + '<span>Masuk admin</span></a>';
    }
    nav.innerHTML = html;
    var out = nav.querySelector('[data-act="logout"]');
    if (out) out.onclick = function () {
      fetch('api/setup-access/logout', { method: 'POST' }).finally(function () { remember({ unlocked: false, dev: false, configured: true }); location.href = 'home.html'; });
    };
    document.documentElement.classList.toggle('is-admin', admin);
    window.dispatchEvent(new CustomEvent('cvppmk-access', { detail: access }));
  }
  function start() {
    render(cached());            // tampil segera dari status terakhir (tanpa kedip), lalu dipastikan ke server
    fetch('api/setup-access', { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (a) { if (a) { remember(a); render(a); } })
      .catch(function () { /* server tidak menjawab: tetap pakai status terakhir */ });
  }
  window.cvppmkAccess = function () { return cached(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
