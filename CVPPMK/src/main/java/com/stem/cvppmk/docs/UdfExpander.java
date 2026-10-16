package com.stem.cvppmk.docs;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

// Kolom UDF dinamis dari CUFD, supaya list master data ikut UDF project mana pun tanpa ubah query.
// Di file .sql tulis dua penanda (TABEL = tabel SAP, ALIAS = alias tabel itu di query), contoh:
//   SELECT ...kolom standar... /*@udf-cols OITM T0*/ FROM OITM T0 ...join standar... /*@udf-joins OITM T0*/ ORDER BY ...
/**
 * Hasilnya per UDF (urut FieldID), kolom bernama "U_&lt;AliasID&gt;":
 * - punya valid values (UFD1): "kode - deskripsi" (cukup kode kalau deskripsinya sama)
 * - link ke UDT (CUFD.RTable): "kode - Name" dari tabel @RTable
 * - tanggal: YYYY-MM-DD; lainnya apa adanya.
 * Label kolom (CUFD.Descr) dikirim ke frontend sebagai metadata "udf".
 */
@Component
public class UdfExpander {
    private static final Pattern MARK = Pattern.compile("/\\*@udf-(cols|joins)\\s+([A-Za-z0-9_@]+)\\s+([A-Za-z0-9_]+)\\s*\\*/");
    private static final Pattern SAFE = Pattern.compile("[A-Za-z0-9_]+");

    private final JdbcTemplate jdbc;

    public UdfExpander(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public static class Expanded {
        public final String sql;
        public final List<Map<String, Object>> udf;

        Expanded(String sql, List<Map<String, Object>> udf) {
            this.sql = sql;
            this.udf = udf;
        }
    }

    private static class Udf {
        int fieldId;
        String alias, label, type, rtable;
        boolean values;
        List<String> codes = new ArrayList<>();   // valid values (UFD1.FldValue), untuk cek nilai di luar valid values
    }

    public Expanded expand(String sql) {
        Matcher m = MARK.matcher(sql);
        if (!m.find()) return new Expanded(sql, Collections.<Map<String, Object>>emptyList());
        m.reset();
        Map<String, List<Udf>> cache = new HashMap<>();
        List<Map<String, Object>> meta = new ArrayList<>();
        StringBuffer out = new StringBuffer();
        while (m.find()) {
            String kind = m.group(1), table = m.group(2), a = m.group(3);
            List<Udf> list = cache.computeIfAbsent(table, this::udfs);
            StringBuilder s = new StringBuilder();
            for (Udf u : list) {
                String col = a + ".\"U_" + u.alias + "\"", txt = "TO_NVARCHAR(" + col + ")";
                String j = "UDF_" + a + "_" + u.fieldId;   // alias join, unik per tabel + field
                if ("cols".equals(kind)) {
                    String expr;
                    if (u.values) expr = codeName(col, txt, j + ".\"Descr\"");
                    else if (u.rtable != null) expr = codeName(col, txt, j + ".\"Name\"");
                    else if ("D".equals(u.type)) expr = "TO_VARCHAR(" + col + ", 'YYYY-MM-DD')";
                    else expr = col;
                    s.append("\n, ").append(expr).append(" AS \"U_").append(u.alias).append('"');
                    Map<String, Object> mm = new LinkedHashMap<>();
                    mm.put("col", "U_" + u.alias);
                    mm.put("label", u.label);
                    mm.put("type", u.type);
                    mm.put("num", !u.values && u.rtable == null && ("N".equals(u.type) || "B".equals(u.type)));
                    if (u.values) mm.put("values", u.codes);
                    meta.add(mm);
                } else if (u.values) {
                    s.append("\nLEFT JOIN UFD1 ").append(j).append(" ON ").append(j).append(".\"TableID\" = '").append(table)
                            .append("' AND ").append(j).append(".\"FieldID\" = ").append(u.fieldId)
                            .append(" AND ").append(j).append(".\"FldValue\" = ").append(txt);
                } else if (u.rtable != null) {
                    s.append("\nLEFT JOIN \"@").append(u.rtable).append("\" ").append(j)
                            .append(" ON TO_NVARCHAR(").append(j).append(".\"Code\") = ").append(txt);
                }
            }
            m.appendReplacement(out, Matcher.quoteReplacement(s.toString()));
        }
        m.appendTail(out);
        return new Expanded(out.toString(), meta);
    }

    // "kode - deskripsi", atau cukup kode kalau deskripsi kosong / sama dengan kodenya
    private static String codeName(String col, String txt, String name) {
        return "CASE WHEN " + col + " IS NULL THEN NULL WHEN " + name + " IS NULL OR " + name + " = " + txt
                + " THEN " + txt + " ELSE " + txt + " || ' - ' || " + name + " END";
    }

    private List<Udf> udfs(String table) {
        List<Udf> list = fields(table);
        Map<Integer, Udf> byId = new HashMap<>();
        for (Udf u : list) byId.put(u.fieldId, u);
        jdbc.query("SELECT \"FieldID\", \"FldValue\" FROM UFD1 WHERE \"TableID\" = ? ORDER BY \"FieldID\", \"IndexID\"", rs -> {
            Udf u = byId.get(rs.getInt(1));
            if (u != null) u.codes.add(rs.getString(2));
        }, table);
        return list;
    }

    private List<Udf> fields(String table) {
        return jdbc.query("SELECT F.\"FieldID\", F.\"AliasID\", F.\"Descr\", F.\"TypeID\", F.\"RTable\", "
                        + "CASE WHEN EXISTS (SELECT 1 FROM UFD1 V WHERE V.\"TableID\" = F.\"TableID\" AND V.\"FieldID\" = F.\"FieldID\") "
                        + "THEN 'Y' ELSE 'N' END AS \"HasValues\" FROM CUFD F WHERE F.\"TableID\" = ? ORDER BY F.\"FieldID\"",
                (rs, i) -> {
                    Udf u = new Udf();
                    u.fieldId = rs.getInt(1);
                    u.alias = rs.getString(2);
                    u.label = rs.getString(3);
                    u.type = rs.getString(4);
                    String rt = rs.getString(5);
                    u.rtable = rt != null && SAFE.matcher(rt).matches() ? rt : null;
                    u.values = "Y".equals(rs.getString(6));
                    return u;
                }, table).stream()
                // alias UDF masuk ke SQL, jadi hanya yang polanya aman
                .filter(u -> u.alias != null && SAFE.matcher(u.alias).matches())
                .collect(java.util.stream.Collectors.toList());
    }
}
