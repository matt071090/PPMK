// Shared client-side paging. Filter first; export keeps that entire filtered set.
export const PAGE_SIZES = [25, 50, 100];
export function pageSlice(rows, page = 1, size = 25) {
  size = PAGE_SIZES.includes(+size) ? +size : 25;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  page = Math.min(pages, Math.max(1, Math.trunc(+page) || 1));
  const start = (page - 1) * size;
  return { rows: rows.slice(start, start + size), page, pages, size, total: rows.length,
    from: rows.length ? start + 1 : 0, to: Math.min(start + size, rows.length) };
}
export function pagerHtml(p) {
  return `<nav class="data-pager" aria-label="Halaman tabel">
    <label>Baris per halaman <select data-page-size aria-label="Baris per halaman">${PAGE_SIZES.map(n => `<option${n === p.size ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
    <span role="status">${p.from}-${p.to} dari ${p.total}</span>
    <div><button type="button" class="cbtn" data-page-prev aria-label="Halaman sebelumnya"${p.page === 1 ? ' disabled' : ''}>Sebelumnya</button>
    <span>Halaman ${p.page} dari ${p.pages}</span>
    <button type="button" class="cbtn" data-page-next aria-label="Halaman berikutnya"${p.page === p.pages ? ' disabled' : ''}>Berikutnya</button></div></nav>`;
}
export function mountPager(box, rows, drawRows, afterDraw = () => {}) {
  let page = 1, size = 25;
  const draw = focus => {
    const p = pageSlice(rows, page, size); page = p.page;
    box.innerHTML = drawRows(p.rows) + pagerHtml(p);
    box.querySelector('[data-page-prev]').onclick = () => { page--; draw('[data-page-prev]'); };
    box.querySelector('[data-page-next]').onclick = () => { page++; draw('[data-page-next]'); };
    box.querySelector('[data-page-size]').onchange = e => { size = +e.target.value; page = 1; draw('[data-page-size]'); };
    afterDraw();
    if (focus) box.querySelector(focus)?.focus();
  };
  draw();
}
