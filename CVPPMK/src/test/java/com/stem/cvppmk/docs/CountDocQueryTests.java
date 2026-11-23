package com.stem.cvppmk.docs;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.sql.Types;
import java.time.LocalDate;
import java.util.List;

/**
 * Tes tanpa framework (proyek ini belum punya junit di pom) dan TANPA DB. Jalankan:
 * javac -cp target/classes:<deps> -d <out> src/test/java/.../CountDocQueryTests.java ; java -cp <out>:target/classes:<deps> com.stem.cvppmk.docs.CountDocQueryTests
 * Berhenti dengan kode 1 bila ada yang gagal.
 */
public class CountDocQueryTests {
    @org.junit.jupiter.api.Test void regressionWithoutDatabase() throws Exception { main(new String[0]); }
    static int ok, bad;

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
        catch (ResponseStatusException e) { return e.getStatus().value(); }
        catch (Exception e) { return -1; }
    }

    public static void main(String[] args) throws Exception {
        catalog();
        errors();
        range();
        cells();
        store();
        System.out.println("lulus=" + ok + " gagal=" + bad);
        if (bad > 0) System.exit(1);
    }

    static void catalog() throws Exception {
        CountDocQueryCatalog c = new CountDocQueryCatalog(new ObjectMapper());
        List<CountDocQueryCatalog.Query> all = c.all();
        eq(all.size(), 71, "manifest 71 query");
        boolean allOk = true;
        for (CountDocQueryCatalog.Query q : all) {
            allOk &= q.sql.regionMatches(true, 0, "SELECT", 0, 6) && q.sql.indexOf(';') < 0 && q.sql.chars().filter(x -> x == '?').count() == 2;
            allOk &= q.displaySql.contains(":from") && q.displaySql.contains(":to") && q.displaySql.indexOf('?') < 0;
        }
        check(allOk, "semua SQL: SELECT, tanpa ;, 2 parameter, tampilan :from/:to");
        check(c.find("Vendor") != null, "find id valid");
        check(c.find("Tidak_ada") == null, "find id tak ada");
        check(c.find("x'; DROP TABLE") == null, "id asing ditolak");
        check(c.find("Vendor\u0000") == null && c.find("Vendor\n") == null, "id berkarakter kontrol ditolak");
        check(c.find("Production Order") != null, "id berspasi valid");
        check(c.find(null) == null && c.find("") == null, "id null/kosong");
        check(c.find("../objects") == null, "path traversal ditolak");
        check(status(() -> CountDocQueryCatalog.clean("x", "DELETE FROM A WHERE B > ? AND C < ?")) == -1, "bukan SELECT ditolak");
        check(status(() -> CountDocQueryCatalog.clean("x", "SELECT 1 FROM A WHERE B > ? AND C < ?; DROP TABLE A")) == -1, "titik koma ditolak");
        check(status(() -> CountDocQueryCatalog.clean("x", "SELECT 1 FROM A WHERE B > ?")) == -1, "1 parameter ditolak");
        eq(CountDocQueryCatalog.clean("x", "-- komentar\nSELECT 1 FROM A WHERE B >= ? AND B <= ?"), "SELECT 1 FROM A WHERE B >= ? AND B <= ?", "komentar dibuang");
        eq(CountDocQueryCatalog.display("SELECT 1 WHERE a >= ? AND a <= ?"), "SELECT 1 WHERE a >= :from AND a <= :to", "display");
        // manifest rusak -> gagal terlihat
        check(status(() -> new CountDocQueryCatalog(new ObjectMapper(), "countdoc-tidak-ada/").all()) == -1, "manifest hilang -> kesalahan");
    }

    static void errors() {
        eq(CountDocQueryCatalog.errorKind(new SQLException("invalid table name", "42S02", 259)), "tidak_tersedia", "HANA 259");
        eq(CountDocQueryCatalog.errorKind(new SQLException("invalid column name", "42S22", 260)), "tidak_tersedia", "HANA 260");
        eq(CountDocQueryCatalog.errorKind(new SQLTimeoutException("timeout")), "timeout", "timeout");
        eq(CountDocQueryCatalog.errorKind(new SQLException("x", "HY000", 1)), "gagal", "lainnya gagal");
    }

    static void range() {
        LocalDate today = LocalDate.of(2026, 11, 3);
        eq(CountDocQueryController.range(null, null, today)[0], LocalDate.of(2026, 11, 1), "default awal = tgl 1");
        eq(CountDocQueryController.range("", "", today)[1], today, "default akhir = hari ini");
        eq(CountDocQueryController.range("2026-01-01", "2026-02-01", today)[1], LocalDate.of(2026, 2, 1), "rentang valid");
        eq(status(() -> CountDocQueryController.range("bukan-tanggal", null, today)), 400, "format salah 400");
        eq(status(() -> CountDocQueryController.range("2026-02-01", "2026-01-01", today)), 400, "awal > akhir 400");
        eq(status(() -> CountDocQueryController.range("2024-01-01", "2026-01-01", today)), 400, "rentang > 400 hari 400");
        eq(status(() -> CountDocQueryController.range("2026-01-01'; --", "2026-01-02", today)), 400, "injeksi di tanggal 400");
    }

    static void cells() {
        eq(CountDocQueryController.cell(new java.math.BigDecimal("12.000")), 12L, "BigDecimal bulat -> long");
        eq(CountDocQueryController.cell(new java.math.BigDecimal("12.50")), 12.5, "BigDecimal pecahan -> double");
        eq(CountDocQueryController.cell(java.sql.Date.valueOf("2026-10-01")), "2026-10-01", "date ISO");
        eq(CountDocQueryController.cell(java.sql.Timestamp.valueOf("2026-10-01 08:30:15.5")), "2026-10-01 08:30:15", "timestamp");
        eq(CountDocQueryController.cell(null), null, "null");
        eq(CountDocQueryController.cell("<b>x</b>"), "<b>x</b>", "teks apa adanya (di-escape di klien)");
        eq(CountDocQueryController.columnType(Types.DECIMAL), "num", "tipe num");
        eq(CountDocQueryController.columnType(Types.DATE), "date", "tipe date");
        eq(CountDocQueryController.columnType(Types.NVARCHAR), "text", "tipe text");
    }

    static void store() throws Exception {
        Path root = Files.createTempDirectory("cdchk");
        CountDocCheckStore s = new CountDocCheckStore(root);
        check(s.all().isEmpty(), "awal kosong");
        CountDocCheckStore.Item a = s.put("Vendor", 0, "cocok", "  sudah dicek  ");
        eq(a.rev, 1, "rev 1"); eq(a.note, "sudah dicek", "catatan dirapikan"); eq(a.status, "cocok", "status");
        CountDocCheckStore.Item b = s.put("Vendor", 1, "selisih", "beda 2");
        eq(b.rev, 2, "rev naik");
        eq(status(() -> s.put("Vendor", 1, "cocok", "")), 409, "rev lama 409");
        try { s.put("Vendor", 0, "cocok", ""); } catch (CountDocCheckStore.CheckException e) { eq(e.current.rev, 2, "409 membawa item terkini"); }
        eq(status(() -> s.put("Vendor", 2, "ngawur", "")), 400, "status tak dikenal 400");
        eq(status(() -> s.put("Vendor", null, "cocok", "")), 400, "rev wajib");
        eq(status(() -> s.put("Vendor", -1, "cocok", "")), 400, "rev negatif");
        StringBuilder big = new StringBuilder();
        for (int i = 0; i <= CountDocCheckStore.MAX_NOTE; i++) big.append('x');
        eq(status(() -> s.put("Customer", 0, "cocok", big.toString())), 400, "catatan terlalu panjang 400");
        eq(s.put("Customer", 0, "belum", "a\u0000b\u0007c\nd").note, "abc\nd", "karakter kontrol dibuang");
        // persisten di berkas + tidak ada sisa .tmp
        CountDocCheckStore s2 = new CountDocCheckStore(root);
        eq(s2.all().get("Vendor").note, "beda 2", "terbaca ulang dari berkas");
        long tmp;
        try (java.util.stream.Stream<Path> st = Files.list(root.resolve("queries"))) { tmp = st.filter(p -> p.toString().endsWith(".tmp")).count(); }
        eq(tmp, 0L, "tidak ada sisa .tmp");
        // berkas rusak tidak ditimpa
        Files.write(root.resolve("queries").resolve("checks.json"), "{rusak".getBytes("UTF-8"));
        eq(status(() -> s2.put("Vendor", 0, "cocok", "")), 500, "berkas rusak -> 500");
        eq(new String(Files.readAllBytes(root.resolve("queries").resolve("checks.json")), "UTF-8"), "{rusak", "berkas rusak tidak ditimpa");
        // ukuran: banyak catatan penuh -> 413 sebelum menulis
        Path root2 = Files.createTempDirectory("cdchk2");
        CountDocCheckStore s3 = new CountDocCheckStore(root2);
        StringBuilder note = new StringBuilder();
        for (int i = 0; i < CountDocCheckStore.MAX_NOTE; i++) note.append('é');
        int code = 0;
        for (int i = 0; i < 200 && code == 0; i++) {
            final int k = i;
            int c = status(() -> s3.put("Q" + k, 0, "cocok", note.toString()));
            if (c != 0) code = c;
        }
        eq(code, 413, "batas ukuran berkas 413");
        // konkurensi: 8 thread menulis id berbeda -> semua tersimpan
        Path root3 = Files.createTempDirectory("cdchk3");
        CountDocCheckStore s4 = new CountDocCheckStore(root3);
        Thread[] th = new Thread[8];
        for (int i = 0; i < th.length; i++) {
            final int k = i;
            th[i] = new Thread(() -> { for (int j = 0; j < 5; j++) s4.put("T" + k, j, "cocok", "n" + j); });
            th[i].start();
        }
        for (Thread t : th) t.join();
        eq(s4.all().size(), 8, "konkurensi: 8 id tersimpan");
        eq(s4.all().get("T3").rev, 5, "konkurensi: rev 5");
    }
}
