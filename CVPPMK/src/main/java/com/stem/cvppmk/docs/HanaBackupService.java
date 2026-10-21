package com.stem.cvppmk.docs;

import com.jcraft.jsch.ChannelExec;
import com.jcraft.jsch.ChannelSftp;
import com.jcraft.jsch.JSch;
import com.jcraft.jsch.JSchException;
import com.jcraft.jsch.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StreamUtils;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Backup & restore schema SAP HANA lewat SSH (pengganti wizard PowerShell D:\STEM\PAS\tools\HANA_Backup_Restore).
 * Login = IP + user + password SSH yang diisi pengguna; password hanya di memori (sesi), tidak ditulis ke disk / log.
 * Script server (classpath:hana/*.sh) di-upload otomatis ke {@code hana.remote-dir}, folder terpisah dari /opt/stem-scripts milik tool PAS.
 * Riwayat (CSV) dan log per job disimpan di {@code hana.data-dir} (default ~/cvppmk-data), di luar war / classpath,
 * jadi tidak hilang saat deploy ulang dan tidak memicu restart Spring DevTools.
 */
@Service
public class HanaBackupService {
    private static final Logger log = LoggerFactory.getLogger(HanaBackupService.class);
    static final Pattern NAME = Pattern.compile("[A-Za-z0-9_]{1,127}");
    static final Pattern HOST = Pattern.compile("[A-Za-z0-9.\\-]{1,253}");
    static final Pattern USER = Pattern.compile("[A-Za-z0-9_.\\-]{1,64}");
    static final Pattern BACKUP_PATH = Pattern.compile("([A-Za-z0-9_\\-]{1,100}/){1,2}[A-Za-z0-9_\\-]{1,150}\\.tar\\.gz");
    private static final Pattern STAGE = Pattern.compile("^STAGE:\\s*(\\d+)/(\\d+)\\|(.*)$");
    // PROGRESS: <selesai>/<total>|<satuan>; total 0 = tidak diketahui (UI tampil tanpa persen)
    private static final Pattern PROGRESS = Pattern.compile("^PROGRESS:\\s*(\\d*)/(\\d+)(?:\\|(\\w+))?\\s*$");
    private static final String[] SCRIPTS = {"listschemas.sh", "listbackups.sh", "backupschema.sh", "restoreschema.sh"};
    private static final long IDLE_MS = 30L * 60 * 1000;
    private static final int LOG_MAX = 200_000;
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    /** Kesalahan yang aman ditampilkan ke pengguna. */
    public static class HanaException extends RuntimeException {
        public final int status;
        public HanaException(int status, String message) { super(message); this.status = status; }
    }

    public static class Conn {
        public final String token, host, user;
        final String password;
        public final int port;
        public final boolean prod;
        volatile long last = System.currentTimeMillis();
        Conn(String token, String host, int port, String user, String password, boolean prod) {
            this.token = token; this.host = host; this.port = port; this.user = user; this.password = password; this.prod = prod;
        }
    }

    public static class Job {
        public final String id, type, host, user, source, target, file;
        public final long startedAt = System.currentTimeMillis();
        public volatile long endedAt;
        public volatile String status = "running";   // running | ok | failed
        public volatile int exit = -1, stageNo, stageTotal;
        public volatile long progDone, progTotal;
        public volatile String progUnit = "";
        public volatile String stage = "Menghubungi server…", error = "";
        final StringBuilder out = new StringBuilder();
        Job(String id, String type, Conn c, String source, String target, String file) {
            this.id = id; this.type = type; this.host = c.host; this.user = c.user; this.source = source; this.target = target; this.file = file;
        }
        public synchronized String logFrom(int from) { return from >= out.length() ? "" : out.substring(Math.max(0, from)); }
        public synchronized int logLength() { return out.length(); }
        synchronized void append(String line) {
            out.append(line).append('\n');
            if (out.length() > LOG_MAX) out.delete(0, out.length() - LOG_MAX);
        }
        public long seconds() { return ((endedAt > 0 ? endedAt : System.currentTimeMillis()) - startedAt) / 1000; }
    }

    private final Map<String, Conn> conns = new ConcurrentHashMap<>();
    private final Map<String, Job> jobs = new ConcurrentHashMap<>();
    private final ExecutorService pool = Executors.newCachedThreadPool(r -> { Thread t = new Thread(r, "hana-job"); t.setDaemon(true); return t; });
    private final SecureRandom rnd = new SecureRandom();
    private final String remoteDir;
    private final Path dataDir;

    public HanaBackupService(@Value("${hana.remote-dir:/opt/cvppmk-hana}") String remoteDir,
                             @Value("${hana.data-dir:}") String dataDir) {
        this.remoteDir = remoteDir.replaceAll("/+$", "");
        this.dataDir = Paths.get(dataDir.trim().isEmpty() ? System.getProperty("user.home") + "/cvppmk-data" : dataDir.trim());
    }

    // ---------- sesi ----------
    public Conn login(String host, int port, String user, String password, boolean prod) {
        host = host == null ? "" : host.trim();
        user = user == null ? "" : user.trim();
        if (!HOST.matcher(host).matches()) throw new HanaException(400, "IP / host server tidak valid.");
        if (!USER.matcher(user).matches()) throw new HanaException(400, "Username tidak valid.");
        if (password == null || password.isEmpty()) throw new HanaException(400, "Password wajib diisi.");
        if (port < 1 || port > 65535) throw new HanaException(400, "Port tidak valid.");
        Conn c = new Conn(newToken(), host, port, user, password, prod);
        Session s = open(c);
        try {
            ensureScripts(s);
        } finally {
            s.disconnect();
        }
        sweep();
        conns.put(c.token, c);
        return c;
    }

    public Conn conn(String token) {
        Conn c = token == null ? null : conns.get(token);
        if (c == null) throw new HanaException(401, "Sesi berakhir, login ulang ke server.");
        c.last = System.currentTimeMillis();
        return c;
    }

    public void logout(String token) { if (token != null) conns.remove(token); }

    private void sweep() {
        long now = System.currentTimeMillis();
        for (Conn c : new ArrayList<>(conns.values())) {
            if (now - c.last > IDLE_MS && activeJob(c.host) == null) conns.remove(c.token);
        }
    }

    private String newToken() {
        byte[] b = new byte[24];
        rnd.nextBytes(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    // ---------- SSH ----------
    private Session open(Conn c) {
        try {
            JSch jsch = new JSch();
            // Trust-on-first-use: kunci server dicatat saat pertama terhubung, lalu koneksi DITOLAK bila kunci berubah
            // (mencegah penyamaran server). Berkas ada di data-dir; hapus barisnya bila server memang dipasang ulang.
            Files.createDirectories(dataDir);
            Path known = dataDir.resolve("hana-known-hosts");
            if (!Files.exists(known)) Files.createFile(known);
            jsch.setKnownHosts(known.toString());
            Session s = jsch.getSession(c.user, c.host, c.port);
            s.setPassword(c.password);
            s.setConfig("StrictHostKeyChecking", "accept-new");
            s.setConfig("PreferredAuthentications", "password,keyboard-interactive");
            s.connect(15000);
            return s;
        } catch (IOException e) {
            throw new HanaException(500, "Folder data " + dataDir + " tidak bisa ditulis: " + e.getMessage());
        } catch (JSchException e) {
            String m = String.valueOf(e.getMessage());
            if (m.contains("HostKey has been changed") || m.contains("REMOTE HOST IDENTIFICATION"))
                throw new HanaException(403, "Kunci server " + c.host + " berubah dari yang tercatat. Bila server memang dipasang ulang, hapus barisnya di " + dataDir.resolve("hana-known-hosts") + "; bila tidak, jangan lanjut.");
            if (m.toLowerCase().contains("auth")) throw new HanaException(401, "Username atau password ditolak server " + c.host + ". Pastikan SSH dengan password diizinkan untuk user ini.");
            throw new HanaException(502, "Server " + c.host + ":" + c.port + " tidak terjangkau (cek IP, port, dan VPN). " + m);
        }
    }

    private void ensureScripts(Session s) {
        ChannelSftp sftp = null;
        try {
            exec(s, "mkdir -p " + remoteDir, null);
            sftp = (ChannelSftp) s.openChannel("sftp");
            sftp.connect(10000);
            for (String name : SCRIPTS) {
                byte[] body;
                try (InputStream in = HanaBackupService.class.getResourceAsStream("/hana/" + name)) {
                    if (in == null) throw new HanaException(500, "Script " + name + " tidak ada di aplikasi.");
                    body = new String(StreamUtils.copyToByteArray(in), StandardCharsets.UTF_8).replace("\r\n", "\n").getBytes(StandardCharsets.UTF_8);
                }
                sftp.put(new ByteArrayInputStream(body), remoteDir + "/" + name);
                sftp.chmod(0755, remoteDir + "/" + name);
            }
        } catch (HanaException e) {
            throw e;
        } catch (Exception e) {
            throw new HanaException(502, "Script belum bisa dipasang di server (" + remoteDir + "): " + e.getMessage());
        } finally {
            if (sftp != null) sftp.disconnect();
        }
    }

    /** Jalankan perintah; setiap baris keluaran (stdout+stderr) dikirim ke sink. Mengembalikan exit code. */
    private int exec(Session s, String cmd, Consumer<String> sink) {
        ChannelExec ch = null;
        try {
            ch = (ChannelExec) s.openChannel("exec");
            ch.setCommand("(" + cmd + ") 2>&1");
            InputStream in = ch.getInputStream();
            ch.connect(15000);
            try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                for (String line; (line = r.readLine()) != null; ) if (sink != null) sink.accept(line);
            }
            long until = System.currentTimeMillis() + 10000;
            while (!ch.isClosed() && System.currentTimeMillis() < until) Thread.sleep(50);
            return ch.getExitStatus();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new HanaException(500, "Dibatalkan.");
        } catch (Exception e) {
            throw new HanaException(502, "Perintah ke server gagal: " + e.getMessage());
        } finally {
            if (ch != null) ch.disconnect();
        }
    }

    private List<String> list(Conn c, String script) {
        Session s = open(c);
        try {
            List<String> out = new ArrayList<>();
            int rc = exec(s, "bash " + remoteDir + "/" + script, line -> { if (!line.trim().isEmpty()) out.add(line.trim()); });
            if (rc != 0) throw new HanaException(502, "Gagal mengambil daftar dari server (exit " + rc + "): " + String.join(" | ", out));
            return out;
        } finally {
            s.disconnect();
        }
    }

    public List<String> schemas(Conn c) { return list(c, "listschemas.sh"); }

    public List<String> backups(Conn c) {
        List<String> all = new ArrayList<>();
        for (String x : list(c, "listbackups.sh")) if (BACKUP_PATH.matcher(x).matches()) all.add(x);
        return all;
    }

    // ---------- job ----------
    public Job activeJob(String host) {
        for (Job j : jobs.values()) if ("running".equals(j.status) && j.host.equalsIgnoreCase(host)) return j;
        return null;
    }

    public synchronized Job startBackup(Conn c, String schema) {
        if (!NAME.matcher(schema == null ? "" : schema).matches()) throw new HanaException(400, "Nama schema tidak valid (hanya huruf, angka, garis bawah).");
        return start(c, "Backup", schema, "", "", "bash " + remoteDir + "/backupschema.sh " + schema);
    }

    public synchronized Job startRestore(Conn c, String source, String file, String target) {
        if (!NAME.matcher(source == null ? "" : source).matches()) throw new HanaException(400, "Nama schema asal tidak valid.");
        if (!NAME.matcher(target == null ? "" : target).matches()) throw new HanaException(400, "Nama schema tujuan tidak valid (hanya huruf, angka, garis bawah).");
        if (file == null || !BACKUP_PATH.matcher(file).matches()) throw new HanaException(400, "File backup tidak valid, pilih dari daftar.");
        return start(c, "Restore", source, target, file,
                "bash " + remoteDir + "/restoreschema.sh " + source + " " + file + " " + target + " CONFIRM");
    }

    private Job start(Conn c, String type, String source, String target, String file, String cmd) {
        Job running = activeJob(c.host);
        if (running != null) throw new HanaException(409, "Masih ada " + running.type + " yang berjalan di server ini (" + running.source + "). Tunggu selesai dulu.");
        Job job = new Job(UUID.randomUUID().toString().replace("-", "").substring(0, 12), type, c, source, target, file);
        jobs.put(job.id, job);
        pool.submit(() -> run(c, job, cmd));
        return job;
    }

    private void run(Conn c, Job job, String cmd) {
        Session s = null;
        try {
            s = open(c);
            ensureScripts(s);   // script bisa terhapus / belum ada
            job.stage = "Memulai";
            int rc = exec(s, cmd, line -> {
                Matcher m = STAGE.matcher(line);
                Matcher pm = PROGRESS.matcher(line);
                if (pm.matches()) {   // laporan progress tidak ikut log (muncul tiap beberapa detik)
                    job.progDone = pm.group(1).isEmpty() ? 0 : Long.parseLong(pm.group(1));
                    job.progTotal = Long.parseLong(pm.group(2));
                    job.progUnit = pm.group(3) == null ? "" : pm.group(3);
                    return;
                }
                if (m.matches()) {
                    job.progDone = 0; job.progTotal = 0; job.progUnit = "";
                    job.stageNo = Integer.parseInt(m.group(1));
                    job.stageTotal = Integer.parseInt(m.group(2));
                    job.stage = m.group(3).trim();
                }
                job.append(line);
            });
            job.exit = rc;
            boolean done = job.logFrom(0).contains("\nDONE:") || job.logFrom(0).startsWith("DONE:");
            job.status = rc == 0 && done ? "ok" : "failed";
            if (!"ok".equals(job.status)) job.error = "Exit code " + rc + (done ? "" : ", baris DONE tidak ditemukan");
        } catch (HanaException e) {
            job.status = "failed";
            job.error = e.getMessage();
            job.append("ERROR: " + e.getMessage());
        } catch (Throwable e) {
            log.warn("job {} gagal", job.id, e);
            job.status = "failed";
            job.error = String.valueOf(e.getMessage());
            job.append("ERROR: " + e);
        } finally {
            if (s != null) s.disconnect();
            job.endedAt = System.currentTimeMillis();
            persist(job);
        }
    }

    public Job job(String id) {
        Job j = jobs.get(id);
        if (j == null) throw new HanaException(404, "Job tidak ditemukan (aplikasi mungkin sudah restart). Lihat Riwayat.");
        return j;
    }

    // ---------- riwayat (CSV) + log per job, di data-dir ----------
    private static String cell(String v) { return v == null ? "" : v.replaceAll("[,\"\\r\\n]", " ").trim(); }

    private void persist(Job j) {
        try {
            Files.createDirectories(dataDir.resolve("hana-logs"));
            Files.write(dataDir.resolve("hana-logs").resolve(j.id + ".log"), j.logFrom(0).getBytes(StandardCharsets.UTF_8));
            Path csv = dataDir.resolve("hana-history.csv");
            String head = Files.exists(csv) ? "" : "id,waktu,jenis,server,user,schema_asal,schema_tujuan,file,status,exit,detik,catatan\n";
            String row = String.join(",", cell(j.id), cell(LocalDateTime.now().format(TS)), cell(j.type), cell(j.host), cell(j.user), cell(j.source),
                    cell(j.target), cell(j.file), "ok".equals(j.status) ? "SUKSES" : "GAGAL", String.valueOf(j.exit), String.valueOf(j.seconds()), cell(j.error)) + "\n";
            Files.write(csv, (head + row).getBytes(StandardCharsets.UTF_8), StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            log.warn("Riwayat HANA tidak bisa ditulis di {}: {}", dataDir, e.getMessage());
        }
    }

    /** Riwayat terbaru dulu, maksimal 200 baris. Tiap baris: peta kolom -> nilai. */
    public List<Map<String, String>> history() {
        List<Map<String, String>> out = new ArrayList<>();
        Path csv = dataDir.resolve("hana-history.csv");
        if (!Files.exists(csv)) return out;
        try {
            List<String> lines = Files.readAllLines(csv, StandardCharsets.UTF_8);
            if (lines.size() < 2) return out;
            String[] cols = lines.get(0).split(",", -1);
            for (int i = lines.size() - 1; i >= 1 && out.size() < 200; i--) {
                String[] v = lines.get(i).split(",", -1);
                Map<String, String> m = new java.util.LinkedHashMap<>();
                for (int k = 0; k < cols.length; k++) m.put(cols[k], k < v.length ? v[k] : "");
                out.add(m);
            }
        } catch (IOException e) {
            log.warn("Riwayat HANA tidak bisa dibaca: {}", e.getMessage());
        }
        return out;
    }

    public String savedLog(String id) {
        if (!id.matches("[a-f0-9]{12}")) throw new HanaException(400, "ID tidak valid.");
        Path p = dataDir.resolve("hana-logs").resolve(id + ".log");
        try {
            return Files.exists(p) ? new String(Files.readAllBytes(p), StandardCharsets.UTF_8) : "";
        } catch (IOException e) {
            throw new HanaException(500, "Log tidak bisa dibaca.");
        }
    }
}
