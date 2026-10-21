// 4.4 Cara breakdown SBO_SP_TransactionNotification (TN) / SBO_SP_PostTransactionNotice (POST) dari isi procedure di DB.
// Tidak bergantung pada format satu company: yang dibaca hanya pola SQLScript (dan kode lama T-SQL yang di-comment).
//
// 1. Tiap baris ditandai: kode aktif, atau di dalam komentar (/* */ atau --). Kode di dalam komentar tetap dibaca, statusnya Dimatikan.
// 2. Blok IF ... THEN / ELSEIF / ELSE / END IF (dan IF ... BEGIN ... END versi T-SQL) dilacak sebagai tumpukan.
//    Blok yang kondisinya menyebut object_type = blok object; transaction_type di blok itu atau di dalamnya = "berlaku saat".
// 3. Penjagaan = setiap error_message := '...' (selain 'Ok'). Pesan disusun dari potongan teksnya; variabel jadi {nama}.
//    Nomor & nama aturan dari penanda "-- (n)" di atasnya dan daftar "-- (n) keterangan" di atas blok object.
// 4. Proses otomatis = UPDATE / INSERT / MERGE / CALL di dalam blok object, dikelompokkan per cabang IF terluar di dalam blok object.
// 5. Kondisi = kondisi IF di antara blok object dan aturan + WHERE dari query di potongan kode aturan.

const TRANS = { A: "Add", U: "Update", D: "Delete", C: "Cancel", L: "Close" };
const NOISE_IF = /^\s*:?\(?\s*:(tmp_count|S_Doc|RowCount)\s*(<>|!=|>|<|=)\s*\d+\s*\)?\s*$/i;

// --- 1. komentar per baris ---
function markLines(lines) {
  let inBlock = false;
  return lines.map(raw => {
    let code = false, i = 0, inStr = false;
    const startBlock = inBlock;
    while (i < raw.length) {
      const c = raw[i], n = raw[i + 1];
      if (inBlock) { if (c === "*" && n === "/") { inBlock = false; i += 2; continue; } i++; continue; }
      if (inStr) { if (c === "'") inStr = false; i++; continue; }
      if (c === "/" && n === "*") { inBlock = true; i += 2; continue; }
      if (c === "-" && n === "-") break;
      if (c === "'") inStr = true;
      if (!/\s/.test(c)) code = true;
      i++;
    }
    const off = !code && raw.trim() !== "";
    // teks untuk dibaca: tanda komentar di depan dibuang
    const text = (off ? raw.replace(/^\s*(\/\*+)?/, "").replace(/^\s*-+/, "").replace(/\*\/\s*$/, "") : raw.replace(/--.*$/, "")).trim();
    return { raw, off, text, startBlock };
  });
}

const literals = s => [...s.matchAll(/N?'([^']*)'/g)].map(m => m[1]);
function typesIn(cond, key) {
  const out = [];
  const re = new RegExp(`${key}\\s*(=|IN\\b)(.*?)(?=object_type|transaction_type|\\bTHEN\\b|\\bBEGIN\\b|\\bAND\\b|$)`, "gis");
  for (const m of cond.matchAll(re)) out.push(...literals(m[2]));
  return [...new Set(out)];
}
const codeLike = t => /[:@=<>]|EXISTS/i.test(t);

