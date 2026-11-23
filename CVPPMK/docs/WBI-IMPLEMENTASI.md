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
- Keputusan Fakhri terbaru: WBI memakai addon Retail. Profil WBI menyembunyikan seluruh langkah Farm Breeding dan mengganti Tier G dengan **Retail**, 11 langkah dalam 8 kelompok yang disetujui. Default CV tetap menggunakan katalog Farm Breeding semula; tes membandingkan JSON katalog CV secara utuh dengan resource awal. Pemeriksaan tabel otomatis tetap berlaku untuk instalasi lain yang mengaktifkan Farm Breeding.

## Konfigurasi, chat, favicon

Profil Maven/Spring WBI menghasilkan wbi.war, menargetkan WBI_TEST, dan memakai variabel lingkungan untuk rahasia. Endpoint HANA 192.168.20.135:30015 dikonfirmasi Fakhri; seluruh kredensial HANA/SL berupa placeholder lingkungan. Datasource dan jalur baca Setup WBI read-only. Sumber dan tujuan sama-sama WBI_TEST. Panduan ada di BUILD-WBI.md.

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

Validasi akhir bagian 1–5 + Retail: **116 tes Java lulus, 0 gagal/error/skipped; 129 tes JS lulus, 0 gagal/skipped**. Build `clean package` default dan `clean package -Pwbi` berhasil, menghasilkan cvppmk.war dan wbi.war. Perintah JDK 25 memakai flag Byte Buddy yang tercatat di BUILD-WBI.md. Tidak ada POST/PATCH/DELETE master/dokumen SAP, dan tidak menjalankan JDBC/SELECT nyata. Preview UI menggunakan fixture lokal.

Verifikasi SL langsung yang dijalankan worker: Login 200 dan GET metadata 200 di 192.168.20.135:50000, BusinessPlaces count=0, ST_SHIFT GET 200 dan U_BRANCH tidak ada; metadata Warehouse.BusinessPlaceID, AssetClass.BPLID, Series.BPLID memang tersedia. GET CompanyService_GetAdminInfo menghasilkan 400; metadata menetapkannya sebagai POST, jadi worker tidak memanggilnya dengan POST karena izin hanya Login. Flag EnableBranches=tNO dilaporkan oleh survei Gemini (WBI-SURVEI-QA.md), bukan hasil panggilan admin worker ini. Kolom nullable di metadata bukan bukti bahwa POST dengan null diterima.

GET sampel Warehouse/AssetClass masing-masing memastikan branch null. Pengulangan ST_SHIFT GET terakhir timeout, sedangkan panggilan Shift sebelumnya, metadata, dan GET entitas lain berhasil; hasil ini dicatat di [qa-wbi/sl-readonly-summary.json](qa-wbi/sl-readonly-summary.json). Worker tidak melakukan retry tulis atau memakai JDBC sebagai jalan lain.

Belum diuji: koneksi runtime JDBC, hasil OADM.MltpBrnchs melalui datasource aplikasi, instalasi dua WAR di Tomcat/Java 8 sungguhan, upload SAP create/update dan penerimaan payload oleh SL, serta rekonsiliasi master/aset setelah posting. QA posting hanya dilakukan Fakhri. Saldo awal inventory/AP/AR/GL diisi user sendiri; tidak ada uploader saldo awal baru.


## Retail setelah persetujuan Fakhri

Sumber = tujuan WBI_TEST; WBI_KARTON hanya catatan opsi mendatang, tidak aktif. `setup.source.allow-target` bernilai false secara default dan true hanya pada profil WBI. Query sumber identik tujuan menggunakan hasil baca target yang sama, tanpa membuka koneksi sumber lain. Penjaga DB baca = CompanyDB SL tetap aktif. Karena data sama, hasil normal semua Sama tanpa baris untuk di-upload. Jalur create/update Retail disiapkan dan diuji dengan mock saja; tidak diklaim telah diterima SAP.

Metadata SL, UserTablesMD, UserObjectsMD, dan count entitas diverifikasi melalui GET. Bukti tanpa kredensial/data baris ada di [qa-wbi/retail-metadata.json](qa-wbi/retail-metadata.json). Sebelas langkah mencakup delapan kelompok katalog; Operasi/Inspeksi QC dan Tujuan/Alasan dipisah menjadi langkah yang mengikuti entity SAP.

