package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;

import javax.servlet.ReadListener;
import javax.servlet.ServletInputStream;
import javax.servlet.http.HttpServletRequest;
import java.io.ByteArrayInputStream;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

/**
 * Tes query buatan (validator SQL, store, import, fitur-mati, controller tanpa Spring/DB). Tanpa framework, TANPA DB. Jalankan:
 * javac -cp target/classes;<deps> -d <out> src/test/java/.../CountDocCustomTests.java ; java -cp <out>;target/classes;<deps> com.stem.cvppmk.docs.CountDocCustomTests
 * Berhenti dengan kode 1 bila ada yang gagal.
 */
public class CountDocCustomTests {
    @org.junit.jupiter.api.Test void regressionWithoutDatabase() throws Exception { main(new String[0]); }
    static int ok, bad;
    static final ObjectMapper M = new ObjectMapper();

    static void check(boolean c, String name) {
        if (c) ok++; else { bad++; System.out.println("GAGAL: " + name); }
    }

    static void eq(Object a, Object b, String name) {
        boolean c = a == null ? b == null : a.equals(b);
        if (!c) System.out.println("  diharapkan <" + b + "> dapat <" + a + ">");
        check(c, name);
    }

    interface Thrower { void run() throws Exception; }

    static int status(Thrower t) {
        try { t.run(); return 0; }
        catch (CountDocCheckStore.CheckException e) { return e.status; }
        catch (CountDocCustomStore.Conflict e) { return 409; }
        catch (ResponseStatusException e) { return e.getStatus().value(); }
        catch (Exception e) { System.out.println("  pengecualian tak terduga: " + e); return -1; }
    }

    static boolean rejects(String sql) { return !CountDocSqlValidator.validate(sql).ok; }

    static boolean accepts(String sql) {
        CountDocSqlValidator.Result r = CountDocSqlValidator.validate(sql);
        if (!r.ok) System.out.println("  ditolak: " + r.message() + " <- " + sql);
        return r.ok;
    }

    public static void main(String[] args) throws Exception {
        validatorAccept();
        validatorAttacks();
        validatorUnicode();
        validatorParams();
        builtins();
        store();
        importFlow();
        controllerOff();
        controllerOn();
        System.out.println("lulus=" + ok + " gagal=" + bad);
        if (bad > 0) System.exit(1);
    }

    // ---------- validator ----------
    static void validatorAccept() {
        check(accepts("SELECT 1 FROM DUMMY"), "select sederhana");
        check(accepts("select U_NAME, COUNT(*) from OUSR where CreateDate >= :from and CreateDate <= :to group by U_NAME"), "select huruf kecil + parameter");
        check(accepts("WITH x AS (SELECT 1 AS a FROM DUMMY) SELECT a FROM x"), "WITH ... SELECT");
        check(accepts("SELECT 'a;b' FROM DUMMY"), "titik koma di dalam string boleh");
        check(accepts("SELECT 'it''s; fine' FROM DUMMY"), "string dengan '' dan ;");
        check(accepts("SELECT \"UPDATE\" FROM T"), "nama berkutip berisi kata terlarang boleh");
        check(accepts("SELECT 'DROP TABLE x' AS s FROM DUMMY"), "kata terlarang di string boleh");
        check(accepts("SELECT 1 FROM DUMMY -- komentar DROP TABLE x"), "komentar baris berisi perintah tidak ikut");
        check(accepts("SELECT 1 /* ; DROP TABLE x */ FROM DUMMY"), "komentar blok berisi perintah tidak ikut");
        check(accepts("SELECT 1 FROM A UNION ALL SELECT 2 FROM B"), "UNION ALL boleh");
        check(accepts("SELECT REPLACE(A,'x','y'), LEFT(B,2), IFNULL(C,0) FROM T"), "REPLACE fungsi boleh");
        check(accepts("SELECT a||b, 1.5*2, -3, x<>y, x!=y FROM T WHERE a>=1 AND b<=2"), "operator umum");
        check(accepts("SELECT T0.\"U_Nama Panjang\" FROM \"LIVE\".OUSR T0"), "identifier berkutip dengan spasi");
        check(accepts("SELECT * FROM OINV WHERE DocDate BETWEEN :FROM AND :To"), ":FROM/:To tidak peka huruf");
        check(accepts("SELECT 1 FROM DUMMY\n"), "baris baru di akhir");
        check(accepts("SELECT 'é ü 日本' FROM DUMMY"), "unicode biasa di string boleh");
        check(accepts("SELECT 1 FROM DUMMY -- komentar é"), "unicode di komentar boleh");
        check(accepts("SELECT T0.DocNum FROM OINV T0 WHERE T0.DocDate >= :from"), "satu parameter saja boleh");
        check(accepts("SELECT 1 FROM DUMMY"), "tanpa parameter boleh");
        CountDocSqlValidator.Result r = CountDocSqlValidator.validate("SELECT 1 /* x */ FROM DUMMY -- y\nWHERE 1=1");
        check(r.ok && !r.sql.contains("/*") && !r.sql.contains("--"), "komentar dibuang dari SQL kanonik");
    }

