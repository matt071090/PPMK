package com.stem.cvppmk.docs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.info.BuildProperties;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.stream.Stream;

/**
 * Folder data yang ditulis app saat jalan (log review, mapping add-on di war).
 * - docs.data.dir kosong: {catalina.base}/data/cvppmk di Tomcat, ./review-data saat dijalankan dari VS Code
 *   (bukan ./data: di Windows sama dengan folder DATA berisi data klien).
 * - File per build: nama file memuat waktu build (META-INF/build-info.properties), file build lain dihapus saat start,
 *   jadi build baru mulai dari kosong / isi awal.
 */
final class DataFiles {
    private static final Logger log = LoggerFactory.getLogger(DataFiles.class);

    private DataFiles() { }

    static Path dir(String configured) throws IOException {
        Path dir = configured.isEmpty()
                ? (System.getProperty("catalina.base") != null ? Paths.get(System.getProperty("catalina.base"), "data", "cvppmk") : Paths.get("review-data"))
                : Paths.get(configured);
        dir = dir.toAbsolutePath();
        Files.createDirectories(dir);
        return dir;
    }

    static String buildId(BuildProperties build) {
        return build != null && build.getTime() != null ? String.valueOf(build.getTime().toEpochMilli()) : "dev";
    }

    /** {dir}/{prefix}-{build}.{ext}; file {prefix}-*.{ext} milik build lain dihapus. */
    static Path perBuild(Path dir, String prefix, String ext, String buildId) throws IOException {
        Path file = dir.resolve(prefix + "-" + buildId + "." + ext);
        try (Stream<Path> old = Files.list(dir)) {
            old.filter(p -> p.getFileName().toString().matches(java.util.regex.Pattern.quote(prefix) + "-.*\\." + ext) && !p.equals(file)).forEach(p -> {
                try { Files.delete(p); log.info("File build lama dihapus: {}", p); } catch (IOException e) { log.warn("Gagal hapus {}: {}", p, e.getMessage()); }
            });
        }
        return file;
    }
}
