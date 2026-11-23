# Serah terima WBI — 23 November 2026

Bagian 1–5 dan Retail selesai di branch lokal **wbi/main** pada workspace `C:/Users/Fakhri/orca/workspaces/PPMK/razorbill`, termasuk perbaikan sinkronisasi checkout lokal/menu di bawah. `main` tetap `ab74c0c`; tidak ada push atau `git add -A`. Seluruh staging memakai satu nama berkas per perintah. Bagian warna sudah dialihkan ke Gemini dan percobaan warna worker dibatalkan utuh; CSS terbaru checkout asal dibawa hanya sebagai bagian merge yang diminta.

## Commit lokal

| Commit | Isi |
|---|---|
| e330fe8 | Basis fitur CVPPMK dibawa ke branch baru dari main |
| ee53de8 | Setup adaptif, profil WBI, chat reuse, favicon, namespace dan jadwal |
| 6eacda2 | Menonaktifkan Farm Breeding untuk WBI sebelum Retail disetujui |
| 9e89321 | Identitas company pada header halaman lama |
| acb5607 | Percobaan warna sebelum arahan pengalihan diterima |
| 666c8f8 | Membatalkan utuh acb5607; CSS/warna kembali ke keadaan sebelumnya |
| 290bbba | Tier Retail terverifikasi, sumber=target, guard server dan tes |

Commit dokumentasi serah terima mengikuti daftar ini. Pembandingan empat berkas Setup main vs feature/fakhri-hana-tools, alasan basis fitur, serta semua rincian implementasi tersedia di [WBI-IMPLEMENTASI.md](WBI-IMPLEMENTASI.md).

## Diff per bagian

| Bagian | Hasil |
|---|---|
| 1 Setup | Flag OADM tujuan Y/N otomatis; tidak pasti/mismatch SL diblokir; non-branch menolak input branch termasuk 0 lalu membersihkan seluruh field BPL/Branch kosong; T09/T15, lookup, BP/numbering/Shift adaptif; Shift tanpa U_BRANCH aman |
| 2 Profil | wbi.war, WBI_TEST, HANA default 192.168.20.135:30015 dan SL 192.168.20.135:50000 sesuai konfirmasi Fakhri; **seluruh kredensial placeholder lingkungan**, datasource read-only |
| 3 Chat | Komponen Schedule dipakai ulang di Setup, topik umum/per langkah, storage/akses Setup terpisah; diskusi manusia, bukan AI; nama diketik sendiri, batas 1000 karakter/5000 pesan, satu JVM |
| 4 Favicon | ICO dan PNG S biru disalin dari checkout asal tanpa mengeditnya; ketujuh HTML memakai tag identik |
| 5 Data/jadwal | Namespace pusat DataFiles; company kosong mempertahankan path CV; WBI seed tanggal/jam sama, PIC kosong/status belum, tulis atomic dan revisi tetap; nama unduhan memuat company |
| Retail | Tier G WBI menggantikan Farm Breeding dengan 11 langkah/8 kelompok; hanya tabel master yang terpasang dan berisi data; sumber=target WBI_TEST sah, hasil normal Sama |
| Warna | Dibatalkan melalui revert; tidak ada diff akhir CSS/warna HTML/chat dari percobaan worker; Gemini melanjutkan desain |

Semua penyimpan data yang ditemukan telah diberi namespace: Schedule, chat Schedule, chat Setup, CountDoc checks, custom queries, pivot/trash, review log, remarks, mapping addon, dan riwayat/file kerja utilitas HANA. CV tidak dipindahkan. Kode company menolak path traversal; profil WBI menolak root kosong/company selain wbi.

Tidak dibuat uploader saldo awal baru: inventory/AP/AR/GL diisi user sendiri. Tidak ada langkah migrasi untuk 111 tabel transaksi/log/buffer. WBI_KARTON hanya opsi di komentar/dokumen, tidak aktif dan tidak dihubungi.

## Bukti