// --- 3. pesan: potongan teks + variabel ---
function messageText(expr) {
  let e = expr.trim().replace(/;\s*$/, "").replace(/^N?LEFT\s*\(/i, "").replace(/,\s*\d+\s*\)\s*$/, "");
  const parts = [];
  let cur = "", inStr = false;
  for (let i = 0; i < e.length; i++) {
    const c = e[i];
    if (c === "'") { if (inStr && e[i + 1] === "'") { cur += "''"; i++; continue; } inStr = !inStr; }
    if (!inStr && c === "|" && e[i + 1] === "|") { parts.push(cur); cur = ""; i++; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts.map(p => {
    const s = p.trim(), lit = s.match(/^N?'([\s\S]*)'$/);
    if (lit) return lit[1].replace(/''/g, "'");
    const v = s.match(/[:@](\w+)/);
    return `{${v ? v[1] : s}}`;
  }).join("");
}

// WHERE ... dari query di potongan kode, tanpa baris penghubung dokumen
function wheres(seg) {
  const out = [];
  for (let i = 0; i < seg.length; i++) {
    if (!/\bWHERE\b/i.test(seg[i].text)) continue;
    let w = seg[i].text.slice(seg[i].text.search(/\bWHERE\b/i));
    for (let j = i + 1; j < seg.length && /^(AND|OR|\(|"|T\d|IFNULL|COALESCE)/i.test(seg[j].text); j++) w += " " + seg[j].text;
    w = w.replace(/\s+/g, " ").replace(/:?list_of_cols_val_tab_del/g, "[dokumen ini]").replace(/;\s*$/, "").trim();
    // baca parameter @ST_PARAM sudah tampil sebagai parameter; WHERE yang hanya menunjuk dokumen ini tidak menambah informasi
    if (/^WHERE "U_Key"\s*=/i.test(w) || /^WHERE\s+(\w+\.)?"?\w+"?\s*=\s*(\[dokumen ini\]|:\w+)$/i.test(w) || out.includes(w)) continue;
    out.push(w);
  }
  return out;
}

function header(rows, from) {
  for (let i = from; i >= 0 && i > from - 60; i--) {
    const r = rows[i].raw;
    let m = r.match(/\/\*=+\s*(.*?)\s*=+\*\//) || r.match(/^\s*--={3,}\s*(.*?)\s*={3,}/);
    if (m && !/Index for searching/i.test(m[1])) return { title: m[1].replace(/\s*\[[-\d]+\]\s*/g, " ").replace(/^\[|\]$/g, "").trim(), line: i };
  }
  return null;
}

// daftar "-- (n) keterangan" di atas blok object; "-- --" / "----" di depan = ditandai dimatikan di komentar
function legend(rows, objLine) {
  const out = {};
  for (let i = objLine - 1; i >= 0 && i > objLine - 60; i--) {
    const r = rows[i].raw.trim();
    if (!r.startsWith("--")) { if (r === "") continue; break; }
    const m = r.match(/^-[-\s]*\((\w+)\)\s*(.+)$/);
    if (m) out[m[1]] = { desc: m[2].trim(), off: /^--\s*--|^-{4}/.test(r) };
  }
  return out;
}

export function parseSp(def, proc) {
  const rows = markLines(def.replace(/\r/g, "").split("\n"));
  const stack = [], rules = [], objects = new Map();
  let pending = null, seq = 0;

  const objFrame = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].objs && stack[i].objs.length) return i; return -1; };
  // transaction_type bisa dicek di blok luar (Mobile, Faktur Pajak) maupun di dalam blok object
  const transOf = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].trans && stack[i].trans.length) return stack[i].trans; return []; };
  const done = end => stack.forEach(f => { f.lastEnd = Math.max(f.lastEnd, end); });
  const condsBetween = fi => stack.slice(fi + 1).map(f => f.cond).filter(Boolean);
  function setCond(f, cond, line, branch) {
    f.cond = cleanCond(cond); f.line = f.line ?? line; f.branchLine = line; f.branch = branch;
    f.objs = typesIn(cond, "object_type"); f.trans = typesIn(cond, "transaction_type").map(t => TRANS[t] || t);
  }
  const push = (cond, line, kind = "if") => { const f = { id: ++seq, kind, lastEnd: line }; setCond(f, cond, line, 0); stack.push(f); onObject(f); };
  function onObject(f) {
    if (!f.objs.length) return;
    const h = header(rows, f.branchLine);
    const lg = legend(rows, f.branchLine);
    f.legend = lg; f.lastEnd = f.branchLine;
    for (const t of f.objs) {
      const o = objects.get(t) || { type: t, blocks: [] };
      o.blocks.push({ proc, title: h ? h.title : "", line: f.branchLine + 1, off: rows[f.branchLine].off });
      objects.set(t, o);
    }
  }

  rows.forEach((r, i) => {
    const t = r.text;
    if (!t) return;
    if (pending) {
      pending.cond += " " + t;
      if (/\bTHEN\b/i.test(t) || /^BEGIN\b/i.test(t)) { push(pending.cond, pending.line); pending = null; }
      else if (i - pending.line > 15) pending = null;
      return;
    }
    if (/^ELSE\s*IF\b/i.test(t) && stack.length) {
      const f = stack[stack.length - 1]; setCond(f, t, i, f.branch + 1); f.lastEnd = i; onObject(f); return;
    }
    if (/^ELSE\s*;?$/i.test(t) && stack.length) {
      const f = stack[stack.length - 1]; const was = f.cond; setCond(f, "", i, f.branch + 1); f.cond = was ? `selain: ${was}` : ""; f.lastEnd = i; return;
    }
    if (/^IF\b/i.test(t) && (!r.off || codeLike(t))) {
      if (/\bTHEN\b/i.test(t)) push(t, i); else pending = { cond: t, line: i };
      return;
    }
    if (/^END\s*IF\b/i.test(t) || /^END\s*;?$/i.test(t)) { stack.pop(); return; }
    if (/^BEGIN\b/i.test(t)) { push("", i, "block"); return; }

    const fi = objFrame();
    if (fi < 0) return;
    const F = stack[fi];

    // --- penjagaan ---
    const em = t.match(/@?error_message\s*:?=\s*(.*)$/i);
    if (em) {
      let expr = em[1];
      for (let j = i + 1; !/;\s*$/.test(expr) && /:=/.test(r.text) && j < rows.length && /^\|\|/.test(rows[j].text); j++) expr += " " + rows[j].text;
      const msg = messageText(expr);
      if (/^ok$/i.test(msg)) return;
      const [start, no] = marker(F, i);
      let end = i;
      for (let j = i + 1; j < rows.length && j < i + 40; j++) {
        if (/^(ELSE\s*IF\b|ELSE\s*;?$)/i.test(rows[j].text)) { end = j - 1; break; }
        if (/^END\s*IF\b|^END\s*;?$/i.test(rows[j].text)) { end = j; break; }
      }
      rules.push(rule("val", F, fi, start, end, i, { msg, no }));
      done(end);
      return;
    }

    // --- proses otomatis ---
    if (/^(UPDATE|INSERT\s+INTO|MERGE\s+INTO|CALL)\b/i.test(t)) {
      // kelompok = cabang IF terdalam di dalam blok object yang punya kondisi sendiri
      // (bukan sekadar cek transaction_type / error / hasil query :tmp_count, yang IF/ELSE-nya satu langkah yang sama)
      let gi = -1;
      for (let k = stack.length - 1; k > fi; k--) {
        const c = stripTrans(stack[k].cond).replace(/^selain:\s*/, "");
        if (stack[k].kind === "if" && c && !NOISE_IF.test(c)) { gi = k; break; }
      }
      const G = gi > 0 ? stack[gi] : null;
      const key = G ? `${G.id}.${G.branch}` : `s${i}`;
      let stmt = t;
      for (let j = i + 1; !/;\s*$/.test(stmt) && j < rows.length && j < i + 8; j++) stmt += " " + rows[j].text;
      stmt = stmt.replace(/\s+/g, " ").replace(/:?list_of_cols_val_tab_del/g, "[dokumen ini]");
      // komentar biasa yang kebetulan diawali "UPDATE ..." bukan statement
      if (!/^(UPDATE\s+[\w"@.]+(\s+\w+)?\s+SET\b|INSERT\s+INTO\s+[\w"@.]+|MERGE\s+INTO\s+\S+|CALL\s+[\w"@.]+\s*\()/i.test(stmt)) return;
      const last = rules[rules.length - 1];
      const end = endOf(i);
      if (last && last.kind === "proc" && last.key === key) { last.stmts.push(stmt); last.end = end + 1; last.code = codeOf(last.start - 1, end); done(end); return; }
      const [start, no] = G && G.branch > 0 ? [G.branchLine, null] : marker(F, i);
      rules.push(rule("proc", F, fi, start, end, i, { key, stmts: [stmt], no }));
      done(end);
    }
  });

  // awal potongan kode aturan: penanda "-- (n)" terdekat di atasnya, kalau tidak ada: setelah aturan sebelumnya
  function marker(F, i) {
    const lo = Math.max(F.lastEnd + 1, F.branchLine + 1);
    for (let j = i - 1; j >= lo; j--) { const m = rows[j].text.match(/^\((\w+)\)\s*$/); if (m) return [j, m[1]]; }
    return [lo, null];
  }
  function endOf(i) { for (let j = i; j < rows.length && j < i + 40; j++) if (/;\s*$/.test(rows[j].text)) return j; return i; }
  function codeOf(a, b) { return rows.slice(a, b + 1).map(r => r.raw).join("\n"); }
  function rule(kind, F, fi, start, end, at, extra) {
    const seg = rows.slice(start, end + 1);
    const lg = F.legend || {}, no = extra.no;
    const vars = {};
    // param @ST_PARAM: di potongan kode, atau dibaca di awal blok object lalu dipakai di potongan kode
    rows.slice(F.branchLine, end + 1).forEach(r => {
      const m = r.text.match(/INTO\s+(\w+)\s+FROM\s+"@ST_PARAM"\s+WHERE\s+"U_Key"\s*=\s*'(\w+)'/i) || r.text.match(/"U_Key"\s*=\s*'(\w+)'/i);
      if (m) m.length === 3 ? vars[m[2]] = m[1] : vars[m[1]] = "";
    });
    const segText = seg.map(r => r.text).join("\n");
    const params = Object.keys(vars).filter(k => !vars[k] || segText.includes(vars[k]) || seg.some(r => r.text.includes(`'${k}'`)));
    return {
      kind, proc, types: F.objs, when: transOf(), line: at + 1, start: start + 1, end: end + 1, off: rows[at].off, no,
      name: no && lg[no] ? lg[no].desc : null, legendOff: no && lg[no] ? lg[no].off : null,
      conds: [...condsBetween(fi).map(stripTrans).filter(c => c && !NOISE_IF.test(c.replace(/^selain:\s*/, ""))), ...wheres(seg)],
      params, code: codeOf(start, end), ...extra
    };
  }
  return { objects: [...objects.values()], rules };
}

function cleanCond(c) {
  return c.replace(/^\s*(ELSE\s*IF|IF)\s*/i, "").replace(/\s*\b(THEN|BEGIN)\b\s*$/i, "").replace(/\s+/g, " ").trim();
}
// buang bagian object_type / transaction_type / :error = 0 dari kondisi (sudah tampil sebagai object & "berlaku saat")
function stripTrans(c) {
  if (!c) return "";
  let s = c.replace(/:?@?error\s*=\s*0\s*(AND\s*)?/i, "")
    .replace(/\(?\s*[:@]?(object_type|transaction_type)\s*(=|IN)\s*\(?\s*(N?'[^']*'\s*,?\s*)+\)?\s*\)?/gi, "")
    .replace(/\(\s*((OR|AND)\s*)*\)/gi, "").replace(/^\s*((AND|OR)\s+)+|\s+((AND|OR)\s*)+$/gi, "").trim();
  if (/^\(?\s*\)?$/.test(s) || /^(AND|OR)$/i.test(s)) return "";
  return s;
}
