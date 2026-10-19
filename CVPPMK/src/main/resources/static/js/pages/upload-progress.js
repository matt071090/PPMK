// Kirim baris ke SAP per batch dengan popup progress (halaman Setup).
// Server (SetupController /upload) menerima daftar baris berapa pun dan mengirimnya ke Service Layer satu per satu, jadi
// pemecahan per batch dilakukan di sini: progress terlihat, tiap request pendek (tidak kena batas waktu), dan bisa dihentikan.
import { esc } from "../ui.js";

// post(part) -> { results: [{ok, message?}] } sejajar dengan part. Berhenti bila request gagal (status server tidak pasti) atau shouldStop().
// Mengembalikan { results (hanya baris yang dicoba), total, stopped, aborted: pesan error atau "" }.
export async function uploadInChunks(payloads, post, { chunk = 20, onProgress = () => { }, shouldStop = () => false } = {}) {
  const results = [];
  let ok = 0, fail = 0, stopped = false, aborted = "";
  for (let i = 0; i < payloads.length; i += chunk) {
    if (shouldStop()) { stopped = true; break; }
    const part = payloads.slice(i, i + chunk);
    let out;
    try {
      out = (await post(part)).results;
      if (!Array.isArray(out) || out.length !== part.length) throw new Error("jawaban server tidak lengkap");
    } catch (e) {
      aborted = e.message || String(e);
      out = part.map(() => ({ ok: false, message: `Status tidak pasti, cek di SAP sebelum mengirim ulang: ${aborted}` }));
    }
    for (const r of out) { results.push(r); if (r.ok) ok++; else fail++; }
    onProgress({ done: results.length, total: payloads.length, ok, fail });
    if (aborted) break;
  }
  return { results, total: payloads.length, stopped, aborted };
}

const mmss = s => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

// Popup progress. update({done,total,ok,fail}), isStopped(), close() (aman dipanggil berulang).
export function progressUi(title, total) {
  const back = document.createElement("div");
  back.className = "sx-prog-back";
  back.setAttribute("role", "dialog");
  back.setAttribute("aria-modal", "true");
  back.setAttribute("aria-label", "Mengirim ke SAP");
  back.innerHTML = `<div class="sx-prog"><h3>Mengirim ${esc(title)} ke SAP</h3>
    <div class="sx-prog-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
    <p class="sx-prog-n">0 dari ${total} (0%)</p><p class="sx-prog-s">Menyiapkan…</p>
    <p class="sx-prog-w">Jangan tutup atau muat ulang halaman ini selama pengiriman.</p>
    <button type="button" class="cbtn" data-stop>Hentikan setelah batch ini</button></div>`;
  document.body.appendChild(back);
  const q = s => back.querySelector(s), start = Date.now();
  let stopped = false, closed = false;
  const onLeave = e => { e.preventDefault(); e.returnValue = ""; };
  window.addEventListener("beforeunload", onLeave);
  q("[data-stop]").onclick = () => { stopped = true; q("[data-stop]").disabled = true; q("[data-stop]").textContent = "Menghentikan…"; };
  return {
    update({ done, total: t, ok, fail }) {
      const pct = t ? Math.floor(done * 100 / t) : 100, el = (Date.now() - start) / 1000;
      q(".sx-prog-bar i").style.width = pct + "%";
      q(".sx-prog-bar").setAttribute("aria-valuenow", String(pct));
      q(".sx-prog-n").textContent = `${done} dari ${t} (${pct}%)`;
      q(".sx-prog-s").textContent = `Berhasil ${ok} · Gagal ${fail} · berjalan ${mmss(el)}`
        + (done > 0 && done < t ? ` · sisa sekitar ${mmss(el / done * (t - done))}` : "");
    },
    isStopped: () => stopped,
    close() {
      if (closed) return;
      closed = true;
      window.removeEventListener("beforeunload", onLeave);
      back.remove();
    }
  };
}


// ---------- tabel hasil upload: filter (Semua / Gagal / Berhasil) + paging ----------
// Murni: kembalikan potongan baris untuk filter + halaman tertentu. filter: "semua" | "gagal" | "berhasil"
export function pageSlice(items, filter, page, size) {
  const list = filter === "gagal" ? items.filter(x => !x.ok) : filter === "berhasil" ? items.filter(x => x.ok) : items;
  const pages = Math.max(1, Math.ceil(list.length / size)), p = Math.min(Math.max(1, page), pages);
  return { rows: list.slice((p - 1) * size, p * size), total: list.length, pages, page: p, from: list.length ? (p - 1) * size + 1 : 0, to: Math.min(p * size, list.length) };
}

// items: [{ ok, action, cells: [teks...], message }], cols: judul kolom data. Bawaan membuka filter "Gagal" bila ada yang gagal.
export function resultsTable(box, items, cols, size = 25) {
  const nFail = items.filter(x => !x.ok).length, count = { semua: items.length, gagal: nFail, berhasil: items.length - nFail };
  let filter = nFail ? "gagal" : "semua", page = 1;
  const draw = () => {
    const s = pageSlice(items, filter, page, size);
    page = s.page;
    box.innerHTML = `<div class="chips" role="group" aria-label="Saring hasil">${[["semua", "Semua"], ["gagal", "Gagal"], ["berhasil", "Berhasil"]].map(([k, l]) =>
        `<button type="button" class="chip" data-f="${k}" aria-pressed="${k === filter}">${l}<b>${count[k]}</b></button>`).join("")}</div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Hasil</th><th>Aksi</th>${cols.map(c => `<th>${esc(c)}</th>`).join("")}<th>Pesan dari SAP</th></tr></thead>
      <tbody>${s.rows.map(x => `<tr><td><span class="badge ${x.ok ? "yes" : "danger"}">${x.ok ? "Berhasil" : "Gagal"}</span></td><td>${esc(x.action)}</td>${x.cells.map(c => `<td>${esc(c)}</td>`).join("")}
        <td class="sx-note">${x.ok ? "OK" : esc(x.message || "")}</td></tr>`).join("") || `<tr><td colspan="${cols.length + 3}" style="text-align:center;color:var(--muted);padding:24px">Tidak ada baris</td></tr>`}</tbody></table></div>
      ${s.pages > 1 ? `<div class="sx-pg"><button type="button" class="cbtn" data-p="-1"${s.page <= 1 ? " disabled" : ""}>‹ Sebelumnya</button>
        <span>Baris ${s.from}–${s.to} dari ${s.total} · halaman ${s.page}/${s.pages}</span>
        <button type="button" class="cbtn" data-p="1"${s.page >= s.pages ? " disabled" : ""}>Berikutnya ›</button></div>` : ""}`;
  };
  box.onclick = e => {
    const f = e.target.closest && e.target.closest("[data-f]"), p = e.target.closest && e.target.closest("[data-p]");
    if (f) { filter = f.dataset.f; page = 1; draw(); }
    else if (p && !p.disabled) { page += +p.dataset.p; draw(); }
  };
  draw();
}
