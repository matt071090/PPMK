// Setup & Cut Off › Mapping Add-on: atur sub kategori, judul, tampil/tidak, dan "anggap master" (UDO Document)
// untuk tiap UDO/UDT di DB, dipakai bab 7 Addon di dokumentasi. Disimpan eksplisit (tombol Simpan) ke addon-mapping.json lewat api/addon/mapping.
import { $, $$, esc } from "../ui.js";
import { KIND, UNCAT, objTitle } from "./addon.js";

const getJson = async (url, opts) => {
  const r = await fetch(url, opts), d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || `HTTP ${r.status}`);
  return d;
};
const FILTERS = { all: "Semua", uncat: "Belum dikategorikan", off: "Tidak tampil", doc: "UDO Document" };
const pick = o => ({ cat: o.cat || "", title: o.title || "", hide: !!o.hide, master: !!o.master });
const same = (a, b) => a.cat === b.cat && a.title === b.title && a.hide === b.hide && a.master === b.master;
const shownOf = (o, m) => !m.hide && (o.kind !== "d" || m.master);

// jumlah objek tampil yang belum dikategorikan (badge di sidebar setup)
export const uncategorized = data => data.objects.filter(o => o.shown && !o.cat).length;

export function mappingPage() {
  return {
    lead: "Atur sub kategori, judul, dan tampil/tidaknya UDO/UDT di bab 7 Addon dokumentasi. Daftar dibaca dari DB company ini, mapping disimpan di <code>addon-mapping.json</code> dan ikut dibundel ke war.",
    menu: "Dokumentasi › 7 Addon",
    render: () => `<div id="am"><div class="skeleton">${"<div></div>".repeat(6)}</div></div>`,
    mount: art => mountMapping($("#am", art))
  };
}