- **Java terbaru: 118 lulus, 0 gagal/error/skipped** — SetupController 64, CompanyData 21, Retail 31, ditambah suite sumber CountDocCustomTests dan CountDocQueryTests masing-masing satu tes JUnit yang menjalankan seluruh pemeriksaan internalnya. Termasuk matriks branch/non-branch × kosong/0/valid/tak dikenal pada create/update, katalog CV utuh, namespace/seed/atomic/revisi, akses chat, field/key/detail Retail dan sumber kosong/tidak sah.
- **JavaScript terbaru: 182 lulus, 0 gagal/skipped**. Termasuk tes Schedule/Daftar Query yang sebelumnya belum ikut dan regresi menu delapan halaman, di samping matriks browser/template/payload, favicon, nama ekspor/browser namespace, serta sumber=target dan detail Route.
- **Dua build clean package serah terima awal berhasil** dari wbi/main: profil default menghasilkan [cvppmk.war](../target/cvppmk.war), `-Pwbi` menghasilkan [wbi.war](../target/wbi.war). Resource profil masing-masing telah diperiksa, bytecode Java 8, WBI tidak membundel konfigurasi lokal CV. Bukti/SHA-256 artefak awal (sebelum perbaikan navigasi): [verification.json](qa-wbi/verification.json). WAR belum dibuild ulang dalam tugas navigasi ini untuk menghemat beban PC; build ulang setelah pekerjaan Gemini.
- UI fixture Retail diuji 1440 px dan 390 px; company WBI, Tier Retail, tidak ada link Farm Breeding, status Sama, console bersih dan tidak ada overflow halaman. Screenshot: [desktop](qa-wbi/retail-route-desktop.png), [HP](qa-wbi/retail-route-mobile.png). Fixture tidak menyambung SAP.
- SL nyata: Login/metadata berhasil; BusinessPlaces **0**; sampel Warehouse.BusinessPlaceID dan AssetClass.BPLID **null**; metadata dan GET Shift sebelumnya tidak memiliki U_BRANCH. Pengulangan Shift GET terakhir timeout. [Bukti baca SL](qa-wbi/sl-readonly-summary.json).
- Sebelas entity Retail terverifikasi lewat GET metadata/UDT/UDO/count: 19, 5, 24, 2, 3, 2, 52, 26, 6, 4, 3 baris sesuai urutan katalog. [Metadata bersih](qa-wbi/retail-metadata.json). Koreksi katalog: Petty Cash memakai STEM_PETTYCASHCAT; Inspection Mapping U_ST_INSTYPEMAP; Rule Transfer Code angka auto increment; U_Discount Price Category tidak ada.

Worker hanya memakai POST Login dan SL GET, **tanpa JDBC/SQL nyata dan tanpa POST/PATCH/DELETE master/dokumen**. EnableBranches=tNO berasal dari survei Gemini; worker tidak memverifikasi ulang flag admin karena GET ditolak 400 dan metode yang dipublikasikan memerlukan POST selain Login. Aplikasi tetap membaca OADM lewat datasource saat dijalankan Fakhri, bukan menebak flag dari branch kosong.

## Langkah berikut oleh Fakhri/koordinator

Isi variabel lingkungan sesuai [BUILD-WBI.md](BUILD-WBI.md), jalankan aplikasi dan verifikasi runtime JDBC/OADM serta dua WAR di Tomcat. Host/port diketahui dari konfirmasi Fakhri; koneksi JDBC belum diuji worker. POST/PATCH dan enum/referensi UDF Retail belum diuji; metadata bukan bukti penerimaan tulis. Detail Route lama harus diubah di SAP. Saldo awal diisi manual.

Gemini mengerjakan warna setelah commit ini; regresi fungsi/tes sesudah perubahan Gemini merupakan pekerjaan berikutnya. Arsip percobaan warna yang dibatalkan tersedia di `C:/Users/Fakhri/AppData/Local/Temp/wbi-color-handoff/` bila diperlukan, bukan desain final yang disetujui.

## Perbaikan: perubahan lokal checkout asal belum terbawa

Seluruh **14 berkas modified** di `D:/STEM/GitHub/PPMK/CVPPMK` diperiksa lewat diff HEAD vs working tree; checkout asal hanya dibaca dan snapshot berkas modified dipastikan tetap sama sesudah pekerjaan. Merge memakai basis HEAD sumber, isi terbaru sumber, dan versi WBI sebagai tiga sisi; konflik HTML/properties diselesaikan dengan mempertahankan fitur WBI serta perubahan sumber. CountDocController dan perubahan unavailable pada countdoc.js ternyata sudah ada di WBI, sehingga tidak ditimpa lagi.

