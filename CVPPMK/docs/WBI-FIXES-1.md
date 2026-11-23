# WBI fixes 1: hasil worker Mac, 23 November 2026

Branch `wbi/fixes-1`, dibuat dari `wbi/ui-warna` (`57b76b5`, mencakup `7b9c16e`). Semua pengujian memakai fixture/mock; tidak menyambung ke SAP, WBI_TEST, atau HANA. Commit lokal saja, tanpa push dan tanpa `git add -A`.

## Hasil

- **Mode lihat memang mengizinkan PIC + status lalu Simpan.** Server sudah membatasi perubahan selain dua field itu. Ditemukan bug nyata: Simpan di WBI tetap menimpa 7 PIC kegiatan konsultan menjadi STEM, meskipun layar WBI mengizinkan PIC bebas. Guard company sekarang konsisten pada tampilan, editor admin, dan Simpan. PIC WBI yang tidak diubah tetap kosong; CV tetap memakai PIC STEM pada 7 kegiatan yang sama. Panduan PIC WBI mengikuti perilaku ini.
- Tanggal, jam, judul, catatan, identitas proyek, dan struktur kegiatan tetap hak admin. Gagal membaca akses sekarang tetap mengunci editor admin. Tes HTTP Java memakai sesi non-admin dan folder sementara `wbi/schedule/`; penolakan perubahan terlarang tidak menaikkan revisi.
- Uji CV menemukan bug lama sebelum data jadwal masuk: render awal membaca `doc.data` ketika `doc` masih null. Guard awal diperbaiki; fixture company kosong sekarang dapat memuat jadwal, dengan aturan PIC/branch CV tetap berlaku.
- **Paging bersama** di `js/paging.js`, dipakai `table`, `searchable`, dan `expandList`: bawaan 25, pilihan 25/50/100, Sebelumnya/Berikutnya, Halaman X dari Y, dan rentang x-y dari N. Pencarian/filter dilakukan sebelum paging dan memulai lagi dari halaman 1. Pencarian isi child tetap menjangkau parent pada halaman lain.
- Toggle **Tampilkan yang kosong** tersimpan di browser per tabel/menu; jumlah yang disembunyikan tampil. Tabel/parameter/field katalog yang tidak tersedia atau kosong tidak menghasilkan temuan. Saat ditampilkan, statusnya netral. Menu Addon kosong juga dikeluarkan dari pembilang/penyebut review di Check List dan Home, termasuk saat toggle aktif.
- Fixture Daftar UDT: **172 tabel = 60 berisi + 112 kosong**, tampil 25 per halaman. Jumlah field 0 sendiri **bukan** bukti tabel kosong: tabel Code/Name tanpa UDF dapat berisi data yang sah. Statistik yang tidak tersedia tetap terlihat sebagai belum diketahui, bukan dibuat 0.
- Export memakai seluruh hasil filter. File [hasil unduhan nyata](qa-fixes-1/filtered-udt.xlsx) berisi **99 baris data + 1 header**, ketika layar hanya menampilkan 25 baris. Untuk UDO dengan child, ekspor mencakup semua header hasil filter dan seluruh child terkait, bukan halaman aktif saja. Parent dengan UDF kosong tetapi mempunyai child tetap ditampilkan.
- **Non-branch berdasarkan GET `api/setup/capabilities`**, sama dengan Setup: `SetupController.branchMode()` memeriksa kesamaan DB baca/SL lalu membaca `OADM.MltpBrnchs`. Tidak menebak dari nama/kode WBI; flag null/gagal mempertahankan pemeriksaan branch. Tidak ada endpoint SAP yang dipanggil selama tes.
- Company tanpa branch: **11 key STEM, 1 tabel TI Branch, 10 UDF STEM, dan 8 UDF Breeding** khusus branch disaring dari katalog. Key bersama seperti WHTRS, tipe gudang, dan tipe ITR tetap ada. Parameter branch juga disaring pada halaman generik `@ST_PARAM`. Catatan jumlah yang disembunyikan muncul pada bagian terkait. KPI Branch Ringkasan/Warehouse, warning assignment BP/user, panel/filter assignment BP, kolom branch Warehouse/User/COA, dan pemeriksaan organisasi branch mengikuti flag yang sama.
- Warna/token Gemini tidak diubah. Penambahan CSS hanya komponen pager dan toggle menu, memakai token yang sudah ada.

