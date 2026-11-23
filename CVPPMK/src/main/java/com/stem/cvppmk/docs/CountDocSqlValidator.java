package com.stem.cvppmk.docs;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Validator SQL query buatan Count Document (Tahap B). Tokenizer sendiri, bukan sekadar regex awal.
 * Aturan (semua dicek di luar string/identifier berkutip; komentar dibuang dan TIDAK ikut dieksekusi):
 * <ul>
 *   <li>hanya SATU statement: diawali SELECT atau WITH ... SELECT; tanda ';' di luar string ditolak (juga ';' penutup)</li>
 *   <li>kata kunci tulis/DDL/DCL/kontrol (INSERT, UPDATE, DELETE, DROP, CALL, EXEC, INTO, ...) ditolak, termasuk "FOR UPDATE"</li>
 *   <li>fungsi/objek berbahaya (NEXTVAL, SLEEP, DBMS_*, XS_*, SQLSCRIPT_*) ditolak</li>
 *   <li>di luar string/komentar hanya ASCII yang boleh (spasi NBSP, titik koma Yunani/lebar penuh, dll. ditolak); di dalam string/komentar
 *       karakter kontrol, karakter format (zero-width, bidi) dan pemisah baris Unicode ditolak</li>
 *   <li>parameter hanya :from dan :to, diganti '?' dan dicatat urutannya; '?' mentah atau :nama lain ditolak; tanpa gabung string</li>
 *   <li>kurung harus seimbang; panjang maksimum {@link #MAX_SQL} karakter</li>
 * </ul>
 * Hasil {@link Result#sql} adalah teks kanonik yang dieksekusi (tanpa komentar, dengan '?'); jangan pernah mengeksekusi teks asli.
 */
public final class CountDocSqlValidator {
    public static final int MAX_SQL = 20000;

    private static final Set<String> BANNED = Collections.unmodifiableSet(new HashSet<>(Arrays.asList(
            "INSERT", "UPDATE", "DELETE", "MERGE", "UPSERT", "TRUNCATE", "CREATE", "DROP", "ALTER", "RENAME",
            "GRANT", "REVOKE", "CALL", "EXEC", "EXECUTE", "INTO", "COMMIT", "ROLLBACK", "SAVEPOINT", "BEGIN",
            "LOCK", "UNLOCK", "SET", "EXPORT", "IMPORT", "LOAD", "UNLOAD", "BACKUP", "RECOVER", "CONNECT",
            "DECLARE", "PREPARE", "DEALLOCATE", "REFRESH", "RESET", "HINT", "PARAMETERS",
            "NEXTVAL", "SLEEP")));
    private static final String[] BANNED_PREFIX = {"DBMS_", "XS_", "SQLSCRIPT_"};
    private static final String PUNCT = ",.*+-/%=<>!|()";

    public static final class Result {
        public final boolean ok;
        public final String error;
        public final int line, col;
        /** SQL kanonik untuk dieksekusi (tanda ?), null bila tidak ok. */
        public final String sql;
        /** Urutan parameter untuk di-bind: "from" / "to" per tanda ?. */
        public final List<String> params;

        Result(String sql, List<String> params) { this.ok = true; this.error = null; this.line = this.col = 0; this.sql = sql; this.params = Collections.unmodifiableList(params); }

        Result(String error, int line, int col) { this.ok = false; this.error = error; this.line = line; this.col = col; this.sql = null; this.params = Collections.<String>emptyList(); }

        /** Pesan untuk pengguna, dengan posisi bila ada. */
        public String message() { return ok ? "" : line > 0 ? error + " (baris " + line + ", kolom " + col + ")" : error; }
    }

    private CountDocSqlValidator() { }

    private static final class Fail extends Exception {
        final int pos;

        Fail(String m, int pos) { super(m); this.pos = pos; }
    }

    public static Result validate(String raw) {
        if (raw == null || raw.trim().isEmpty()) return new Result("SQL kosong.", 0, 0);
        if (raw.length() > MAX_SQL) return new Result("SQL terlalu panjang (maks " + MAX_SQL + " karakter).", 0, 0);
        try {
            return run(raw);
        } catch (Fail f) {
            int line = 1, col = 1;
            for (int i = 0; i < f.pos && i < raw.length(); i++) {
                char c = raw.charAt(i);
                if (c == '\n') { line++; col = 1; } else if (c != '\r') col++;
            }
            return new Result(f.getMessage(), line, col);
        }
    }

    /** Karakter yang tidak boleh ada di dalam string/komentar: kontrol (kecuali tab/baris baru), format, pemisah baris/paragraf Unicode. */
    private static boolean badInside(char c) {
        if (c == '\t' || c == '\n' || c == '\r') return false;
        int t = Character.getType(c);
        return t == Character.CONTROL || t == Character.FORMAT || t == Character.LINE_SEPARATOR || t == Character.PARAGRAPH_SEPARATOR
                || t == Character.UNASSIGNED || t == Character.PRIVATE_USE;
    }

    private static String show(char c) { return String.format("U+%04X", (int) c); }

    private static boolean wordStart(char c) { return c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c == '_'; }

    private static boolean wordPart(char c) { return wordStart(c) || c >= '0' && c <= '9' || c == '$' || c == '#'; }

    private static Result run(String s) throws Fail {
        int n = s.length(), i = 0, depth = 0;
        StringBuilder out = new StringBuilder(n);
        List<String> params = new ArrayList<>();
        String first = null;
        boolean topSelect = false;
        while (i < n) {
            char c = s.charAt(i);
            if (c == ' ' || c == '\t' || c == '\r' || c == '\n') { out.append(c); i++; continue; }
            if (c == '-' && i + 1 < n && s.charAt(i + 1) == '-') {
                int j = i + 2;
                while (j < n && s.charAt(j) != '\n' && s.charAt(j) != '\r') {
                    if (badInside(s.charAt(j))) throw new Fail("Karakter tidak diizinkan di komentar: " + show(s.charAt(j)), j);
                    j++;
                }
                out.append(' ');
                i = j;
                continue;
            }
            if (c == '/' && i + 1 < n && s.charAt(i + 1) == '*') {
                int end = s.indexOf("*/", i + 2);
                if (end < 0) throw new Fail("Komentar blok tidak ditutup.", i);
                for (int j = i + 2; j < end; j++)
                    if (badInside(s.charAt(j))) throw new Fail("Karakter tidak diizinkan di komentar: " + show(s.charAt(j)), j);
                out.append(' ');
                i = end + 2;
                continue;
            }
            if (c == '\'' || c == '"') {
                int j = i + 1;
                for (;;) {
                    if (j >= n) throw new Fail(c == '\'' ? "String tidak ditutup." : "Nama berkutip tidak ditutup.", i);
                    char d = s.charAt(j);
                    if (d == c) {
                        if (j + 1 < n && s.charAt(j + 1) == c) { j += 2; continue; }
                        break;
                    }
                    if (badInside(d)) throw new Fail("Karakter tidak diizinkan di dalam " + (c == '\'' ? "string" : "nama berkutip") + ": " + show(d), j);
                    j++;
                }
                if (c == '"' && j == i + 1) throw new Fail("Nama berkutip kosong.", i);
                if (first == null) throw new Fail("SQL harus diawali SELECT atau WITH.", i);
                out.append(s, i, j + 1);
                i = j + 1;
                continue;
            }
            if (wordStart(c)) {
                int j = i + 1;
                while (j < n && wordPart(s.charAt(j))) j++;
                String w = s.substring(i, j), u = w.toUpperCase(Locale.ROOT);
                if (first == null) {
                    if (!u.equals("SELECT") && !u.equals("WITH")) throw new Fail("Hanya SELECT atau WITH ... SELECT yang diizinkan.", i);
                    first = u;
                } else if (u.equals("WITH")) throw new Fail("WITH hanya boleh di awal query.", i);
                if (BANNED.contains(u)) throw new Fail("Kata kunci tidak diizinkan: " + u + (u.equals("UPDATE") ? " (termasuk FOR UPDATE)" : "") + ".", i);
                for (String p : BANNED_PREFIX) if (u.startsWith(p)) throw new Fail("Fungsi tidak diizinkan: " + w + ".", i);
                if (depth == 0 && u.equals("SELECT")) topSelect = true;
                out.append(w);
                i = j;
                continue;
            }
            if (first == null) throw new Fail("SQL harus diawali SELECT atau WITH.", i);
            if (c >= '0' && c <= '9') {
                int j = i + 1;
                while (j < n && (s.charAt(j) >= '0' && s.charAt(j) <= '9' || s.charAt(j) == '.')) j++;
                out.append(s, i, j);
                i = j;
                continue;
            }
            if (c == ':') {
                int j = i + 1;
                while (j < n && wordPart(s.charAt(j))) j++;
                String name = s.substring(i + 1, j).toLowerCase(Locale.ROOT);
                if (!name.equals("from") && !name.equals("to"))
                    throw new Fail("Parameter tidak dikenal: \"" + s.substring(i, j) + "\". Hanya :from dan :to.", i);
                params.add(name);
                out.append('?');
                i = j;
                continue;
            }
            if (c == '?') throw new Fail("Tanda ? tidak dipakai. Tulis :from atau :to.", i);
            if (c == ';') throw new Fail("Tanda titik koma tidak diizinkan (hanya satu statement).", i);
            if (c == '(') depth++;
            else if (c == ')' && --depth < 0) throw new Fail("Kurung tutup berlebih.", i);
            if (PUNCT.indexOf(c) < 0) throw new Fail(c > 126 || c < 32 ? "Karakter tidak diizinkan di luar string: " + show(c) + "." : "Karakter tidak diizinkan: '" + c + "'.", i);
            out.append(c);
            i++;
        }
        if (first == null) return new Result("SQL kosong (hanya komentar).", 0, 0);
        if (depth != 0) throw new Fail("Kurung buka tidak ditutup.", n);
        if (first.equals("WITH") && !topSelect) throw new Fail("WITH harus diikuti SELECT.", 0);
        return new Result(out.toString().trim(), params);
    }
}