| Langkah | Entity SL terverifikasi | Tabel header | Baris QA |
|---|---|---|---:|
| Kategori Price List | `ST_PLCATEGORY` | `@ST_PLCATEGORY` | 19 |
| Konfigurasi Price List | `ST_PLCONFIG` | `@ST_PLCONFIG` | 5 |
| Route Produksi (header + detail) | `ST_UDROUTE` | `@ST_UDRTH` | 24 |
| Operasi QC | `ST_OPERQC` | `@ST_OPERQC` | 2 |
| Tipe Inspeksi QC | `ST_INSTYPE` | `@ST_INSTYPE` | 3 |
| Mapping Tipe Inspeksi | `U_ST_INSTYPEMAP` | `@ST_INSTYPEMAP` | 2 |
| Parameter QC | `ST_PARAMQC` | `@ST_PARAMQC` | 52 |
| Kategori Kas Kecil | `STEM_PETTYCASHCAT` | `@STEM_PETTYCASHCAT` | 26 |
| Aturan Transfer Gudang | `U_STEM_RULETRANSFER` | `@STEM_RULETRANSFER` | 6 |
| Tujuan Order | `STEM_ORPURPOSE` | `@STEM_ORPURPOSE` | 4 |
| Alasan Operasional | `STEM_REASON` | `@STEM_REASON` | 3 |

Perbedaan penting dari usulan katalog awal:

- Kategori Price List tidak memiliki U_Discount di metadata; field itu tidak dimigrasi. Field terverifikasi: U_Level, U_ConfigName, U_CategoryCode, U_CategoryName, U_Active. Price List Config memakai U_Level, U_ConfigName, U_Active.
- Route memakai UDO ST_UDROUTE, tabel header @ST_UDRTH dan anak @ST_UDRTD; koleksi ST_UDRTDCollection berisi U_WCCode/U_WCDesc/U_Seq. Detail dibaca terurut LineId, dibentuk JSON tanpa delimiter, dan Code/LineId/audit tidak disalin sebagai identitas anak. Perubahan detail pada Route lama selalu Error, termasuk jika header juga berubah; server menolak PATCH koleksi detail. Ubah detail lama di SAP.
- ST_INSTYPEMAP adalah no-object UDT, endpoint **U_ST_INSTYPEMAP**, bukan anak ST_INSTYPE. Petty Cash Category adalah UDO **STEM_PETTYCASHCAT**, bukan U_STEM_PETTYCASHCAT.
- Rule Transfer adalah no-object auto increment: Code **Edm.Int32**, bukan string; tidak dikirim saat create. Pencocokan memakai gabungan lima UDF aturan, bukan Code. Duplikat gabungan di sumber ditandai Error. Key update angka divalidasi server; key UDO/master lain tetap string meskipun tampak angka.
- Server membatasi seluruh field Retail ke allowlist metadata, memeriksa tipe angka/string dan required, menolak key yang diubah, field audit/tidak dikenal, detail PATCH, serta request dengan sumber lain atau sumber kosong. Tabel header/anak harus ada; tabel header sumber wajib memiliki data sebelum upload. Tidak ada langkah untuk 111 tabel transaksi/log/buffer.

Belum terverifikasi: enum/nilai sah UDF di setiap kombinasi bisnis, kecocokan referensi antar master selain validasi akun yang sudah ada, eksekusi SELECT katalog di HANA nyata, dan penerimaan POST/PATCH Retail. Metadata menjamin nama/tipe/key yang dipublikasikan, bukan keberhasilan tulis. WBI_KARTON dan sumber lain tidak dibaca worker.

Preview lokal Retail diuji pada desktop 1440 dan HP 390 px: header WBI, Tier Retail, tidak ada tautan Farm Breeding, sumber=tujuan berstatus Sama, tanpa error console dan tanpa overflow halaman. Screenshot fixture (bukan data SAP): [desktop](qa-wbi/retail-route-desktop.png), [HP](qa-wbi/retail-route-mobile.png). Tidak ada pengujian posting SAP melalui browser.

## Warna dialihkan ke Gemini

Saat instruksi pengalihan tiba, commit warna `acb5607` sudah selesai lokal; dibatalkan utuh lewat `666c8f8`. Diff akhir CSS, warna HTML, dan CSS chat terhadap sebelum commit warna kosong. Bagian warna tidak termasuk hasil worker ini. Arsip screenshot/ulasan percobaan berada di `C:/Users/Fakhri/AppData/Local/Temp/wbi-color-handoff/` untuk referensi opsional Gemini, bukan bukti desain final. Perbaikan identitas company `9e89321` tetap dipertahankan karena termasuk bagian 5.