## Audit seluruh halaman bab 5 dan mesin bab 7

| Halaman | Sumber dan apa yang diperiksa | Perlakuan kosong |
|---|---|---|
| 5.1 UDO | `sql/udo/01_udo.sql`: registrasi OUDO, tipe, header, kemampuan series/cancel/log, daftar child UDO1; bukan pemeriksaan isi transaksi. Metadata jumlah baris memakai `api/addon/objects` yang juga dipakai bab 7. | UDO dengan total header + child 0 disembunyikan; data tidak diketahui tetap terlihat. Tidak ada temuan otomatis khusus UDO sebelumnya maupun sesudahnya. |
| 5.2 UDT | `sql/udt/01_udt.sql`: OUTB, jumlah CUFD, pemakai OUDO/UDO1. `02_addon_rows.sql`: SYS.TABLES + SYS.M_TABLES per schema. `03_addon_params.sql`: key/nilai/deskripsi @ST_PARAM. `addon-sections.js` membandingkan katalog STEM/Breeding pada `addon-data.js`/`breeding-data.js`. | Baris data 0, katalog tabel tidak tersedia, dan parameter blank/tidak ada disembunyikan dan tidak menjadi temuan. Statistik null tetap belum diketahui. Katalog branch disaring sebelum KPI, temuan, tabel, dan ekspor. |
| 5.3 UDF | `01_by_table.sql` + `02_fields.sql`: definisi CUFD di tabel standar, mengecualikan UDT dan salinan arsip; object dengan definisi identik dikelompokkan. `03_addon_udf.sql`: alias pada tabel relevan dan BRANCH. Membandingkan keberadaan definisi UDF dengan katalog, bukan membaca isi transaksi untuk tiap field. | Daftar definisi aktual tidak membuat baris untuk object tanpa field. Entri kebutuhan UDF yang belum terpasang disembunyikan/netral, tidak menjadi masalah. UDF khusus branch disaring sebelum hitungan. Nilai default kosong pada definisi UDF yang sah tidak membuat definisinya dianggap kosong. |
| 5.4 Saved Query | `01_categories.sql`: OQCN dan jumlah OUQR. `02_queries.sql`: kategori/nama/panjang teks/tanggal dibuat/terakhir dijalankan; kategori sistem disaring. Halaman ini **tidak mengeksekusi saved query**. | Kategori 0 query dan entri dengan panjang teks 0 disembunyikan, bisa ditampilkan lewat toggle; tidak ada temuan otomatis khusus sebelumnya maupun sesudahnya. |
| 7: UDT No Object | `AddonController.objectList`: OUTB tipe 0/5 yang bukan tabel UDO + mapping kategori/judul/hide. `data`: Code/Name dan seluruh UDF melalui UdfExpander. | Menu dengan jumlah baris 0 disembunyikan dan tidak masuk review; nilai UDF yang seluruhnya blank bisa disaring pada tabel data. @ST_PARAM memakai nilai U_Value untuk menentukan kosong. |
| 7: UDO Master Data | OUDO tipe 1 + UDO1 + OUTB + mapping. Header/child ditautkan lewat Code; kolom dibaca dinamis. | Menu dihitung kosong hanya jika seluruh header + child diketahui 0; parent yang mempunyai child tidak disembunyikan hanya karena UDF header kosong. |
| 7: UDO Document sebagai master | OUDO tipe 3 hanya masuk menu bila mapping `master` aktif. Header DocEntry/DocNum, child ditautkan lewat DocEntry; mesin paging/search/export yang sama. | Kebijakan kosong sama dengan UDO Master Data. Jalur kode diperiksa; fixture browser utama menggunakan UDT dan UDO Master Data, belum UDO Document nyata. |

Pemeriksaan nilai UDF di luar valid values pada master data lain tetap ada. Bab 4.4 procedure/function juga tetap memiliki pemeriksaan keberadaan objek; perubahan ini tidak menghilangkan pemeriksaan tersebut.