    static void validatorAttacks() {
        check(rejects(""), "kosong");
        check(rejects("   \n "), "spasi saja");
        check(rejects("-- hanya komentar"), "hanya komentar");
        check(rejects(null), "null");
        check(rejects("SELECT 1; DROP TABLE A"), ";DROP");
        check(rejects("SELECT 1 FROM DUMMY;"), "titik koma penutup");
        check(rejects("SELECT 1 FROM DUMMY ;SELECT 2 FROM DUMMY"), "dua statement");
        check(rejects("DROP TABLE A"), "diawali DROP");
        check(rejects("DELETE FROM A"), "diawali DELETE");
        check(rejects("UPDATE A SET B=1"), "diawali UPDATE");
        check(rejects("INSERT INTO A VALUES (1)"), "diawali INSERT");
        check(rejects("CALL PROC()"), "diawali CALL");
        check(rejects("EXEC PROC"), "diawali EXEC");
        check(rejects("EXECUTE IMMEDIATE 'x'"), "EXECUTE IMMEDIATE");
        check(rejects("MERGE INTO A USING B ON 1=1"), "MERGE");
        check(rejects("TRUNCATE TABLE A"), "TRUNCATE");
        check(rejects("GRANT SELECT ON A TO B"), "GRANT");
        check(rejects("(SELECT 1 FROM DUMMY)"), "diawali kurung");
        check(rejects("EXPLAIN PLAN FOR SELECT 1 FROM DUMMY"), "EXPLAIN PLAN");
        check(rejects("SELECT 1 /* trik */; DROP TABLE A"), "komentar /* */ lalu ;");
        check(rejects("SELECT 1 /* ; */ ; DROP TABLE A"), "; setelah komentar yang berisi ;");
        check(rejects("SELECT 1 FROM DUMMY /* tidak ditutup"), "komentar blok tidak ditutup");
        check(rejects("SELECT 1 FROM DUMMY WHERE 'abc"), "string tidak ditutup");
        check(rejects("SELECT 1 FROM \"abc"), "nama berkutip tidak ditutup");
        check(rejects("SEL/**/ECT 1 FROM DUMMY"), "kata kunci dipecah komentar");
        check(rejects("SELECT 1 FROM DUMMY WHERE 1=1 /*! DROP TABLE A */ ; "), "komentar versi + ;");
        check(rejects("SELECT 1 INTO V FROM DUMMY"), "SELECT INTO");
        check(rejects("SELECT * INTO NEWT FROM A"), "SELECT * INTO tabel baru");
        check(rejects("SELECT * FROM A FOR UPDATE"), "FOR UPDATE");
        check(rejects("SELECT * FROM A for\tupdate"), "for<tab>update");
        check(rejects("SELECT * FROM A FOR/**/UPDATE"), "FOR/**/UPDATE");
        check(rejects("SELECT * FROM A LOCK TABLE"), "LOCK");
        check(rejects("WITH x AS (SELECT 1 FROM DUMMY) DELETE FROM A"), "DELETE di dalam WITH");
        check(rejects("WITH x AS (SELECT 1 FROM DUMMY) UPDATE A SET B=1"), "UPDATE setelah WITH");
        check(rejects("WITH x AS (SELECT 1 FROM DUMMY) INSERT INTO A SELECT * FROM x"), "INSERT setelah WITH");
        check(rejects("WITH x AS (SELECT 1 FROM DUMMY)"), "WITH tanpa SELECT akhir");
        check(rejects("SELECT 1 FROM DUMMY UNION CALL P()"), "UNION CALL");
        check(rejects("SELECT 1 FROM A UNION SELECT 2 FROM B; DROP TABLE A"), "UNION lalu ;");
        check(rejects("SELECT 1 FROM A WHERE X IN (SELECT 1 FROM B) WITH HINT(NO_CS_JOIN)"), "WITH HINT di tengah");
        check(rejects("SELECT 1 FROM A WITH PARAMETERS ('x'='y')"), "WITH PARAMETERS");
        check(rejects("SELECT MY_SEQ.NEXTVAL FROM DUMMY"), "NEXTVAL mengubah sequence");
        check(rejects("SELECT DBMS_RANDOM.VALUE FROM DUMMY"), "fungsi DBMS_");
        check(rejects("SELECT SQLSCRIPT_SYNC.SLEEP_SECONDS(10) FROM DUMMY"), "SQLSCRIPT_*");
        check(rejects("SELECT XS_SOMETHING() FROM DUMMY"), "XS_*");
        check(rejects("SELECT SLEEP(10) FROM DUMMY"), "SLEEP");
        check(rejects("SELECT 1 FROM DUMMY WHERE (1=1"), "kurung tidak ditutup");
        check(rejects("SELECT 1 FROM DUMMY WHERE 1=1)"), "kurung tutup berlebih");
        check(rejects("SELECT {fn NOW()} FROM DUMMY"), "escape JDBC { }");
        check(rejects("SELECT 1 FROM DUMMY \\"), "backslash di luar string");
        check(rejects("SELECT `x` FROM DUMMY"), "backtick");
        check(rejects("SELECT 1 FROM DUMMY WHERE a = @x"), "karakter @");
        check(rejects("SELECT 1 FROM DUMMY WHERE a = ?"), "tanda ? mentah");
        check(rejects("SELECT \"\" FROM DUMMY"), "nama berkutip kosong");
        StringBuilder big = new StringBuilder("SELECT 1 FROM DUMMY WHERE ");
        while (big.length() <= CountDocSqlValidator.MAX_SQL) big.append("1=1 AND ");
        check(rejects(big.toString() + "1=1"), "melebihi batas panjang");
        check(accepts(big.substring(0, CountDocSqlValidator.MAX_SQL - 10) + "1=1"), "tepat di bawah batas panjang");
        // komentar yang menyembunyikan perintah tidak boleh bocor ke SQL kanonik
        CountDocSqlValidator.Result r = CountDocSqlValidator.validate("SELECT 1 --\nFROM DUMMY");
        check(r.ok && !r.sql.contains("--"), "komentar kosong dibuang");
        // string berisi kata terlarang tetap utuh di SQL kanonik (bukan di luar string)
        r = CountDocSqlValidator.validate("SELECT 'x; DROP' FROM DUMMY");
        check(r.ok && r.sql.contains("'x; DROP'"), "string utuh di SQL kanonik");
        // posisi kesalahan dilaporkan
        r = CountDocSqlValidator.validate("SELECT 1\nFROM DUMMY;\n");
        check(!r.ok && r.line == 2 && r.col == 11, "posisi kesalahan baris/kolom: " + r.line + ":" + r.col);
        check(rejects("SELECT 1 FROM DUMMY WHERE a = 1 -- x\n; DROP TABLE A"), "; setelah komentar baris");
        check(rejects("SELECT 1 FROM DUMMY\r;DROP TABLE A"), "; setelah CR");
        check(rejects("select 1 from dual union all drop table x"), "drop huruf kecil");
        check(rejects("SELECT 1 FROM DUMMY WHERE a = 'x' ; --"), "; di antara string dan komentar");
    }

