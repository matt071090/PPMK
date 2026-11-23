# Koreksi PIC serah dan upload WBI

Koreksi ini menggantikan penetapan PIC serah dalam laporan inventory sebelumnya. **40 kegiatan tetap: 6 STEM terkunci, 34 bebas dengan PIC kosong di seed; seluruh status awal tetap belum.** Perubahan produksi hanya dua nilai PIC pada `default-wbi.json`: `inventory` dan `inventory-toko`, dari STEM menjadi kosong. Tanggal, jam, judul, catatan, status, warna dan seed CV tidak diubah.

Kunci PIC server/UI berasal dari penanda STEM pada seed, sehingga tidak memerlukan perubahan kode aplikasi. Non-admin dapat memilih user WBI atau mengetik PIC untuk kedua kegiatan serah, lalu Simpan; enam kegiatan upload tetap STEM terkunci dan statusnya dapat diubah. Seed CV juga membedakan `Serah inventory ke STEM` (PIC kosong) dan `Upload inventory ke SAP` (STEM).

**Kartu gabungan serah & upload:** `ap-ar`, `fa`, dan `gl` tetap milestone berjudul Upload dengan PIC STEM, sama persis dengan CV. Judul Serah & upload hanya ringkasan visual rentang tanggal, bukan kegiatan baru dengan pemilik tunggal. Baris Beginning Balance A/P, A/R, Fixed Asset, G/L tetap PIC bebas (sama dengan CV) untuk kesiapan/serah data oleh tim WBI; milestone upload mencatat pekerjaan STEM. Tidak ada kegiatan lain berjudul Serah dalam seed selain dua kegiatan inventory tersebut.

## Audit seluruh 40 kegiatan

| ID | Judul | PIC | Alasan |
|---|---|---|---|
| kickoff | Kick Off | Bebas (kosong) | Koordinasi proyek, PIC dapat dipilih tim WBI; mengikuti seed CV. |
| prepare | Persiapan dan validasi data master | Bebas (kosong) | Penyiapan dan validasi data oleh tim terkait WBI; mengikuti seed CV. |
| deadline | Batas akhir data dari user | Bebas (kosong) | Penyerahan data dari user WBI; mengikuti seed CV. |
| upload-master | Upload master data ke DB live | STEM terkunci | Upload ke DB live oleh STEM; PIC seed CV juga STEM. |
| verify | Go Live Master Data: verifikasi saja | Bebas (kosong) | Verifikasi master oleh tim terkait WBI; mengikuti seed CV. |
| opname | Stock Opname Produksi / Pabrik / Central Kitchen | Bebas (kosong) | Hitung fisik oleh tim WBI di lokasi masing-masing. |
| cutoff | Cut off inventory Produksi / Pabrik / Central Kitchen | Bebas (kosong) | Penghentian/perapian inventory oleh tim WBI di lokasi masing-masing. |
| inventory | Serah inventory Produksi / Pabrik / Central Kitchen ke STEM | Bebas (kosong) | Tim WBI menyerahkan hasil inventory kepada STEM. |
| inventory-upload | Upload inventory Produksi / Pabrik / Central Kitchen ke SAP | STEM terkunci | Upload inventory ke SAP oleh STEM; PIC seed CV juga STEM. |
| opname-toko | Stock Opname Toko / Store | Bebas (kosong) | Hitung fisik oleh tim WBI di lokasi masing-masing. |
| cutoff-toko | Cut off inventory Toko / Store | Bebas (kosong) | Penghentian/perapian inventory oleh tim WBI di lokasi masing-masing. |
| inventory-toko | Serah inventory Toko / Store ke STEM | Bebas (kosong) | Tim WBI menyerahkan hasil inventory kepada STEM. |
| inventory-upload-toko | Upload inventory Toko / Store ke SAP | STEM terkunci | Upload inventory ke SAP oleh STEM; lokasi Toko mengikuti pola upload CV. |
| golive | Go Live | Bebas (kosong) | Koordinasi dan pelaksanaan operasional WBI; mengikuti seed CV. |
| ap-ar | Upload A/P dan A/R | STEM terkunci | Milestone upload oleh STEM; PIC seed CV juga STEM. |
| fa | Upload Fixed Asset | STEM terkunci | Milestone upload oleh STEM; PIC seed CV juga STEM. |
| gl | Upload G/L | STEM terkunci | Milestone upload oleh STEM; PIC seed CV juga STEM. |
| final | Batas akhir semua upload | Bebas (kosong) | Pemantauan batas akhir kegiatan, bukan pekerjaan upload tersendiri; mengikuti seed CV. |
| master-A0 | COA | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| master-A1 | VAT & WTAX | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| master-A2 | Payment Terms | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| master-A3 | GL Account Determination | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| master-A4 | Asset Class | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| master-B0 | Item Group | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| master-B1 | Vendor Group | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| master-B2 | Customer Group | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| master-B3 | Project & Sales Employee | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| master-C0 | Profit/Cost Center | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| master-C1 | Dimension | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| master-C2 | Bank & House Bank | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| master-C3 | Warehouse & Bin Location | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| master-D0 | Business Partner | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| master-D1 | Item Master | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| master-E0 | Add-On Master Data (STEM, Retail, iReapBiz) | Bebas (kosong) | Penyiapan/konfirmasi master data oleh tim terkait WBI; checklist CV juga PIC bebas. |
| balance-inv | Inventory Produksi / Pabrik / Central Kitchen | Bebas (kosong) | Kesiapan/penyiapan dan serah saldo oleh tim WBI; baris balance CV juga PIC bebas. |
| balance-inv-toko | Inventory Toko / Store | Bebas (kosong) | Kesiapan/penyiapan dan serah saldo oleh tim WBI; baris balance CV juga PIC bebas. |
| balance-ap | A/P | Bebas (kosong) | Kesiapan/penyiapan dan serah saldo oleh tim WBI; baris balance CV juga PIC bebas. |
| balance-ar | A/R | Bebas (kosong) | Kesiapan/penyiapan dan serah saldo oleh tim WBI; baris balance CV juga PIC bebas. |
| balance-asset | Fixed Asset | Bebas (kosong) | Kesiapan/penyiapan dan serah saldo oleh tim WBI; baris balance CV juga PIC bebas. |
| balance-ledger | G/L | Bebas (kosong) | Kesiapan/penyiapan dan serah saldo oleh tim WBI; baris balance CV juga PIC bebas. |

