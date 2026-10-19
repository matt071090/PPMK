// Penghitung series Document Numbering untuk Farm Breeding + iFlocs, per branch per tahun.
// Mengikuti konvensi yang sudah ada di DB tujuan (dibaca 2026-10-19 dari NNM1):
//   Nama     : <huruf branch>-<4 huruf><YY>, mis. T-INGR26 (8 karakter)
//   Rentang  : YY + digit + 6 digit, mis. Trading 261000001-261999999 (digit 1=Trading, 2=Komersial, 3=Non-R)
//   Remark   : "<NAMA DOKUMEN> <Branch>", mis. "GOODS RECEIPT Trading"
// Series web iFlocs dicari ketat lewat Remark persis (objek + Remark + tahun + branch, harus tepat satu), jadi series
// untuk web dibuat BERDAMPINGAN dengan series yang sudah ada, tidak mengubahnya:
//   nama berawalan WB (WBGR, WBTO, ...), rentang memakai digit 4-6 (keluarga 1) dan 7-9 (keluarga 2) pada dokumen yang sama.
// Sumber daftar Remark: kode web iflocsbreeding (PostServiceLayerImpl, NNM1.java) dan addon Farm Breeding (BranchUtil.vb).

// fam 0 = series milik addon/UDO (digit 1-3). fam 1/2 = series web berdampingan (digit 4-6 / 7-9).
// remark: teks persis (web) atau awalan; addBranch = true menambahkan label branch di belakang (gaya konvensi tujuan).
export const FAMILIES = [
  // dokumen SAP yang dicari web iFlocs Breeding, di samping series bawaan tujuan (T-INGR26 dst.)
  { doc: "59", code: "WBGR", remark: "IFLOCS", fam: 1, why: "Goods Receipt: Statistic (web)" },
  { doc: "60", code: "WBGE", remark: "IFLOCS-EV", fam: 1, why: "Goods Issue: form Goods Issue (web)" },
  { doc: "60", code: "WBGI", remark: "IFLOCS", fam: 2, why: "Goods Issue: Statistic (web)" },
  { doc: "67", code: "WBTO", remark: "TO-IFLOCS", fam: 1, why: "Transfer Out (web dan addon, awalan TO)" },
  { doc: "67", code: "WBTI", remark: "TI-IFLOCS", fam: 2, why: "Transfer In (web dan addon, awalan TI)" },
  { doc: "15", code: "WBDO", remark: "IFLOCS", fam: 1, why: "Delivery: Harvest (web)" },
  { doc: "20", code: "WBGP", remark: "IFLOCS", fam: 1, why: "Goods Receipt PO (web)" },
  { doc: "1470000113", code: "WBPR", remark: "IFLOCS", fam: 1, why: "Purchase Request (web)" },
  // UDO transaksi Breeding: belum ada satupun di tujuan
  { doc: "STEM_MPLAN", code: "PLAN", remark: "Plan Document", addBranch: true, fam: 0, why: "Plan (addon)" },
  { doc: "STEM_MSTATISTIC", code: "STAT", remark: "IFLOCS", fam: 0, why: "Statistic (addon dan web, web mencari Remark IFLOCS)" },
  { doc: "STEM_MSETTER", code: "STO", remark: "Setter Out Document", addBranch: true, fam: 0, why: "Setter Out (addon)" },
  { doc: "STEM_MSETTERI", code: "STI", remark: "Setter In Document", addBranch: true, fam: 0, why: "Setter In (addon)" },
  { doc: "STEM_MHATCHER", code: "HTO", remark: "Hatcher Out Document", addBranch: true, fam: 0, why: "Hatcher Out (addon)" },
  { doc: "STEM_MHATCHERI", code: "HTI", remark: "Hatcher In Document", addBranch: true, fam: 0, why: "Hatcher In (addon)" },
  { doc: "STEM_MTRANSFER", code: "TFD", remark: "Transfer Document", addBranch: true, fam: 0, why: "Transfer (addon)" },
  { doc: "STEM_MSURVEY", code: "SUR", remark: "Survey Document", fam: 0, why: "Survey (web mencari Remark persis)" },
  { doc: "STEM_MAUDIT", code: "AUD", remark: "Audit Document", fam: 0, why: "Audit (web mencari Remark persis)" },
  { doc: "STEM_HARVEST", code: "HARV", remark: "IFLOCS", fam: 0, why: "Harvest (web)" }
];

// huruf & label branch dari nama di SAP ("CV-TRADING" -> T / Trading). Label khusus mengikuti Remark yang sudah dipakai tujuan.
const LABELS = { T: "Trading", K: "Komersial", N: "Non-R" };
export const branchInfo = name => {
  const base = String(name).replace(/^CV-/i, "").trim(), letter = (base[0] || "?").toUpperCase();
  return { letter, label: LABELS[letter] || base.charAt(0).toUpperCase() + base.slice(1).toLowerCase() };
};

// branches: [{ id, name }] SEMUA branch di SAP (urut), selected: id yang dipilih, indicators: nama Period Indicator di tujuan (kosong = tidak dicek)
export function generate({ from, to, branches, selected, indicators }) {
  if (branches.length > 3) throw new Error(`Skema rentang mendukung maksimal 3 branch, DB ini punya ${branches.length}.`);
  const letters = branches.map(b => branchInfo(b.name).letter);
  if (new Set(letters).size !== letters.length) throw new Error(`Huruf branch kembar (${letters.join(", ")}). Nama branch harus beda di huruf pertama.`);
  const ind = indicators && indicators.length ? new Set(indicators.map(String)) : null, rows = [];
  for (let year = from; year <= to; year++) {
    const yy = String(year % 100).padStart(2, "0");
    for (const f of FAMILIES) for (const [i, b] of branches.entries()) {
      if (!selected.has(b.id)) continue;
      const { letter, label } = branchInfo(b.name), digit = 3 * f.fam + i + 1, base = +yy * 1e7 + digit * 1e6;
      const r = {
        Document: f.doc, DocumentSubType: "--", Name: `${letter}-${f.code}${yy}`, PeriodIndicator: String(year), _Branch: b.name,
        IsManual: "tNO", InitialNumber: String(base + 1), LastNumber: String(base + 999999), Prefix: "", Suffix: "", Locked: "tNO",
        Remarks: f.addBranch ? `${f.remark} ${label}` : f.remark, _errors: []
      };
      if (ind && !ind.has(r.PeriodIndicator)) r._errors.push(`Period Indicator ${year} belum ada di tujuan`);
      rows.push(r);
    }
  }
  return rows;
}