    static void validatorUnicode() {
        check(rejects("SELECT 1 FROM DUMMY WHERE 1=1"), "NBSP di luar string");
        check(rejects("SELECT 1 FROM DUMMY　WHERE 1=1"), "spasi ideografik");
        check(rejects("SELECT 1 FROM DUMMY WHERE 1=1"), "em space");
        check(rejects("SELECT 1 FROM DUMMY； DROP TABLE A"), "titik koma lebar penuh");
        check(rejects("SELECT 1 FROM DUMMY; DROP TABLE A"), "tanda tanya Yunani (mirip ;)");
        check(rejects("SELECT 1 FROM DUMMY​WHERE 1=1"), "zero-width space di luar string");
        check(rejects("SELECT '​' FROM DUMMY"), "zero-width space di dalam string");
        check(rejects("SELECT '‮' FROM DUMMY"), "bidi override di string");
        check(rejects("SELECT 1 FROM DUMMY -- x ; DROP TABLE A"), "pemisah baris Unicode di komentar");
        check(rejects("SELECT 1 /* \u0085 */ FROM DUMMY"), "NEL di komentar blok");
        check(rejects("SELECT 1 FROM DUMMY\u0000"), "NUL");
        check(rejects("SELECT 1 FROM DUMMY\u0007"), "BEL");
        check(rejects("SELECT 1 FROM DUMMY\u000B WHERE 1=1"), "vertical tab");
        check(rejects("SELECT 1 FROM DUMMY\u000C WHERE 1=1"), "form feed");
        check(rejects("SELECT 1 FROM DUMMY﻿"), "BOM di tengah");
        check(rejects("SЕLECT 1 FROM DUMMY"), "huruf Cyrillic mirip E pada SELECT");
        check(rejects("SELECT 1 FROM DUMMY WHERE a = ‘x’"), "kutip tunggal pintar");
        check(rejects("SELECT 1 FROM DUMMY WHERE 😀"), "emoji di luar string");
        check(rejects("SELECT 1 FROM DUMMY WHERE a = 'x\u0000'"), "NUL di string");
        check(accepts("SELECT '😀' FROM DUMMY"), "emoji di dalam string boleh");
    }

    static void validatorParams() {
        CountDocSqlValidator.Result r = CountDocSqlValidator.validate("SELECT 1 FROM T WHERE d >= :from AND d <= :to AND e >= :from");
        eq(r.params, Arrays.asList("from", "to", "from"), "urutan parameter dipertahankan");
        eq(r.sql.chars().filter(c -> c == '?').count(), 3L, "tiga tanda ? sesuai jumlah dipakai");
        check(!r.sql.contains(":"), "tak ada :nama tersisa");
        r = CountDocSqlValidator.validate("SELECT ':from' AS s FROM T WHERE d >= :to");
        eq(r.params, Arrays.asList("to"), ":from di dalam string bukan parameter");
        check(r.sql.contains("':from'") && r.sql.endsWith("?"), "string berisi :from tetap teks");
        check(rejects("SELECT 1 FROM T WHERE a = :foo"), "parameter lain ditolak");
        check(rejects("SELECT 1 FROM T WHERE a = :1"), ":1 ditolak");
        check(rejects("SELECT 1 FROM T WHERE a = :fromx"), ":fromx ditolak");
        check(rejects("SELECT 1 FROM T WHERE a = ::from"), "::from ditolak");
        check(rejects("SELECT 1 FROM T WHERE a = : from"), ": from ditolak");
        check(rejects("SELECT 1 FROM T WHERE a = :"), ": saja ditolak");
        check(rejects("SELECT 1 FROM T WHERE a = ?"), "? ditolak");
        // tanpa gabung string: nilai parameter tidak pernah masuk teks SQL
        r = CountDocSqlValidator.validate("SELECT 1 FROM T WHERE d = :to");
        eq(r.sql, "SELECT 1 FROM T WHERE d = ?", "SQL kanonik hanya memuat ?");
    }

    static void builtins() throws Exception {
        List<CountDocQueryCatalog.Query> all = new CountDocQueryCatalog(new ObjectMapper()).all();
        int fail = 0;
        for (CountDocQueryCatalog.Query q : all) {
            CountDocSqlValidator.Result r = CountDocSqlValidator.validate(q.displaySql);
            if (!r.ok) { fail++; System.out.println("  bawaan ditolak validator: " + q.id + " -> " + r.message()); }
            else if (!r.params.equals(Arrays.asList("from", "to")) && !r.params.isEmpty() && r.params.size() != 2) { fail++; System.out.println("  bawaan parameter aneh: " + q.id); }
        }
        eq(fail, 0, "semua 71 SQL bawaan lolos validator (aman untuk Duplikat)");
    }

