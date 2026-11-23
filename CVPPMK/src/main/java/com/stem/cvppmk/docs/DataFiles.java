package com.stem.cvppmk.docs;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.info.BuildProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

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
@Component
final class DataFiles {
    private static final Logger log = LoggerFactory.getLogger(DataFiles.class);

    private final String company;
    DataFiles(@Value("${docs.company:}") String company, @Value("${docs.data.dir:}") String root, Environment env) {
        if (!company.isEmpty() && !company.matches("[a-z0-9]+(?:-[a-z0-9]+)*") || company.length() > 60)
            throw new IllegalArgumentException("docs.company hanya boleh huruf kecil, angka, dan tanda - (maks 60), tanpa pemisah path.");
        if (java.util.Arrays.asList(env.getActiveProfiles()).contains("wbi") && (!"wbi".equals(company) || root.trim().isEmpty()))
            throw new IllegalArgumentException("Profil WBI wajib docs.company=wbi dan docs.data.dir terisi agar data company terpisah.");
        this.company = company;
    }
    String company() { return company; }
    String filename(String name) {
        if (company.isEmpty()) return name;
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) + "-" + company + name.substring(dot) : name + "-" + company;
    }
    Path legacyFile(String root, String configured) throws IOException {
        return company.isEmpty() ? Paths.get(configured).toAbsolutePath() : dir(root).resolve(Paths.get(configured).getFileName());
    }

    Path dir(String configured) throws IOException {
        Path dir = configured.isEmpty()
                ? (System.getProperty("catalina.base") != null ? Paths.get(System.getProperty("catalina.base"), "data", "cvppmk") : Paths.get("review-data"))
                : Paths.get(configured);
        dir = dir.toAbsolutePath();
        if (!company.isEmpty()) dir = dir.resolve(company);
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
