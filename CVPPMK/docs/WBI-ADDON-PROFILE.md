# Pengelompokan Addon WBI

Konfigurasi company memilih `addon-mapping-wbi.json` melalui `company/wbi.json`; kode UI tidak memeriksa `code === 'wbi'`. Mesin mapping lama tetap dipakai. Company kosong tetap memakai mapping CV tanpa transformasi; `addon-mapping.json` asli tidak diubah.

- Kelompok: **Retail & iReapBiz**, **STEM Base**, **WebPortal SAP**. Dokumen web, daily stock, buffer/import/log masuk **Transaksi/Log**; kode yang belum dikenali masuk **Lainnya**.
- **Master Report Web / STEM_REPORTWEB** masuk WebPortal SAP, meskipun mapping lama menandainya Farm. Normalisasi diterapkan saat membaca, termasuk bila file mapping runtime lama sudah ada; tidak perlu menghapus mapping pengguna. Judul/hide/master dan kategori khusus pengguna dipertahankan, kecuali kategori legacy dan pengecualian company yang tegas.
- **33 prefix Farm** mencakup header/child Plan, Statistic, Setter/Hatcher, Transfer, Type of Statistic, Standard, audit/survey serta objek Farm yang terdaftar dalam konfigurasi lama. Tabel/UDO/UDF terkait tidak masuk daftar/menu/hitungan; checkbox kosong tidak menampilkannya kembali. Rework/Post Rework tetap STEM Base sesuai inventaris WBI.
- Katalog pembanding WBI memiliki 20 tabel STEM Base, 21 Retail/iReapBiz, 8 WebPortal (49 sebelum penyaringan branch). Sebelas parameter branch, tabel TI Branch dan UDF branch tetap disaring menurut **flag server**, bukan nama company; null mempertahankan pemeriksaan. Katalog Farm tidak menghasilkan temuan WBI; 35 key unik Farm di ST_PARAM disaring, WHTRS yang dipakai bersama tetap terlihat.
- Nama header/child yang belum diberikan lengkap tidak ditebak. Rule keluarga tetap mengelompokkan metadata aktualnya. Kebutuhan key/UDF Retail baru tidak dikarang: katalog field/parameter yang dapat dibuktikan tetap STEM Base; daftar aktual UDT/UDF masih ditampilkan dinamis dengan filter company.

## Halaman yang diperiksa

| Halaman | Sumber/cek dan perubahan WBI |
|---|---|
| 5.1 UDO | OUDO + UDO1; jumlah isi dari metadata objek. Header/kode Farm disaring sebelum KPI, tabel dan ekspor. |
| 5.2 UDT | OUTB, CUFD, OUDO/UDO1; `addon_rows` menghitung isi metadata; ST_PARAM key/nilai. Daftar aktual membuang tabel Farm; pembanding memakai tiga katalog company, bukan Breeding. |
| 5.3 UDF | Definisi CUFD dan alias kebutuhan. Tabel Farm disaring; katalog kebutuhan Farm tidak dipakai. Field standar bersama tetap dipertahankan. |
| 5.4 Saved Query | OQCN/OUQR: jumlah query, nama, panjang, tanggal; query tidak dieksekusi. Aturan kosong/paging tetap seperti implementasi sebelumnya; tidak ada dasar untuk menebak pemilik query dari namanya. |
| 7: UDT/UDO master/document | OUTB/OUDO/UDO1 + mapping: kategori ditentukan dari kode atau tabel header/child. Kebijakan kosong berlaku sesudah penyaringan company/branch. Header/child dibaca dan diekspor oleh mesin generik yang sama; paging 25/50/100 tetap. |
| 7: ST_PARAM | Key Farm yang unik serta key khusus branch disaring sebelum tabel, pencarian dan ekspor; hitungan catatan branch hanya menghitung yang disembunyikan karena branch. |
| 4.4 SP dan Ringkasan | Pembanding memakai katalog aktif; procedure/function Farm yang dikenal dan object Farm pada hasil parser tidak ditampilkan. SP utama SAP dan Rework tetap diperiksa. Ringkasan/review tidak mendapatkan halaman Farm atau entri kosong. |