    // ---------- store ----------
    static Path tmp(String p) throws Exception { return Files.createTempDirectory(p); }

    static void store() throws Exception {
        Path root = tmp("cdcus");
        CountDocCustomStore s = new CountDocCustomStore(root);
        check(s.all().isEmpty(), "awal kosong");
        CountDocCustomStore.Item a = s.create("  Uji   satu ", " Kelompok A ", "SELECT 1 FROM DUMMY WHERE :from < :to", "catatan\r\nbaris2");
        check(CountDocCustomStore.isCustomId(a.id), "id dibuat server: " + a.id);
        eq(a.rev, 1, "rev 1"); eq(a.name, "Uji satu", "nama dirapikan"); eq(a.group, "Kelompok A", "kelompok dirapikan"); eq(a.note, "catatan\nbaris2", "catatan: CRLF -> LF");
        check(a.createdAt != null && a.updatedAt != null, "waktu terisi");
        eq(status(() -> s.create("uji SATU", "", "SELECT 2 FROM DUMMY", "")), 400, "nama kembar (peka-huruf diabaikan) 400");
        eq(status(() -> s.create("", "", "SELECT 2 FROM DUMMY", "")), 400, "nama kosong 400");
        eq(status(() -> s.create("x\u0001y", "", "SELECT 2 FROM DUMMY", "")), 400, "nama berkarakter kontrol 400");
        StringBuilder longName = new StringBuilder();
        for (int i = 0; i <= CountDocCustomStore.MAX_NAME; i++) longName.append('n');
        eq(status(() -> s.create(longName.toString(), "", "SELECT 2 FROM DUMMY", "")), 400, "nama terlalu panjang 400");
        eq(status(() -> s.create("ok2", "", "DROP TABLE A", "")), 400, "SQL tidak valid ditolak saat simpan");
        eq(status(() -> s.create("ok3", "", "SELECT 1; SELECT 2", "")), 400, "dua statement ditolak saat simpan");
        StringBuilder longNote = new StringBuilder();
        for (int i = 0; i <= CountDocCustomStore.MAX_NOTE; i++) longNote.append('c');
        eq(status(() -> s.create("ok4", "", "SELECT 2 FROM DUMMY", longNote.toString())), 400, "catatan terlalu panjang 400");
        CountDocCustomStore.Item b = s.update(a.id, 1, "Uji satu v2", "", "SELECT 3 FROM DUMMY", "");
        eq(b.rev, 2, "rev naik"); eq(b.createdAt, a.createdAt, "createdAt tetap");
        eq(status(() -> s.update(a.id, 1, "x", "", "SELECT 3 FROM DUMMY", "")), 409, "rev lama 409");
        try { s.update(a.id, 1, "x", "", "SELECT 3 FROM DUMMY", ""); } catch (CountDocCustomStore.Conflict c) { eq(c.current.rev, 2, "409 membawa item terkini"); }
        eq(status(() -> s.update(a.id, null, "x", "", "SELECT 3 FROM DUMMY", "")), 400, "rev wajib");
        eq(status(() -> s.update("custom-aaaaaaaaaaaa", 1, "x", "", "SELECT 3 FROM DUMMY", "")), 404, "id tak ada 404");
        eq(status(() -> s.update("../../etc", 1, "x", "", "SELECT 3 FROM DUMMY", "")), 404, "id berbentuk path 404");
        eq(status(() -> s.update(a.id, 2, "x", "", "DELETE FROM A", "")), 400, "update dengan SQL berbahaya ditolak");
        CountDocCustomStore.Item c2 = s.create("Dua", "", "SELECT 4 FROM DUMMY", "");
        eq(status(() -> s.update(c2.id, 1, "uji satu v2", "", "SELECT 4 FROM DUMMY", "")), 400, "update ke nama yang dipakai 400");
        check(s.update(c2.id, 1, "Dua", "G", "SELECT 5 FROM DUMMY", "").rev == 2, "update dengan nama sendiri boleh");
        // persisten, tanpa sisa .tmp
        CountDocCustomStore s2 = new CountDocCustomStore(root);
        eq(s2.all().size(), 2, "terbaca ulang dari berkas");
        eq(s2.get(a.id).sql, "SELECT 3 FROM DUMMY", "isi terbaca ulang");
        eq(s2.get("custom-zzzzzzzzzzzz"), null, "get id tak ada");
        eq(s2.get("Vendor"), null, "get id bawaan -> null");
        long tmpCount;
        try (java.util.stream.Stream<Path> st = Files.list(root.resolve("queries").resolve("custom"))) { tmpCount = st.filter(p -> p.toString().endsWith(".tmp")).count(); }
        eq(tmpCount, 0L, "tidak ada sisa .tmp");
        check(s2.delete(a.id), "hapus"); check(!s2.delete(a.id), "hapus lagi false"); check(!s2.delete("../x"), "hapus id aneh false");
        eq(s2.all().size(), 1, "tersisa 1");
        // berkas rusak tidak ditimpa
        Path f = root.resolve("queries").resolve("custom").resolve("queries.json");
        Files.write(f, "{rusak".getBytes("UTF-8"));
        eq(status(() -> s2.create("Baru", "", "SELECT 1 FROM DUMMY", "")), 500, "berkas rusak -> 500");
        eq(new String(Files.readAllBytes(f), "UTF-8"), "{rusak", "berkas rusak tidak ditimpa");
        // batas jumlah
        Path root2 = tmp("cdcus2");
        CountDocCustomStore s3 = new CountDocCustomStore(root2);
        for (int i = 0; i < CountDocCustomStore.MAX_ITEMS; i++) s3.create("Q" + i, "", "SELECT " + i + " FROM DUMMY", "");
        eq(status(() -> s3.create("Terlalu banyak", "", "SELECT 1 FROM DUMMY", "")), 413, "batas 200 query 413");
        // konkurensi
        Path root3 = tmp("cdcus3");
        CountDocCustomStore s4 = new CountDocCustomStore(root3);
        Thread[] th = new Thread[8];
        for (int i = 0; i < th.length; i++) {
            final int k = i;
            th[i] = new Thread(() -> { for (int j = 0; j < 5; j++) s4.create("T" + k + "-" + j, "", "SELECT " + j + " FROM DUMMY", ""); });
            th[i].start();
        }
        for (Thread t : th) t.join();
        eq(s4.all().size(), 40, "konkurensi: 40 query tersimpan");
        eq(new HashSet<>(ids(s4)).size(), 40, "konkurensi: id unik");
        // id bawaan tidak bentrok dengan awalan custom-
        for (CountDocQueryCatalog.Query q : new CountDocQueryCatalog(new ObjectMapper()).all()) if (CountDocCustomStore.isCustomId(q.id)) check(false, "id bawaan berbentuk id buatan: " + q.id);
        eq(CountDocCustomStore.suggestName(new HashSet<>(Arrays.asList("a", "a (2)")), "a"), "a (3)", "saran nama");
    }

