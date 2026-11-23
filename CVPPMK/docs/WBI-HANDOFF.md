# Serah terima WBI — 23 November 2026

Bagian 1–5 dan Retail selesai di branch lokal **wbi/main** pada workspace `C:/Users/Fakhri/orca/workspaces/PPMK/razorbill`. `main` tetap `ab74c0c`; tidak ada push atau `git add -A`. Seluruh staging memakai satu nama berkas per perintah. Bagian warna sudah dialihkan ke Gemini dan perubahan warna worker dibatalkan utuh.

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

- **Java: 116 lulus, 0 gagal/error/skipped** — SetupController 64, CompanyData 21, Retail 31. Termasuk matriks branch/non-branch × kosong/0/valid/tak dikenal pada create/update, katalog CV utuh, namespace/seed/atomic/revisi, akses chat, field/key/detail Retail dan sumber kosong/tidak sah.
- **JavaScript: 129 lulus, 0 gagal/skipped**. Termasuk matriks browser/template/payload, favicon, nama ekspor/browser namespace, serta sumber=target dan detail Route.
- **Dua build clean package berhasil** dari wbi/main: profil default menghasilkan [cvppmk.war](../target/cvppmk.war), `-Pwbi` menghasilkan [wbi.war](../target/wbi.war). Resource profil masing-masing telah diperiksa, bytecode Java 8, WBI tidak membundel konfigurasi lokal CV. Angka tes dan SHA-256 artefak: [verification.json](qa-wbi/verification.json).
- UI fixture Retail diuji 1440 px dan 390 px; company WBI, Tier Retail, tidak ada link Farm Breeding, status Sama, console bersih dan tidak ada overflow halaman. Screenshot: [desktop](qa-wbi/retail-route-desktop.png), [HP](qa-wbi/retail-route-mobile.png). Fixture tidak menyambung SAP.
- SL nyata: Login/metadata berhasil; BusinessPlaces **0**; sampel Warehouse.BusinessPlaceID dan AssetClass.BPLID **null**; metadata dan GET Shift sebelumnya tidak memiliki U_BRANCH. Pengulangan Shift GET terakhir timeout. [Bukti baca SL](qa-wbi/sl-readonly-summary.json).
- Sebelas entity Retail terverifikasi lewat GET metadata/UDT/UDO/count: 19, 5, 24, 2, 3, 2, 52, 26, 6, 4, 3 baris sesuai urutan katalog. [Metadata bersih](qa-wbi/retail-metadata.json). Koreksi katalog: Petty Cash memakai STEM_PETTYCASHCAT; Inspection Mapping U_ST_INSTYPEMAP; Rule Transfer Code angka auto increment; U_Discount Price Category tidak ada.

Worker hanya memakai POST Login dan SL GET, **tanpa JDBC/SQL nyata dan tanpa POST/PATCH/DELETE master/dokumen**. EnableBranches=tNO berasal dari survei Gemini; worker tidak memverifikasi ulang flag admin karena GET ditolak 400 dan metode yang dipublikasikan memerlukan POST selain Login. Aplikasi tetap membaca OADM lewat datasource saat dijalankan Fakhri, bukan menebak flag dari branch kosong.

## Langkah berikut oleh Fakhri/koordinator

Isi variabel lingkungan sesuai [BUILD-WBI.md](BUILD-WBI.md), jalankan aplikasi dan verifikasi runtime JDBC/OADM serta dua WAR di Tomcat. Host/port diketahui dari konfirmasi Fakhri; koneksi JDBC belum diuji worker. POST/PATCH dan enum/referensi UDF Retail belum diuji; metadata bukan bukti penerimaan tulis. Detail Route lama harus diubah di SAP. Saldo awal diisi manual.

Gemini mengerjakan warna setelah commit ini; regresi fungsi/tes sesudah perubahan Gemini merupakan pekerjaan berikutnya. Arsip percobaan warna yang dibatalkan tersedia di `C:/Users/Fakhri/AppData/Local/Temp/wbi-color-handoff/` bila diperlukan, bukan desain final yang disetujui.
