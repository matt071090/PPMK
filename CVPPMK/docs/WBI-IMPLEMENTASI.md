# Implementasi WBI, 23 November 2026

## Basis dan Git

Branch lokal `wbi/main` dibuat dari `main` (`ab74c0c`), bukan dari branch fitur. Empat berkas Setup dibandingkan terlebih dahulu terhadap `feature/fakhri-hana-tools`: SetupController 21 baris perubahan (kunci sesi/password WAR menggantikan dev-only); steps.json 70 baris perubahan (master addon/aset); setup.js 305 baris perubahan (pencarian, progress, template aset/TXT, akses WAR); templates.js 93 baris (T24-T28). Perubahan ini berarti secara fungsional. Basis Setup fitur dipilih karena `main` belum memiliki ST_SHIFT, master addon dan template aset yang diminta. Snapshot CVPPMK yang sama untuk keempat berkas tersebut sudah ada pada `7553efd`; dipindahkan bersama dependensi UI/controller/query-nya sebagai commit `e330fe8` agar branch tetap berasal dari main dan aplikasi konsisten.

Count Document dari branch fitur juga dibawa; sumber lokal D:/STEM/GitHub/PPMK/CVPPMK dipakai hanya-baca untuk Schedule/Home/chat serta penyimpan CountDoc checks/custom yang belum tracked. Ini mempertahankan fitur yang diminta diberi namespace, tanpa mengedit checkout asal. Tidak menyalin konfigurasi atau data hidup. `main` dan branch fitur tetap tidak diubah; staging per nama berkas, tanpa `git add -A`, tanpa push.

## Setup adaptif

- Mode dibaca dari **OADM tujuan** (`MltpBrnchs=Y/N`). DB baca harus sama persis dengan CompanyDB SL yang benar-benar dipakai client. Nilai NULL, kosong, 0, tidak dikenal, atau gagal baca membuat upload diblokir. Diperiksa ulang setiap request upload; flag dari browser tidak dipercaya.
- Non-branch: required/lookup branch dilewati; T09/T15 tidak memiliki kolom Branch, sheet assignment BP/user dibuang, UDF dengan nama branch ikut dikeluarkan dari template. Input branch bermakna, termasuk angka/string 0, ditolak. Payload kosong/null dibersihkan rekursif dari seluruh field branch/BPL sebelum diteruskan ke SL. Numbering/BP/Shift menggunakan aturan yang sama.
- Branch: required dan lookup warehouse/asset class tetap, numbering tanpa branch tetap opsional, serta raw U_BRANCH Shift tetap mengikuti perilaku lama. Nol hanya boleh merujuk branch yang memang ada, bukan penanda semua branch. Tes memeriksa create/update, kosong/0/valid/tak dikenal.
- Server mengulang required dan validasi ID branch berdasarkan OBPL tujuan. ST_SHIFT memeriksa keberadaan U_BRANCH secara terpisah di koneksi sumber dan tujuan; jika absen, query menggunakan alias NULL. Farm Breeding Tier G memeriksa tabel tujuan dan menampilkan “tidak tersedia di company ini”, serta menolak upload langsung jika tabel belum terpasang.
- Data sumber ber-branch menuju non-branch harus dikosongkan eksplisit; tidak ada pelepasan branch diam-diam. Ini mengikuti spek user dan berbeda dari usulan QA-04 dalam laporan survei. Nilai 0 tetap ditolak pada non-branch, berbeda dari pembacaan longgar QA-02. Duplikat kode/nama series tetap ditandai Error.

## Konfigurasi, chat, favicon

Profil Maven/Spring WBI menghasilkan wbi.war, menargetkan WBI_TEST, dan memakai variabel lingkungan untuk rahasia. Port/user HANA tidak ditebak. Panduan ada di BUILD-WBI.md.

Chat Setup menggunakan komponen Schedule yang sama (`createChat`) dan implementasi penyimpanan bersama `ChatControllerSupport`, dengan endpoint/storage Setup terpisah dan dilindungi kunci sesi Setup. Ada topik umum dan per langkah, nama pengirim diingat browser, lencana pesan baru, polling 6 detik saat panel terbuka/30 detik saat tertutup, teks maksimal 1000 karakter, maksimum 5000 pesan. Tampilan memakai textContent; nama diketik sendiri dan bukan bukti identitas. Ini diskusi antar manusia, bukan AI, tidak menjalankan SQL atau upload, tidak mengubah status master, dan tidak memberi notifikasi di luar halaman. Penyimpanan lokal append-only/satu JVM; belum mendukung cluster atau arsip setelah batas penuh. Asumsi produk: diskusi per langkah adalah pilihan paling sederhana.