    static List<String> ids(CountDocCustomStore s) {
        List<String> l = new ArrayList<>();
        for (CountDocCustomStore.Item i : s.all()) l.add(i.id);
        return l;
    }

    // ---------- impor ----------
    static JsonNode json(String s) throws Exception { return M.readTree(s); }

    static String bundle(String queries) { return "{\"format\":\"cvppmk-countdoc-queries\",\"version\":1,\"queries\":" + queries + "}"; }

    static void importFlow() throws Exception {
        // bentuk berkas
        eq(status(() -> CountDocCustomStore.checkBundle(json("[]"))), 400, "bukan objek");
        eq(status(() -> CountDocCustomStore.checkBundle(json("{\"format\":\"lain\",\"version\":1,\"queries\":[]}"))), 400, "format salah");
        eq(status(() -> CountDocCustomStore.checkBundle(json("{\"format\":\"cvppmk-countdoc-queries\",\"version\":2,\"queries\":[]}"))), 400, "versi 2 ditolak");
        eq(status(() -> CountDocCustomStore.checkBundle(json("{\"format\":\"cvppmk-countdoc-queries\",\"queries\":[]}"))), 400, "versi hilang");
        eq(status(() -> CountDocCustomStore.checkBundle(json("{\"format\":\"cvppmk-countdoc-queries\",\"version\":1,\"queries\":{}}"))), 400, "queries bukan array");
        eq(status(() -> CountDocCustomStore.checkBundle(json("{\"format\":\"cvppmk-countdoc-queries\",\"version\":1,\"queries\":[],\"evil\":1}"))), 400, "field asing di tingkat berkas");
        StringBuilder many = new StringBuilder("[");
        for (int i = 0; i <= CountDocCustomStore.MAX_IMPORT; i++) many.append(i > 0 ? "," : "").append("{}");
        many.append("]");
        eq(status(() -> CountDocCustomStore.checkBundle(json(bundle(many.toString())))), 413, "lebih dari 500 query 413");
        check(CountDocCustomStore.checkBundle(json(bundle("[]"))).isArray(), "bundle valid");

        Path root = tmp("cdimp");
        CountDocCustomStore s = new CountDocCustomStore(root);
        s.create("Sudah ada", "", "SELECT 1 FROM DUMMY", "");
        JsonNode q = CountDocCustomStore.checkBundle(json(bundle("["
                + "{\"id\":\"orang-lain-1\",\"name\":\"Baru\",\"group\":\"G\",\"sql\":\"SELECT 2 FROM DUMMY WHERE :from<:to\",\"note\":\"n\",\"check\":{\"status\":\"cocok\",\"note\":\"ok\"}},"
                + "{\"name\":\"sudah ADA\",\"sql\":\"SELECT 3 FROM DUMMY\"},"
                + "{\"name\":\"Jahat\",\"sql\":\"DROP TABLE A\"},"
                + "{\"name\":\"Titik koma\",\"sql\":\"SELECT 1; DELETE FROM A\"},"
                + "{\"name\":\"Field asing\",\"sql\":\"SELECT 1 FROM DUMMY\",\"rev\":99},"
                + "{\"name\":\"Cek aneh\",\"sql\":\"SELECT 1 FROM DUMMY\",\"check\":{\"status\":\"ngawur\"}},"
                + "{\"name\":\"Cek asing\",\"sql\":\"SELECT 1 FROM DUMMY\",\"check\":{\"status\":\"cocok\",\"x\":1}},"
                + "{\"name\":5,\"sql\":\"SELECT 1 FROM DUMMY\"},"
                + "\"bukan objek\","
                + "{\"name\":\"Baru\",\"sql\":\"SELECT 9 FROM DUMMY\"},"
                + "{\"name\":\"<img src=x onerror=alert(1)>\",\"sql\":\"SELECT 1 FROM DUMMY\"}"
                + "]")));
        List<CountDocCustomStore.Preview> pv = s.preview(q);
        eq(pv.size(), 11, "pratinjau: 11 entri");
        check(pv.get(0).ok && !pv.get(0).conflict && pv.get(0).hasCheck, "entri 0 valid, ada status cek");
        check(pv.get(1).ok && pv.get(1).conflict && "sudah ADA (2)".equals(pv.get(1).suggested), "entri 1 bentrok nama (tak peka huruf) + saran: " + pv.get(1).suggested);
        check(!pv.get(2).ok && pv.get(2).error.contains("SELECT"), "entri 2 SQL jahat ditolak: " + pv.get(2).error);
        check(!pv.get(3).ok, "entri 3 titik koma ditolak");
        check(!pv.get(4).ok && pv.get(4).error.contains("asing"), "entri 4 field asing ditolak: " + pv.get(4).error);
        check(!pv.get(5).ok, "entri 5 status cek tak dikenal");
        check(!pv.get(6).ok && pv.get(6).error.contains("asing"), "entri 6 field asing di check");
        check(!pv.get(7).ok, "entri 7 nama bukan teks");
        check(!pv.get(8).ok, "entri 8 bukan objek");
        check(pv.get(9).ok && pv.get(9).conflict, "entri 9 bentrok dengan entri 0 di berkas yang sama");
        check(pv.get(10).ok && !pv.get(10).conflict && pv.get(10).name.contains("<img"), "entri 10 nama HTML apa adanya (di-escape klien)");
        eq(s.all().size(), 1, "pratinjau tidak menulis apa pun");

        // commit: ID dibuat ulang; validasi ulang walau pratinjau bilang ok
        List<CountDocCustomStore.Entry> es = new ArrayList<>();
        List<String> errs = new ArrayList<>();
        String commit = "["
                + "{\"index\":0,\"action\":\"import\",\"id\":\"orang-lain-1\",\"name\":\"Baru\",\"group\":\"G\",\"sql\":\"SELECT 2 FROM DUMMY WHERE :from<:to\",\"check\":{\"status\":\"cocok\"}},"
                + "{\"index\":1,\"action\":\"import\",\"name\":\"Sudah ada\",\"sql\":\"SELECT 3 FROM DUMMY\"},"
                + "{\"index\":2,\"action\":\"import\",\"name\":\"Jahat\",\"sql\":\"DROP TABLE A\"},"
                + "{\"index\":3,\"action\":\"skip\",\"name\":\"Dilewati\",\"sql\":\"SELECT 1 FROM DUMMY\"},"
                + "{\"index\":4,\"action\":\"import\",\"name\":\"Sudah ada (2)\",\"sql\":\"SELECT 3 FROM DUMMY\"},"
                + "{\"index\":5,\"action\":\"hapus\",\"name\":\"x\",\"sql\":\"SELECT 1 FROM DUMMY\"},"
                + "{\"index\":6,\"action\":\"import\",\"name\":\"Baru\",\"sql\":\"SELECT 7 FROM DUMMY\"}"
                + "]";
        for (JsonNode n : json("{\"e\":" + commit + "}").get("e")) {
            try { es.add(CountDocCustomStore.parseEntry(n, true)); errs.add(null); }
            catch (CountDocCheckStore.CheckException e) { es.add(null); errs.add(e.getMessage()); }
        }
        List<CountDocCustomStore.Outcome> out = s.importEntries(es, errs);
        check(out.get(0).ok && CountDocCustomStore.isCustomId(out.get(0).id) && !out.get(0).id.equals("orang-lain-1"), "id dibuat ulang: " + out.get(0).id);
        check(!out.get(1).ok && out.get(1).error.contains("dipakai"), "bentrok saat commit gagal: " + out.get(1).error);
        check(!out.get(2).ok, "SQL jahat ditolak saat commit walau klien bilang import");
        check(out.get(3).skipped, "skip dilewati");
        check(out.get(4).ok, "nama baru hasil ganti nama masuk");
        check(!out.get(5).ok && out.get(5).error.contains("Aksi"), "aksi aneh ditolak: " + out.get(5).error);
        check(!out.get(6).ok, "nama sama dengan entri 0 yang baru masuk ditolak");
        eq(s.all().size(), 3, "tersimpan: 1 lama + 2 baru");
        // batas jumlah saat impor
        Path root2 = tmp("cdimp2");
        CountDocCustomStore s2 = new CountDocCustomStore(root2);
        for (int i = 0; i < CountDocCustomStore.MAX_ITEMS - 1; i++) s2.create("Q" + i, "", "SELECT 1 FROM DUMMY", "");
        List<CountDocCustomStore.Entry> two = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            CountDocCustomStore.Entry e = new CountDocCustomStore.Entry();
            e.name = "Imp" + i; e.sql = "SELECT 1 FROM DUMMY";
            two.add(e);
        }
        List<CountDocCustomStore.Outcome> o2 = s2.importEntries(two, Arrays.asList((String) null, null));
        check(o2.get(0).ok && !o2.get(1).ok, "impor berhenti di batas 200 (entri kedua gagal)");
    }

    // ---------- controller tanpa Spring / DB ----------
    static HttpServletRequest req(String contentType, String body) {
        final byte[] data = body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8);
        return (HttpServletRequest) Proxy.newProxyInstance(CountDocCustomTests.class.getClassLoader(), new Class<?>[]{HttpServletRequest.class}, (p, m, a) -> {
            switch (m.getName()) {
                case "getContentType": return contentType;
                case "getContentLengthLong": return (long) data.length;
                case "getRemoteAddr": return "127.0.0.1";
                case "getInputStream":
                    final ByteArrayInputStream in = new ByteArrayInputStream(data);
                    return new ServletInputStream() {
                        public int read() { return in.read(); }
                        public int read(byte[] b, int o, int l) { return in.read(b, o, l); }
                        public boolean isFinished() { return in.available() == 0; }
                        public boolean isReady() { return true; }
                        public void setReadListener(ReadListener r) { }
                    };
                default: return null;
            }
        });
    }

    static HttpServletRequest json(String body, boolean dummy) { return req("application/json; charset=UTF-8", body); }

    static CountDocQueryController ctl(Path root, boolean customEnabled) throws Exception {
        return new CountDocQueryController(null, new CountDocQueryCatalog(new ObjectMapper()), new CountDocCheckStore(root), new CountDocCustomStore(root), null, true, customEnabled, 60, 5000);
    }

    @SuppressWarnings("unchecked")
    static Map<String, CountDocCheckStore.Item> checksOf(CountDocQueryController c) {
        return (Map<String, CountDocCheckStore.Item>) c.checksAll().getBody().get("checks");
    }

    @SuppressWarnings("unchecked")
    static Map<String, Object> body(ResponseEntity<?> r) { return (Map<String, Object>) r.getBody(); }

    static void controllerOff() throws Exception {
        Path root = tmp("cdoff");
        // pastikan ada isi di penyimpanan, supaya terbukti tidak ikut tampil saat fitur mati
        new CountDocCustomStore(root).create("Tersimpan", "", "SELECT 1 FROM DUMMY", "");
        CountDocQueryController c = ctl(root, false);
        HttpServletRequest r = json("{\"name\":\"x\",\"sql\":\"SELECT 1 FROM DUMMY\"}", true);
        eq(status(() -> c.customCreate(r)), 403, "fitur mati: tambah ditolak 403");
        eq(status(() -> c.customUpdate("custom-aaaaaaaaaaaa", r)), 403, "fitur mati: ubah ditolak 403");
        eq(status(() -> c.customDelete("custom-aaaaaaaaaaaa", r)), 403, "fitur mati: hapus ditolak 403");
        eq(status(() -> c.customTest(r)), 403, "fitur mati: uji draf ditolak 403");
        eq(status(() -> c.importPreview(r)), 403, "fitur mati: pratinjau impor ditolak 403");
        eq(status(() -> c.importCommit(r)), 403, "fitur mati: impor ditolak 403");
        Map<String, String> run = new HashMap<>();
        run.put("id", new CountDocCustomStore(root).all().get(0).id);
        eq(status(() -> c.run(run, r)), 403, "fitur mati: jalankan query buatan ditolak 403");
        try { c.customCreate(r); } catch (ResponseStatusException e) { check(e.getReason().contains("countdoc.custom.enabled=true") && e.getReason().contains("SELECT-only"), "pesan 403 menjelaskan cara menyalakan + peringatan"); }
        Map<String, Object> list = body(c.queries());
        @SuppressWarnings("unchecked") List<Map<String, Object>> qs = (List<Map<String, Object>>) list.get("queries");
        eq(qs.size(), 71, "fitur mati: daftar hanya 71 bawaan");
        @SuppressWarnings("unchecked") Map<String, Object> cfg = (Map<String, Object>) list.get("customConfig");
        eq(cfg.get("enabled"), false, "customConfig.enabled=false");
        check(qs.stream().noneMatch(m -> Boolean.TRUE.equals(m.get("custom"))), "tidak ada query buatan di daftar");
        eq(status(() -> c.checksPut(run.get("id"), new HashMap<String, Object>())), 404, "fitur mati: status cek query buatan 404");
    }

    static void controllerOn() throws Exception {
        Path root = tmp("cdon");
        CountDocQueryController c = ctl(root, true);
        // tambah
        ResponseEntity<Object> cr = c.customCreate(json("{\"name\":\"Uji A\",\"group\":\"G\",\"sql\":\"SELECT 1 FROM DUMMY WHERE :from < :to\",\"note\":\"n\"}", true));
        eq(cr.getStatusCodeValue(), 201, "tambah 201");
        @SuppressWarnings("unchecked") Map<String, Object> made = (Map<String, Object>) cr.getBody();
        String id = (String) made.get("id");
        check(CountDocCustomStore.isCustomId(id) && Boolean.TRUE.equals(made.get("custom")) && "Buatan saya".equals(made.get("group")), "respons tambah: id server, custom, grup");
        // tampil di daftar
        Map<String, Object> list = body(c.queries());
        @SuppressWarnings("unchecked") List<Map<String, Object>> qs = (List<Map<String, Object>>) list.get("queries");
        eq(qs.size(), 72, "daftar: 71 + 1");
        eq(qs.get(71).get("id"), id, "query buatan di akhir daftar");
        // permintaan jahat
        eq(status(() -> c.customCreate(json("{\"name\":\"B\",\"sql\":\"DROP TABLE A\"}", true))), 400, "SQL jahat ditolak di endpoint tambah");
        eq(status(() -> c.customCreate(json("{\"name\":\"B\",\"sql\":\"SELECT 1 FROM DUMMY\",\"id\":\"custom-aaaaaaaaaaaa\"}", true))), 400, "klien tidak boleh menentukan id/field asing");
        eq(status(() -> c.customCreate(json("{\"name\":\"B\",\"sql\":\"SELECT 1 FROM DUMMY\",\"name\":\"C\"}", true))), 400, "kunci JSON ganda ditolak");
        eq(status(() -> c.customCreate(json("{\"name\":\"B\",\"sql\":5}", true))), 400, "sql bukan teks");
        eq(status(() -> c.customCreate(json("{rusak", true))), 400, "JSON rusak 400");
        eq(status(() -> c.customCreate(req("text/plain", "{\"name\":\"B\",\"sql\":\"SELECT 1 FROM DUMMY\"}"))), 415, "bukan application/json 415 (pertahanan CSRF form)");
        eq(status(() -> c.customCreate(req("application/x-www-form-urlencoded", "name=B"))), 415, "form 415");
        eq(status(() -> c.customCreate(req(null, "{}"))), 415, "tanpa content-type 415");
        StringBuilder big = new StringBuilder("{\"name\":\"B\",\"sql\":\"SELECT 1 FROM DUMMY /*");
        for (int i = 0; i < CountDocQueryController.MAX_BODY; i++) big.append('x');
        big.append("*/\"}");
        eq(status(() -> c.customCreate(json(big.toString(), true))), 413, "body besar 413");
        // ubah + 409
        ResponseEntity<Object> up = c.customUpdate(id, json("{\"rev\":1,\"name\":\"Uji A2\",\"group\":\"\",\"sql\":\"SELECT 2 FROM DUMMY\",\"note\":\"\"}", true));
        eq(((Map<?, ?>) up.getBody()).get("rev"), 2, "ubah: rev 2");
        eq(status(() -> c.customUpdate(id, json("{\"rev\":1,\"name\":\"X\",\"sql\":\"SELECT 2 FROM DUMMY\"}", true))), 409, "ubah dengan rev lama 409");
        // status cek untuk query buatan, dan ikut terhapus
        c.checksPut(id, new HashMap<String, Object>() {{ put("rev", 0); put("status", "cocok"); put("note", "ok"); }});
        check(checksOf(c).containsKey(id), "status cek query buatan tersimpan");
        // jalankan: SQL tersimpan dimanipulasi di berkas -> ditolak sebelum menyentuh DB
        Path f = root.resolve("queries").resolve("custom").resolve("queries.json");
        String tampered = new String(Files.readAllBytes(f), "UTF-8").replace("SELECT 2 FROM DUMMY", "DELETE FROM OUSR");
        Files.write(f, tampered.getBytes("UTF-8"));
        Map<String, String> runBody = new HashMap<>();
        runBody.put("id", id);
        eq(status(() -> c.run(runBody, json("{}", true))), 400, "SQL tersimpan yang dirusak ditolak saat run (validasi ulang)");
        // uji draf tidak valid ditolak sebelum DB
        eq(status(() -> c.customTest(json("{\"sql\":\"SELECT 1; DROP TABLE A\"}", true))), 400, "uji draf: SQL jahat 400");
        eq(status(() -> c.customTest(json("{\"sql\":\"SELECT 1 FROM DUMMY\",\"x\":1}", true))), 400, "uji draf: field asing 400");
        // hapus
        eq(c.customDelete(id, json("{}", true)).getStatusCodeValue(), 200, "hapus 200");
        eq(status(() -> c.customDelete(id, json("{}", true))), 404, "hapus lagi 404");
        check(!checksOf(c).containsKey(id), "status cek ikut terhapus");
        // impor lewat controller
        String file = bundle("[{\"name\":\"I1\",\"sql\":\"SELECT 1 FROM DUMMY\",\"check\":{\"status\":\"selisih\",\"note\":\"beda\"}},{\"name\":\"I2\",\"sql\":\"DROP TABLE X\"}]");
        Map<String, Object> pv = body(c.importPreview(json(file, true)));
        @SuppressWarnings("unchecked") List<Map<String, Object>> pe = (List<Map<String, Object>>) pv.get("entries");
        eq(pe.get(0).get("ok"), true, "controller pratinjau: entri 0 ok");
        eq(pe.get(1).get("ok"), false, "controller pratinjau: entri 1 ditolak");
        eq(status(() -> c.importPreview(json("{\"format\":\"cvppmk-countdoc-queries\",\"version\":1,\"queries\":[],\"x\":1}", true))), 400, "controller pratinjau: field asing di berkas");
        StringBuilder huge = new StringBuilder(bundle("[{\"name\":\"H\",\"sql\":\"SELECT 1 FROM DUMMY\",\"note\":\""));
        for (int i = 0; i < CountDocQueryController.MAX_IMPORT_BODY; i++) huge.append('x');
        eq(status(() -> c.importPreview(json(huge.toString(), true))), 413, "berkas impor > 1 MB 413");
        Map<String, Object> res = body(c.importCommit(json("{\"includeChecks\":true,\"entries\":[{\"index\":0,\"action\":\"import\",\"name\":\"I1\",\"sql\":\"SELECT 1 FROM DUMMY\",\"check\":{\"status\":\"selisih\",\"note\":\"beda\"}},{\"index\":1,\"action\":\"import\",\"name\":\"I2\",\"sql\":\"DROP TABLE X\"}]}", true)));
        eq(res.get("imported"), 1, "controller impor: 1 masuk"); eq(res.get("failed"), 1, "controller impor: 1 gagal");
        String newId = (String) ((Map<?, ?>) ((List<?>) res.get("results")).get(0)).get("id");
        eq(checksOf(c).get(newId).status, "selisih", "status cek ikut diimpor bila diminta");
        Map<String, Object> res2 = body(c.importCommit(json("{\"includeChecks\":false,\"entries\":[{\"index\":0,\"action\":\"import\",\"name\":\"I3\",\"sql\":\"SELECT 1 FROM DUMMY\",\"check\":{\"status\":\"cocok\"}}]}", true)));
        String id3 = (String) ((Map<?, ?>) ((List<?>) res2.get("results")).get(0)).get("id");
        check(!checksOf(c).containsKey(id3), "status cek tidak diimpor bila tidak diminta");
        eq(status(() -> c.importCommit(json("{\"entries\":[],\"zzz\":1}", true))), 400, "controller impor: field asing");
    }
}