## Bukti uji

| Pengujian | Hasil |
|---|---|
| Java pada **JDK 8** | **123 lulus, 0 gagal, 0 skip**; termasuk 5 tes baru permissions/namespace/count, serta matriks Setup branch/non-branch yang sudah ada. [Log](qa-fixes-1/java8-tests.log) |
| Node.js | **207 terdaftar: 189 lulus, 0 gagal, 18 skip**. Dua puluh tes baru mencakup paging, katalog/temuan, kapabilitas, company kosong, branch, dan statistik tidak diketahui. [Log](qa-fixes-1/js-tests.log) |
| Chrome dengan Playwright terpasang | **13 skenario lulus**, 0 exception JavaScript; 13 route diperiksa pada desktop 1440px dan HP 390px, tanpa overflow halaman. Termasuk Simpan non-admin WBI, regresi PIC CV/branch, persistensi toggle, pencarian lintas halaman/child, hitungan review, dan unduhan XLSX. [Hasil](qa-fixes-1/browser-evidence.json) |
| Screenshot fixture sebelum/sesudah | **60 PNG**: 13 route + 2 fokus (pager UDT dan parameter STEM), masing-masing sebelum/sesudah × desktop/390px. [Daftar](qa-fixes-1/SCREENSHOTS.md) |
| Perubahan source | `git diff --check` bersih; tes palet warna yang sudah ada lulus. |

Perintah utama (dari `CVPPMK`):

```sh
JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk1.8.0_291.jdk/Contents/Home mvn -B -o '-DargLine=-Xmx256m' test
node --test --test-concurrency=1 src/test/js/*.test.mjs
PLAYWRIGHT_MODULE=/Users/fakhridhiya_/Desktop/Mac-Kerja/_tools/pw/node_modules/playwright/index.mjs node src/test/js/fixes-ui.browser.mjs
git diff --check
```

Maven pertama mengisi cache dependensi dari Maven Central; pengujian akhir JDK 8 berjalan offline. Tidak menjalankan brew/npm/pip install. Server preview hanya bind `127.0.0.1`; browser membatalkan permintaan selain localhost.

Untuk reproduksi browser, jalankan 3 server fixture dari root repo pada terminal terpisah: port 18635 untuk source sekarang, 18636 dengan `PREVIEW_STATIC_ROOT` menunjuk hasil `git archive wbi/ui-warna CVPPMK/src/main/resources/static`, serta `PREVIEW_COMPANY=cv PREVIEW_PORT=18637` untuk CV. Setiap server memakai `node CVPPMK/src/test/js/preview-server.mjs`; port bawaan 18635, override melalui `PREVIEW_PORT`. Browser perlu Chrome dan Playwright yang sudah terpasang; skrip tidak memasang paket.

## Batas yang belum teruji

- **18 tes lama berbasis jsdom dilewati** karena jsdom tidak tersedia: Count Document/Query/Print dan navigasi. Tidak memasang paket tanpa izin. Pengujian browser di atas adalah bukti tambahan untuk ruang lingkup ini, bukan klaim bahwa 18 tes itu lulus.
- Tidak menguji koneksi, hak akses/statistik SYS.M_TABLES, query HANA, SAP/SL sungguhan, deployment WAR/Tomcat, atau data hidup WBI/CV. Jumlah baris pada UI mengikuti statistik yang disediakan server; statistik yang tidak tersedia sengaja tidak diperlakukan sebagai kosong.
- Batas lama backend **5.000 baris per tabel Addon** tetap berlaku dan pesan truncation tetap tampil. Ekspor mencakup semua hasil filter yang dimuat server; belum mengubah API menjadi paging server untuk data di atas batas itu.
- Perbandingan screenshot memakai fixture yang sama, bukan screenshot lingkungan SAP. Tabel lebar tetap dapat digeser horizontal di dalam wadahnya; halaman 390px tidak meluap.

## Commit lokal

- `e39816c`: perbaikan mode lihat/PIC, paging bersama, filter kosong/non-branch, dan fixture/tes.

Commit dokumentasi bukti menyusul commit implementasi; daftar final dua commit dilaporkan ke koordinator.