Favicon S biru dari checkout sumber disalin tanpa mengubah berkas asal. Semua tujuh HTML memakai tiga tag identik (ICO, PNG 32, apple 180), diuji otomatis.

## Schedule dan namespace company

`DataFiles.dir` menjadi pusat namespace; company kosong mempertahankan path CV lama. Kode divalidasi huruf kecil/angka/tanda minus dan tidak menerima path traversal. Profil WBI wajib namespace `wbi` dan root data tidak kosong. Jadwal WBI memakai seluruh tanggal/jam seed CV yang sama, PIC seluruhnya kosong dan status `belum`; penetapan PIC STEM otomatis pada UI dimatikan untuk company bernamespace. Seed hanya digunakan saat jadwal company itu belum ada. Tidak membaca schedule.json hidup CV.

Penyimpan yang sudah memakai namespace:

| Penyimpan | Path relatif di root company |
|---|---|
| Schedule + tulis atomic/revisi | schedule/schedule.json |
| Chat Schedule | schedule/chat.jsonl |
| Chat Setup | setup/chat.jsonl |
| CountDoc status cek | countdoc/queries/checks.json |
| CountDoc query buatan | countdoc/queries/custom/queries.json |
| CountDoc pivot dan trash | countdoc/pivots, countdoc/trash |
| Review log per build | review-log-*.csv |
| Remarks | remarks.json (company kosong tetap path konfigurasi lama) |
| Mapping addon dev/WAR | addon-mapping*.json (company kosong tetap perilaku lama) |
| Riwayat/file kerja utilitas HANA | hana (company kosong tetap hana.data-dir lama) |

Company bernamespace menggunakan suffix kode pada download CSV/JSON/PNG/XLSX/ZIP; CV mempertahankan nama lama. Schedule memiliki Unduh JSON (`schedule-wbi.json`). Pengaturan/session CountDoc, sumber Setup, dan tanda pesan terbaca juga diberi kode company di browser; tema dan nama editor tetap preferensi pengguna bersama. Nama header berasal dari konfigurasi company, dengan fallback OADM untuk CV. Tidak ada nama WBI di aturan branch.

## Bukti awal dan batas verifikasi

Validasi bagian 1–5: **84 tes Java lulus, 0 gagal/error/skipped; 115 tes JS lulus, 0 gagal/skipped**. Build `clean package` default dan `clean package -Pwbi` berhasil, menghasilkan cvppmk.war dan wbi.war. Perintah JDK 25 memakai flag Byte Buddy yang tercatat di BUILD-WBI.md. Tidak ada POST/PATCH/DELETE master/dokumen SAP, dan tidak menjalankan JDBC/SELECT nyata. Preview UI menggunakan fixture lokal.

Verifikasi SL langsung yang dijalankan worker: Login 200 dan GET metadata 200 di 192.168.20.135:50000, BusinessPlaces count=0, ST_SHIFT GET 200 dan U_BRANCH tidak ada; metadata Warehouse.BusinessPlaceID, AssetClass.BPLID, Series.BPLID memang tersedia. GET CompanyService_GetAdminInfo menghasilkan 400; metadata menetapkannya sebagai POST, jadi worker tidak memanggilnya dengan POST karena izin hanya Login. Flag EnableBranches=tNO dilaporkan oleh survei Gemini (WBI-SURVEI-QA.md), bukan hasil panggilan admin worker ini. Kolom nullable di metadata bukan bukti bahwa POST dengan null diterima.

Belum diuji: koneksi runtime JDBC, hasil OADM.MltpBrnchs melalui datasource aplikasi, instalasi dua WAR di Tomcat/Java 8 sungguhan, upload SAP create/update dan penerimaan payload oleh SL, serta rekonsiliasi master/aset setelah posting. QA posting hanya dilakukan Fakhri. Tool ini bukan migrasi saldo awal inventory/AP/AR/GL lengkap.
