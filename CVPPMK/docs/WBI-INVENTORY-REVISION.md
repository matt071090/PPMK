# Inventory WBI per lokasi dan PIC STEM

Branch `wbi/fixes-1`, melanjutkan `9d693d5`; commit lokal tanpa push.

- **40 kegiatan** = 18 milestone + 16 master + 6 balance. Tambahan: 4 milestone Toko / Store dan 1 baris saldo awal lokasi itu untuk Ringkasan per area/Beginning Balance, mengikuti susunan Produksi / Pabrik / Central Kitchen.
- Produksi / Pabrik / Central Kitchen: opname 29 s/d 31 Desember, cut off 31 Desember, serah 19:00, upload 19:00-20:00; semua tanggal/jam yang sudah ada dipertahankan.
- Toko / Store: opname dan cut off mengikuti lokasi produksi, serah paling lambat 31 Desember 2026 **22:00**. **ASUMSI:** upload setelah serah ke STEM (setelah 22:00), tanpa jam selesai. Tanggal upload 31 Desember adalah penempatan draft mengikuti tanggal serah, tidak menetapkan jam selesai; admin bisa mengubah tanggal/catatan.
- Istilah lengkap berasal dari judul seed, bukan hardcode lokasi di JS. Kartu sempit menggunakan **Produksi/Pabrik** dan **Toko/Store** (dua bagian pertama nama lokasi); judul bagian, kegiatan, catatan dan Aturan memuat istilah lengkap.
- Alur inventory menjadi dua alur berisi 4 tahap masing-masing. Ringkasan menjadi 6 area; garis waktu utama 12 kartu. WBI tetap 4 tab tanpa Training. Pada 23 November, Kick Off tetap 8 hari lagi.
- Seed CV tidak berubah: blob `8a63c81e80863caa1d84480fdcd04f560941f501`, 37 kegiatan, 5 area dan satu alur inventory. Tidak ada migrasi berkas jadwal lama.

## PIC STEM

Pesan terbaru menggantikan aturan WBI sebelumnya. Delapan kegiatan berikut diberi `pic=STEM` pada seed; 32 kegiatan lain tetap kosong, seluruh status awal `belum`.

| ID | Judul |
|---|---|
| `upload-master` | Upload master data ke DB live |
| `inventory` | Serah inventory Produksi / Pabrik / Central Kitchen ke STEM |
| `inventory-upload` | Upload inventory Produksi / Pabrik / Central Kitchen ke SAP |
| `inventory-toko` | Serah inventory Toko / Store ke STEM |
| `inventory-upload-toko` | Upload inventory Toko / Store ke SAP |
| `ap-ar` | Upload A/P dan A/R |
| `fa` | Upload Fixed Asset |
| `gl` | Upload G/L |

Daftar ini mengikuti arahan bahwa serah ke STEM dan upload oleh STEM adalah kegiatan STEM; nama/judul di atas dapat dikonfirmasi Fakhri. Opname, cut off, dan checklist saldo awal tetap PIC bebas.

Server menurunkan daftar ID terkunci dari penanda PIC di seed, lalu mengirimkannya melalui `schedule/access`; UI memakai helper yang sama dengan pola CV dan tidak memiliki daftar WBI terpisah. Tabel menampilkan PIC terkunci dengan simbol gembok. Non-admin tetap dapat mengubah status, tetapi server menolak penggantian PIC STEM (403). Simpan tidak menimpa PIC non-STEM. **ASUMSI:** admin boleh mengganti PIC STEM melalui editor; nilai override admin tetap dipertahankan saat non-admin menyimpan status.

## Bukti

- Java JDK 8: **169 lulus, 0 gagal/error/skip**, termasuk larangan mengganti PIC STEM, status tetap boleh, override admin, dan jam per lokasi. [Log](qa-wbi-inventory/java8-tests.log).
- JS: **214 terdaftar, 196 lulus, 0 gagal, 18 skip** karena jsdom tidak tersedia. [Log](qa-wbi-inventory/js-tests.log).
- Chrome: **1 skenario integrasi, 5 pemeriksaan kelompok lulus, 0 exception JS**; snapshot 1440px dan 390px tanpa overflow halaman. [Hasil](qa-wbi-inventory/browser-evidence.json).
- Alur inventory: [desktop](qa-wbi-inventory/inventory-desktop.png), [390px](qa-wbi-inventory/inventory-mobile.png); tabel PIC: [desktop](qa-wbi-inventory/pic-table-desktop.png), [390px](qa-wbi-inventory/pic-table-mobile.png). Screenshot komponen menyembunyikan header/floating chat sementara supaya tidak menutupi komponen panjang.

Perintah: `JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk1.8.0_291.jdk/Contents/Home mvn -B -o -f CVPPMK/pom.xml -DargLine=-Xmx256m test`; `node --test --test-concurrency=1 CVPPMK/src/test/js/*.test.mjs`; `PLAYWRIGHT_MODULE=/Users/fakhridhiya_/Desktop/Mac-Kerja/_tools/pw/node_modules/playwright/index.mjs node CVPPMK/src/test/js/wbi-schedule.browser.mjs`.

Browser memakai preview lokal WBI 18635, CV 18637, serta admin WBI 18638 (`PREVIEW_ADMIN=1`). Tidak menyambung SAP/HANA, memasang paket, mengubah warna/CSS, atau menyentuh berkas jadwal user. Deployment dan data hidup belum diuji.