| Sumber modified | Keputusan |
|---|---|
| .gitignore | Tambah abaikan sl-*.properties dan JSON hasil analisa klien |
| CountDocController.java, js/pages/countdoc.js | Perubahan sumber sudah ada; tetap dipertahankan |
| resources/application.properties | Bawa compression, komentar custom-query default mati, cache no-cache; profil aktif WBI dan read-only tetap |
| css/app.css | Bawa persis delta sumber: palette terang lembut, responsivitas tombol header, dan CSS modnav; tidak membuat desain warna baru |
| index.html, setup.html, hana.html, countdoc.html, rpt.html | Merge menu bersama, tema default terang, favicon/submenu; redirect index tanpa hash ke Home tetap sesuai sumber |
| js/app.js | Bawa buka/tutup bab aktif dan tema default; judul tetap menambahkan company |
| js/pages/rpt.js, tools/rpt-agent/Agent.cs, build.cmd | Bawa bersama versi agen 0.8 dan UI Kirim ke SAP agar endpoint cocok; tidak menjalankan agen/SAP |

Modnav kini terpasang **tepat sekali di semua delapan HTML**: index, home, schedule, setup, countdoc, Daftar Query, rpt, hana. RPT yang semula tidak punya sidebar kini mempunyai wadah sidebar/menu mobile agar skrip menu benar-benar terlihat. Menu Home/Schedule/Project Check List tersedia juga ketika admin terkunci; Setup/Tools tetap mengikuti akses sesi server. Namespace cache akses per konteks WAR pada modnav tetap dipertahankan.

Judul tab memakai nama company dari konfigurasi/OADM lewat helper companyTitle; route Checklist, Setup, dan HANA tidak menimpanya lagi dengan teks CVPPMK. Header WBI, seed PIC kosong, namespace DataFiles, branch guard, profil WBI, dan katalog Retail tidak ditimpa. Delapan halaman diverifikasi di browser fixture: menu tunggal, Schedule terlihat, dan judul memuat PT Warung Begok Indonesia — [audit](qa-wbi/navigation-audit.json). Klik **Schedule dari Project Check List** benar-benar membuka Schedule WBI — [asal](qa-wbi/navigation-checklist.png), [tujuan](qa-wbi/navigation-schedule.png).

Inventaris lengkap **61 path untracked** sumber beserta keputusan tersedia di [source-sync-audit.json](qa-wbi/source-sync-audit.json). Yang baru dibawa: `countdoc-query.html`, `tools/rpt-agent/SapUpload.cs`, dua suite Java CountDoc, serta tiga suite JS CountDoc Query/Schedule/Schedule Review. Tes sumber disesuaikan hanya untuk import modul WBI, download async yang menunggu company, dan pemanggilan JUnit. File modnav, favicon, seed CV, query lib/controller, health, dan schedule-review sudah ada; versi Schedule/chat/store lain dipertahankan karena selisihnya adalah namespace, seed, dan reuse WBI yang disengaja.

Tidak dibawa: `static/data/ppmk-users.json` (daftar PIC pribadi CV; WBI sengaja memakai PIC sendiri yang kosong), seluruh `tools/sl-analisa/*` (skrip analisa ad hoc klien dan cache Python; bukan dependensi web). Tidak menyalin config rahasia atau data hidup. Agen C#/DI API tidak dibuild/dijalankan; pengujian endpoint upload SAP tetap di luar tugas ini.

Tes hemat: `mvn '-Dnet.bytebuddy.experimental=true' '-DargLine=-Xmx256m' test` dan `node --test --test-concurrency=1 src/test/js/*.test.mjs`; hasil **118 Java + 182 JS, semuanya lulus, 0 gagal/skip**. Tidak ada akses JDBC/SAP pada perbaikan ini. Gemini dapat mulai warna dari commit perbaikan navigasi ini; tidak ada pekerjaan implementasi yang tertinggal pada worker.
