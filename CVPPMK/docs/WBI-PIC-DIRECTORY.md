# PIC WBI dari User SAP

Melanjutkan commit inventory/PIC-STEM `18bd4b3`, sesuai revisi terakhir Fakhri: **tidak membuat menu User WBI, daftar statis 13 orang, atau penyimpanan konfirmasi baru**.

- Profil company berada di `company/wbi.json`; API company mengirim sumber, grup dan kode pengecualian. JS tidak menguji nama/kode company WBI untuk memilih daftar.
- WBI mengambil `api/section/users`: hanya Locked=N dan bukan kode sistem/layanan/gerai pada konfigurasi. SUPERUSER sendiri tidak dikecualikan, sehingga pemakai sah seperti CEO-WBI tetap dapat dipilih.
- Dropdown menampilkan `+ PIC`, STEM, lalu grup WBI dengan **USER CODE (USERNAME)**. Nilai pilihan disimpan sebagai `WBI:<code>`. Tabel, Ringkasan per area, Home dan catatan perubahan PIC memakai kode/nama yang sesuai.
- Nama di luar daftar tetap boleh diketik; kegagalan baca SAP menghasilkan saran kosong, tidak mengambil daftar CV. Enam kegiatan upload STEM tetap terkunci; kedua kegiatan serah inventory bebas, sesuai [koreksi PIC terakhir](WBI-HANDOVER-PIC-CORRECTION.md).
- Konfirmasi daftar tetap melalui Review pada menu User (1.5). Panduan PIC menautkan ke menu itu; tidak menambahkan menu/modnav baru.
- CV tetap sumber `data/ppmk-users.json`, grup PPMK, dan nilai lama PPMK:<code>. Seed CV tidak diubah.

Bukti: **171 Java JDK 8 lulus, 0 gagal/skip** ([log](qa-wbi-pic/java8-tests.log)); **218 JS terdaftar, 200 lulus, 18 skip jsdom** ([log](qa-wbi-pic/js-tests.log)); **3 kelompok pemeriksaan Chrome lulus**, 0 exception ([hasil](qa-wbi-pic/browser-evidence.json)). Screenshot dropdown [desktop](qa-wbi-pic/dropdown-desktop.png) / [390px](qa-wbi-pic/dropdown-mobile.png).

Fixture memuat 5 akun representatif: 2 dipakai, 1 sistem, 1 gerai, 1 terkunci. Ini bukti pemilahan, bukan pembacaan 31 akun WBI_TEST atau pengesahan daftar resmi. Daftar resmi belum ada; user perlu mengecek dan menandai Review sendiri. Tidak mengakses SAP/HANA, memasang paket, mengubah warna/CSS, atau push.

Perintah: tes Java/JS sama dengan [laporan inventory](WBI-INVENTORY-REVISION.md); browser `PLAYWRIGHT_MODULE=/Users/fakhridhiya_/Desktop/Mac-Kerja/_tools/pw/node_modules/playwright/index.mjs node CVPPMK/src/test/js/pic-company.browser.mjs`, dengan preview WBI 18635 dan CV 18637. Deployment hidup belum diuji.
