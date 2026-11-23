# Revisi jadwal WBI: 23 November 2026

Branch `wbi/fixes-1`, melanjutkan `e8c5f94`. Commit lokal saja; tidak push dan tidak mengakses SAP/HANA.

- Seed WBI sekarang **35 kegiatan**, dari 37 dikurangi `training` dan `training-1`: **14 milestone + 16 master + 5 balance**. Tidak ada section/item/teks Training atau Farm di `default-wbi.json`.
- Tahap E: **Add-On Master Data (STEM, Retail, iReapBiz)**.
- Stock Opname tetap **satu kegiatan, 29 s/d 31 Desember 2026**, dengan catatan: **Pabrik dan Toko. Hitung fisik oleh Tim WBI, tanpa penerimaan/pengiriman.** Lokasi muncul pada kartu Stock Opname di Ringkasan, kartu Hitung fisik pada Alur inventory, catatan kegiatan, dan Aturan. Tidak menambah tanggal atau membagi lokasi menjadi kegiatan baru.
- Semua tanggal/jam pada 35 kegiatan yang dipertahankan sama dengan sebelumnya. Go Live tetap 1 Januari 2027; pada tanggal uji 23 November, Kick Off 1 Desember tetap **8 hari lagi**.
- Renderer bersama hanya disesuaikan untuk membaca keberadaan section Training dari dokumen jadwal dan menampilkan catatan opname WBI dari seed. WBI baru mempunyai **4 tab**: Ringkasan, Master Data, Stock Opname, Beginning Balance. Topik diskusi juga mengikuti tab, dan URL Training lama kembali ke Ringkasan bila section sudah tidak ada.
- **Seed CV `default.json` tidak berubah satu byte pun**, blob Git tetap `8a63c81e80863caa1d84480fdcd04f560941f501`. CV tetap 37 kegiatan, 5 tab, Training/topik diskusi Training, dan aturan Stock Opname sebelumnya.
- **Tidak ada migrasi atau penghapusan data jadwal tersimpan.** Seed baru berlaku hanya bila `schedule.json` WBI belum ada. Dokumen lama tetap utuh dan tab mengikuti isinya; koordinator yang menghapus berkas lokal untuk reseed sesuai rencana. Tes Java membuktikan dokumen lama 37 kegiatan dengan Training tidak ditimpa seed baru.

## Bukti

| Uji | Hasil |
|---|---|
| Java JDK 8 | **165 lulus, 0 gagal/error/skip**. Tes seed kini membandingkan tanggal/jam berdasarkan ID; ditambah pemeriksaan isi WBI dan tidak adanya migrasi berkas lama. [Log](qa-wbi-schedule/java8-tests.log) |
| JS | **213 terdaftar: 195 lulus, 0 gagal, 18 skip** karena jsdom tidak tersedia. Lima tes baru memeriksa isi/section, tanggal, tab, hitungan/area, timeline/Kick Off/catatan kartu. [Log](qa-wbi-schedule/js-tests.log) |
| Chrome fixture terkunci | **6 skenario lulus, 0 exception JS**: WBI 35/4 tab/10 milestone/5 area, Tahap E Retail, opname Pabrik dan Toko, fallback URL Training, Home 35, dan CV 37/5 tab/Training tetap. [Hasil](qa-wbi-schedule/browser-evidence.json) |
| Screenshot | Ringkasan [desktop](qa-wbi-schedule/wbi-summary-desktop.png) / [390px](qa-wbi-schedule/wbi-summary-mobile.png); Stock Opname [desktop](qa-wbi-schedule/wbi-stock-desktop.png) / [390px](qa-wbi-schedule/wbi-stock-mobile.png). Tidak ada overflow halaman. |

Perintah utama dari root repo:

```sh
JAVA_HOME=/Library/Java/JavaVirtualMachines/jdk1.8.0_291.jdk/Contents/Home mvn -B -o -f CVPPMK/pom.xml '-DargLine=-Xmx256m' test
node --test --test-concurrency=1 CVPPMK/src/test/js/*.test.mjs
PLAYWRIGHT_MODULE=/Users/fakhridhiya_/Desktop/Mac-Kerja/_tools/pw/node_modules/playwright/index.mjs node CVPPMK/src/test/js/wbi-schedule.browser.mjs
git diff --check
```

Browser memakai dua preview lokal: `node CVPPMK/src/test/js/preview-server.mjs` untuk WBI (18635) dan `PREVIEW_COMPANY=cv PREVIEW_PORT=18637 node CVPPMK/src/test/js/preview-server.mjs` untuk CV. Tidak memasang paket atau mengubah warna/CSS.

Belum diuji pada deployment Tomcat/WAR atau berkas jadwal WBI milik user. Berkas tersebut tidak disentuh; tidak ada migrasi otomatis.
