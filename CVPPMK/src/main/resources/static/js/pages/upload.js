// Bab 6: Template Upload. Excel template dibuat di browser saat tombol diklik (tidak disimpan di server),
// dropdown & kolom UDF diambil dari SAP saat itu lewat api/section/template-ref.
import { $, $$, esc, section, onMount, company } from "../ui.js";
import { TEMPLATES, refLists, downloadTemplate } from "../templates.js";

let refCache = null;   // data dropdown dipakai ulang selama halaman tidak di-refresh

async function loadRef() {
  if (!refCache) refCache = fetch("api/section/template-ref").then(async r => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || `HTTP ${r.status}`);
    const err = Object.entries(d.results).filter(([, v]) => v.error);
    if (err.length) throw new Error(err.map(([k, v]) => `${k}: ${v.error}`).join("; "));
    return refLists(d.results);
  }).catch(e => { refCache = null; throw e; });
  return refCache;
}

export const PAGES = {
  "upload-templates": {
    static: true,
    lead: "Template Excel untuk upload master data & setup via Service Layer. File dibuat saat tombol diklik, dengan dropdown (item group, tax group, branch, akun, dll.) dan kolom UDF diambil langsung dari SAP saat itu.",
    render() {
      onMount(() => {
        $$("[data-tpl]").forEach(b => b.onclick = async () => {
          const t = TEMPLATES[+b.dataset.tpl], label = b.innerHTML;
          b.disabled = true; b.textContent = "Menyiapkan…";
          try { downloadTemplate(t, await loadRef(), company.name); }
          catch (e) { alert(`Gagal membuat template: ${e.message}`); }
          finally { b.disabled = false; b.innerHTML = label; }
        });
      });
      const rows = TEMPLATES.map((t, i) => {
        const sheets = t.sheets.map(s => `${esc(s.name)} <span class="muted">(${s.fields.length}${s.udf ? " + UDF" : ""})</span>`).join(", ");
        return `<tr><td class="n">${t.no}</td><td><b>${esc(t.title)}</b><br><span class="muted mono">${esc(t.entity)}</span></td>
          <td>${sheets}</td><td><button type="button" class="xbtn" data-tpl="${i}">
          <svg width="13" height="13" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v10m0 0l-4-4m4 4l4-4M4 16h12" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>Download</button></td></tr>`;
      }).join("");
      return section("templates", "Daftar Template", `<div class="table-wrap"><table class="data">
          <thead><tr><th>No</th><th>Template</th><th>Sheet (jumlah kolom)</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`,
          { lead: "Baris 1 = label (* = wajib), baris 2 = nama field Service Layer, isi data mulai baris 3. Petunjuk tiap kolom ada di sheet Keterangan." });
    }
  }
};