Query lengkap dan kriteria kosong tiap mesin sudah dicatat di `WBI-FIXES-1.md`, bagian audit bab 5/7; tidak ada query baru atau koneksi data yang dijalankan oleh worker.

## Bukti lokal

- Java JDK 8: **176 lulus, 0 gagal/error/skip**, termasuk mapping CV tanpa transformasi, grup WBI, normalisasi mapping lama, header/child, endpoint publik dan validator jam 24:00.
- Node: **223 terdaftar, 205 lulus, 18 skip**, 0 gagal; skip karena jsdom tidak tersedia. Empat tes baru menguji pemilihan katalog, pengecualian Farm/branch, parameter bersama, kosong dan hitungan review.
- Chrome fixture dengan sesi Setup terkunci: **3 kelompok pemeriksaan**, 0 exception; Setup capabilities 403, company 200; bab 5.1/5.2/5.3 dan ST_PARAM disaring; toggle kosong tidak menambah denominator review.
- Sidebar CV sebelum/sesudah identik byte demi byte, SHA-256 **5114df44993fe33fcd70364465a38f4ce4e8a1afea0cfa61bc0412b5ca0c8dab**. Snapshot source sebelum = `7f79802`, API fixture CV sama pada kedua versi.
- **8 PNG** sebelum/sesudah WBI dan CV, masing-masing 1440px/390px; tidak ada overflow halaman. Sebelum WBI memakai mapping legacy; sesudah Master Report Web berada di WebPortal. Snapshot HTML, hasil browser dan kedua log ada di `qa-wbi-addon/`.

## Yang belum dapat dipastikan

Inventaris 71/61/37 UDT dari koordinator berjumlah 169, sedangkan daftar yang disebut user 172; tanpa dump lengkap belum dapat menentukan tiga sisanya ataupun membuktikan jumlah per kelompok pada DB nyata. `ST_PARAMREPORT` (sebelumnya berlabel Farm) belum punya bukti pemilik yang tegas, sehingga sengaja masuk **Lainnya**; tidak disembunyikan atau dianggap Retail. Semua kode lain yang belum cocok rule juga tetap Lainnya.

Belum diuji: koneksi SAP/SL/HANA, data company tersimpan, file mapping runtime di deployment nyata, parser atas SP WBI asli, dan 18 tes jsdom. Fixture browser mewakili keluarga objek, bukan salinan seluruh 172 tabel. Tidak ada push, instalasi paket, perubahan warna/token, atau migrasi jadwal.

Perintah validasi (tanpa instalasi paket):

```sh
JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk1.8.0_291.jdk/Contents/Home mvn -B -o -f CVPPMK/pom.xml '-DargLine=-Xmx256m' test
node --test --test-concurrency=1 CVPPMK/src/test/js/*.test.mjs
PLAYWRIGHT_MODULE=/Users/fakhridhiya_/Desktop/Mac-Kerja/_tools/pw/node_modules/playwright/index.mjs node CVPPMK/src/test/js/addon-company.browser.mjs
PLAYWRIGHT_MODULE=/Users/fakhridhiya_/Desktop/Mac-Kerja/_tools/pw/node_modules/playwright/index.mjs node CVPPMK/src/test/js/wbi-schedule.browser.mjs
git diff --check
```

Blob Git seed CV tetap `8a63c81e80863caa1d84480fdcd04f560941f501`; mapping CV tetap `36e03d16707742c794bb6ce3842763adf8ce0a33`.

Untuk mengulang browser: jalankan `preview-server.mjs` default di 18635, `PREVIEW_COMPANY=cv` di 18637 dan `PREVIEW_ADMIN=1` di 18638 untuk inventory; skenario Addon memakai `PREVIEW_ADDON_PROFILE=1` di 18639 (WBI) dan 18640 (CV). Kedua baseline memakai static source `7f79802` melalui `PREVIEW_STATIC_ROOT`: CV di 18636, WBI di 18641 dengan `PREVIEW_LEGACY_ADDON=1`. Set port melalui `PREVIEW_PORT`; semuanya hanya listen di loopback dan memakai fixture. Snapshot static sementara dan seluruh server ditutup setelah pengujian.