## Bukti dan batas pengujian

- Java JDK 8: **184 lulus, 0 gagal/error/skip** ([log](qa-wbi-handover-pic/java8-tests.log)), termasuk dua kegiatan serah pada jadwal baru dan berkas lama dengan PIC STEM, serta penolakan perubahan PIC pada masing-masing enam upload dan penerimaan perubahan statusnya.
- JS: **225 terdaftar, 207 lulus, 18 skip** karena jsdom tidak tersedia, 0 gagal ([log](qa-wbi-handover-pic/js-tests.log)); tes memastikan semua judul Serah bebas, enam upload mengikuti PIC CV, dan nilai STEM lama tidak membuat serah terkunci.
- Chrome fixture sesi terkunci: **1 skenario / 5 kelompok pemeriksaan, 7 screenshot, 0 exception JS**, tanpa overflow halaman 390px. PIC serah Produksi dipilih melalui dropdown WBI, PIC serah Toko diisi teks bebas; keduanya tersimpan dan PIC upload tetap STEM. Screenshot desktop/390px dan bukti terdapat di `qa-wbi-handover-pic/`.
- Jadwal lama tidak dimigrasikan atau ditimpa: setelah aplikasi dimuat ulang memakai seed baru, kedua PIC serah bebas diedit meskipun nilai lama masih STEM. Tes Java memuat ulang store berkas lama untuk membuktikannya. PIC yang sudah diisi tetap dipertahankan sampai pengguna mengubahnya.
- CV tetap 37 kegiatan dan seed CV tetap blob `8a63c81e80863caa1d84480fdcd04f560941f501`. Tidak ada koneksi SAP/SL/HANA, instalasi paket atau push. Data/deployment nyata dan tes jsdom yang dilewati belum teruji.

Perintah: `JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk1.8.0_291.jdk/Contents/Home mvn -B -o -f CVPPMK/pom.xml '-DargLine=-Xmx256m' test`; `node --test --test-concurrency=1 CVPPMK/src/test/js/*.test.mjs`; browser dijalankan dengan Playwright yang sudah tersedia melalui `wbi-schedule.browser.mjs` dan server fixture lokal pada port 18635/18637/18638.
