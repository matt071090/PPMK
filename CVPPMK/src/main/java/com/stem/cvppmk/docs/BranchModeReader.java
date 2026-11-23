package com.stem.cvppmk.docs;

import org.springframework.jdbc.core.JdbcTemplate;

/** One strict source for public display mode and Setup validation; no SL login or data write. */
final class BranchModeReader {
    private BranchModeReader() { }

    static boolean read(JdbcTemplate jdbc, ServiceLayerClient sl) {
        String target = jdbc.queryForObject("SELECT CURRENT_SCHEMA FROM DUMMY", String.class);
        if (target == null || !target.equals(sl.companyDatabase()))
            throw new IllegalStateException("Company DB baca dan Service Layer tujuan tidak sama. Upload diblokir.");
        return SetupBranchPolicy.parseMode(jdbc.queryForObject("SELECT \"MltpBrnchs\" FROM OADM", String.class));
    }
}