async function mountMapping(box) {
  let data, base, draft, cats, filter = "all", q = "", newFor = null, msg = "";
  const load = async () => {
    data = await getJson("api/addon/objects");
    base = Object.fromEntries(data.objects.map(o => [o.code, pick(o)]));
    draft = JSON.parse(JSON.stringify(base));
    cats = [...data.categories];
  };
  try { await load(); } catch (e) {
    box.innerHTML = `<div class="error">Daftar add-on gagal dibaca dari DB. Coba muat ulang halaman.<br><small>${esc(e.message)}</small></div>`;
    return;
  }
  const dirty = () => data.objects.filter(o => !same(base[o.code], draft[o.code])).length;
  const visible = () => data.objects.filter(o => {
    const m = draft[o.code];
    if (filter === "uncat" && m.cat) return false;
    if (filter === "off" && shownOf(o, m)) return false;
    if (filter === "doc" && o.kind !== "d") return false;
    const t = q.toLowerCase();
    return !t || `${o.code} ${o.name} ${m.title} ${o.tables.map(x => x.name).join(" ")}`.toLowerCase().includes(t);
  }).sort((a, b) => (!!draft[a.code].cat - !!draft[b.code].cat) || a.code.localeCompare(b.code));

  const catSelect = o => {
    const v = draft[o.code].cat;
    return `<select class="am-sel${v ? "" : " unset"}" data-f="cat" aria-label="Sub kategori ${esc(o.code)}">
      <option value="">${UNCAT}</option>${cats.map(c => `<option${c === v ? " selected" : ""}>${esc(c)}</option>`).join("")}
      <option value="__new"${newFor === o.code ? " selected" : ""}>+ Kategori baru…</option></select>
      ${newFor === o.code ? `<div class="am-new"><input class="am-inp" id="am-newcat" maxlength="60" placeholder="Nama kategori, mis. Integrasi K1" aria-label="Nama kategori baru">
        <button class="cbtn primary" type="button" data-act="am-addcat">Tambah</button></div><p class="am-msg" id="am-newmsg">Kategori baru langsung bisa dipakai objek lain.</p>` : ""}`;
  };
  const sw = (o, f, lbl, on) => `<label class="am-sw"><input type="checkbox" data-f="${f}" ${on ? "checked" : ""}><span>${lbl}</span></label>`;
  const status = (o, m) => !shownOf(o, m) ? `<span class="badge">${m.hide ? "Disembunyikan" : "Tidak tampil (Document)"}</span>`
    : !m.cat ? `<span class="badge warn">Belum dikategorikan</span>` : "";
  const row = o => {
    const m = draft[o.code];
    return `<tr data-code="${esc(o.code)}" class="${m.cat ? "" : "is-new"} ${shownOf(o, m) ? "" : "is-off"} ${same(base[o.code], m) ? "" : "dirty"}">
      <td class="am-k" data-l="Kode"><b>${esc(o.code)}</b><small>${esc(o.name)}</small></td>
      <td data-l="Tipe &amp; tabel"><span class="badge">${KIND[o.kind]}</span><div class="am-tbl">${o.tables.map((t, i) => `<code>@${esc(t.name)}</code>${i ? " <span class=\"muted\">child</span>" : ""}`).join("<br>")}</div>${status(o, m)}</td>
      <td data-l="Sub kategori">${catSelect(o)}</td>
      <td data-l="Judul tampilan"><input class="am-inp" data-f="title" maxlength="120" value="${esc(m.title)}" placeholder="${esc(o.name.replace(/_/g, " "))}" aria-label="Judul tampilan ${esc(o.code)}"></td>
      <td data-l="Tampil">${sw(o, "show", "Tampil", !m.hide)}${o.kind === "d" ? sw(o, "master", "Anggap master", m.master) : `<span class="muted am-auto">Master: otomatis</span>`}</td></tr>`;
  };
  const bar = () => {
    const n = dirty();
    $("#am-bar", box).innerHTML = n ? `<span class="am-dot"></span><span class="sp">${n} perubahan belum disimpan</span>
      <button class="btn" type="button" data-act="am-cancel">Batalkan</button><button class="btn primary" type="button" data-act="am-save">Simpan mapping</button>`
      : `<span class="sp muted">${msg || "Tidak ada perubahan."}</span>`;
  };
  const drawRows = () => {
    const list = visible();
    $("#am-rows", box).innerHTML = list.map(row).join("") || `<tr><td colspan="5" class="am-none">Tidak ada objek yang cocok.</td></tr>`;
    $("#am-count", box).textContent = `${list.length} dari ${data.objects.length} objek`;
    bar();
  };
  const draw = () => {
    const all = data.objects, nUncat = all.filter(o => !draft[o.code].cat).length, nOff = all.filter(o => !shownOf(o, draft[o.code])).length;
    const cnt = { all: all.length, uncat: nUncat, off: nOff, doc: all.filter(o => o.kind === "d").length };
    box.innerHTML = !all.length
      ? `<div class="placeholder"><p style="margin:0 0 6px;font-weight:600;color:var(--text)">Belum ada objek add-on di DB company ini.</p><p style="margin:0">Mulai dari object standard dulu. Mapping bisa diatur setelah DBCreator add-on dijalankan.</p></div>`
      : `<div class="kpis"><div class="kpi"><b>${all.length}</b><span>UDO/UDT di DB</span></div><div class="kpi"><b>${all.length - nOff}</b><span>Tampil di dokumentasi</span></div>
          <div class="kpi${nUncat ? " warn" : ""}"><b>${nUncat}</b><span>Belum dikategorikan</span></div><div class="kpi"><b>${nOff}</b><span>Tidak tampil</span></div></div>
        ${data.stale.length ? `<div class="callouts"><div class="callout info"><span class="ci">i</span><div class="ct"><b>Info</b>${data.stale.length} mapping tidak ditemukan di DB company ini (${esc(data.stale.join(", "))}). Hapus kalau sudah tidak dipakai.</div>
          <button class="cbtn" type="button" data-act="am-stale">Hapus dari mapping</button></div></div>` : ""}
        <div class="toolbar"><input type="search" id="am-q" value="${esc(q)}" placeholder="Cari kode / nama / tabel…" aria-label="Cari objek"><span class="count" id="am-count"></span></div>
        <div class="am-chips">${Object.entries(FILTERS).map(([k, l]) => `<button class="chip${k === filter ? " on" : ""}" type="button" data-filter="${k}">${l} <span class="n">${cnt[k]}</span></button>`).join("")}</div>
        <div class="table-wrap"><table class="data am-table"><thead><tr><th>Kode &amp; nama DB</th><th>Tipe &amp; tabel</th><th>Sub kategori</th><th>Judul tampilan</th><th>Tampil &amp; master</th></tr></thead>
          <tbody id="am-rows"></tbody></table></div>
        <div class="am-bar" id="am-bar"></div>`;
    if (all.length) drawRows();
  };
  const save = async (body, okMsg) => {
    try {
      data = await getJson("api/addon/mapping", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      base = Object.fromEntries(data.objects.map(o => [o.code, pick(o)]));
      draft = JSON.parse(JSON.stringify(base)); cats = [...data.categories];
      msg = `${okMsg} ${new Date().toTimeString().slice(0, 5)}. Bab 7 Addon ikut berubah setelah dokumentasi dimuat ulang.`;
      newFor = null; draw();
    } catch (e) {
      $("#am-bar", box).insertAdjacentHTML("afterbegin", `<span class="am-err">Mapping gagal disimpan. ${esc(e.message)}</span>`);
    }
  };
  // mapping kode yang tidak ada di DB dipertahankan server, kecuali yang dikirim di remove
  const body = (remove = []) => ({ categories: cats, objects: draft, remove });

  box.oninput = e => {
    if (e.target.id === "am-q") { q = e.target.value; drawRows(); return; }
    const tr = e.target.closest("tr[data-code]");
    if (tr && e.target.dataset.f === "title") { draft[tr.dataset.code].title = e.target.value.trim(); tr.classList.toggle("dirty", !same(base[tr.dataset.code], draft[tr.dataset.code])); bar(); }
  };
  box.onchange = e => {
    const tr = e.target.closest("tr[data-code]"), f = e.target.dataset.f;
    if (!tr || !f || f === "title") return;
    const code = tr.dataset.code, m = draft[code];
    if (f === "cat") {
      if (e.target.value === "__new") { newFor = code; drawRows(); $("#am-newcat", box)?.focus(); return; }
      m.cat = e.target.value; newFor = null;
    } else if (f === "show") m.hide = !e.target.checked;
    else if (f === "master") m.master = e.target.checked;
    drawRows();
  };
  box.onkeydown = e => { if (e.target.id === "am-newcat" && e.key === "Enter") { e.preventDefault(); $('[data-act="am-addcat"]', box).click(); } };
  box.onclick = e => {
    const fb = e.target.closest("[data-filter]");
    if (fb) { filter = fb.dataset.filter; draw(); return; }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (act === "am-addcat") {
      const input = $("#am-newcat", box), name = input.value.trim(), m = $("#am-newmsg", box);
      const dup = cats.find(c => c.toLowerCase() === name.toLowerCase());
      if (!name || dup) { input.classList.add("err"); m.className = "am-msg err"; m.textContent = name ? `Kategori sudah ada. Pilih ${dup} dari daftar.` : "Nama kategori wajib diisi."; return input.focus(); }
      cats.push(name); cats.sort((a, b) => a.localeCompare(b)); draft[newFor].cat = name; newFor = null; drawRows();
    } else if (act === "am-cancel") { draft = JSON.parse(JSON.stringify(base)); cats = [...data.categories]; newFor = null; msg = ""; draw(); }
    else if (act === "am-save") save(body(), "Mapping disimpan");
    else if (act === "am-stale") save(body(data.stale), "Mapping yang tidak ada di DB dihapus");
  };
  draw();
}
