# Verifikasi warna WBI (fixture lokal)

Perubahan warna dikerjakan setelah bagian 1–5 dan gerbang Retail/Farm Breeding di-commit. Panduan admin-ui-system dan ui-ux-pro-max lokal sudah dibaca. Asumsi desain yang dipakai: CV tetap keluarga teal; WBI memakai biru kehijauan agar dua WAR mudah dibedakan. Seluruh warna CSS inline halaman dan komponen chat menggunakan token pusat di css/app.css (115 swatch kategorikal lama dipusatkan); warna status tetap berbeda dan tetap didampingi label/ikon. Palette chart/print mandiri dan warna isi dokumen Crystal tetap dipertahankan untuk menjaga hasil ekspor.

Tidak mengubah navigasi atau aturan bisnis dalam commit warna. Favicon S biru tetap berkas asli. Mode gelap memiliki warna on-accent/on-danger tersendiri supaya teks tombol tidak putih di atas aksen terang.

## Screenshot sebelum / sesudah

Semua respons data berasal dari `src/test/js/preview-server.mjs`, tanpa SAP/JDBC. Desktop 1440×1000, HP 390×844. Setup perbandingan utama ditangkap dalam mode gelap pada kedua tahap; halaman lain mode terang. Tambahan screenshot tabel Setup terang ada di bawah. Ini verifikasi tampilan fixture, bukan bukti koneksi/kelengkapan data SAP; peringatan data tidak lengkap pada index dan status koneksi Home adalah respons demo.

| Halaman | Desktop sebelum | Desktop sesudah | HP sebelum | HP sesudah |
|---|---|---|---|---|
| home | [before desktop](qa-wbi/screenshots/before-home-desktop.png) | [after desktop](qa-wbi/screenshots/after-home-desktop.png) | [before mobile](qa-wbi/screenshots/before-home-mobile.png) | [after mobile](qa-wbi/screenshots/after-home-mobile.png) |
| setup | [before desktop](qa-wbi/screenshots/before-setup-desktop.png) | [after desktop](qa-wbi/screenshots/after-setup-desktop.png) | [before mobile](qa-wbi/screenshots/before-setup-mobile.png) | [after mobile](qa-wbi/screenshots/after-setup-mobile.png) |
| schedule | [before desktop](qa-wbi/screenshots/before-schedule-desktop.png) | [after desktop](qa-wbi/screenshots/after-schedule-desktop.png) | [before mobile](qa-wbi/screenshots/before-schedule-mobile.png) | [after mobile](qa-wbi/screenshots/after-schedule-mobile.png) |
| countdoc | [before desktop](qa-wbi/screenshots/before-countdoc-desktop.png) | [after desktop](qa-wbi/screenshots/after-countdoc-desktop.png) | [before mobile](qa-wbi/screenshots/before-countdoc-mobile.png) | [after mobile](qa-wbi/screenshots/after-countdoc-mobile.png) |
| rpt | [before desktop](qa-wbi/screenshots/before-rpt-desktop.png) | [after desktop](qa-wbi/screenshots/after-rpt-desktop.png) | [before mobile](qa-wbi/screenshots/before-rpt-mobile.png) | [after mobile](qa-wbi/screenshots/after-rpt-mobile.png) |
| hana | [before desktop](qa-wbi/screenshots/before-hana-desktop.png) | [after desktop](qa-wbi/screenshots/after-hana-desktop.png) | [before mobile](qa-wbi/screenshots/before-hana-mobile.png) | [after mobile](qa-wbi/screenshots/after-hana-mobile.png) |
| index | [before desktop](qa-wbi/screenshots/before-index-desktop.png) | [after desktop](qa-wbi/screenshots/after-index-desktop.png) | [before mobile](qa-wbi/screenshots/before-index-mobile.png) | [after mobile](qa-wbi/screenshots/after-index-mobile.png) |

Tambahan: [baris Setup Baru/Beda/Error, terang](qa-wbi/screenshots/after-setup-statuses-light-desktop.png), [chat Setup desktop](qa-wbi/screenshots/after-chat-setup-desktop.png), [chat Setup HP](qa-wbi/screenshots/after-chat-setup-mobile.png), [tema CV teal](qa-wbi/screenshots/after-cv-theme-home-desktop.png).

Panel chat diuji di fixture: buka topik Warehouse, isi nama, kirim pesan, pesan muncul pada `setup:warehouses`. POST hanya menuju server fixture lokal, bukan SAP atau pengguna lain. Tata letak HP tidak melebar keluar viewport. Manifest pemeriksaan ada di `qa-wbi/screenshots/before-manifest.json` dan `after-manifest.json`.

## Kontras terhitung

Rasio luminans sRGB mengikuti rumus WCAG. Seluruh 64 kombinasi utama (16 pasangan × 4 palette) diuji otomatis >=4.5:1; tabel di bawah menampilkan pasangan utamanya. Ini tidak menyatakan audit aksesibilitas penuh seluruh isi/chart/dokumen pengguna.

| Teks / latar token | CV terang | WBI terang | CV gelap | WBI gelap |
|---|---:|---:|---:|---:|
| text / surface | 12.29:1 | 12.29:1 | 13.55:1 | 13.55:1 |
| text-2 / surface | 7.68:1 | 7.68:1 | 10.08:1 | 10.08:1 |
| muted / surface | 5.56:1 | 5.56:1 | 5.75:1 | 5.75:1 |
| on-accent / accent | 5.27:1 | 5.90:1 | 7.46:1 | 8.58:1 |
| accent-strong / accent-soft | 6.14:1 | 6.67:1 | 7.13:1 | 8.36:1 |
| ok / ok-soft | 5.54:1 | 5.54:1 | 7.38:1 | 7.38:1 |
| warn / warn-soft | 5.80:1 | 5.80:1 | 6.82:1 | 6.82:1 |
| danger / danger-soft | 5.83:1 | 5.83:1 | 5.60:1 | 5.60:1 |
| info / info-soft | 6.05:1 | 6.05:1 | 6.64:1 | 6.64:1 |
| text / ok-soft | 10.97:1 | 10.97:1 | 11.48:1 | 11.48:1 |
| text / warn-soft | 11.17:1 | 11.17:1 | 11.20:1 | 11.20:1 |
| text / danger-soft | 11.09:1 | 11.09:1 | 12.46:1 | 12.46:1 |
| muted / warn-soft | 5.05:1 | 5.05:1 | 4.75:1 | 4.75:1 |
| muted / danger-soft | 5.01:1 | 5.01:1 | 5.29:1 | 5.29:1 |
| on-danger / danger | 6.46:1 | 6.46:1 | 6.14:1 | 6.14:1 |

Validasi akhir warna: 120 tes JS lulus, 0 gagal/skipped; 85 tes Java lulus, 0 gagal/error/skipped. Build kedua WAR berhasil tanpa koneksi datasource. Pengujian nyata di Tomcat/Java 8 dan SAP tetap dilakukan Fakhri.
