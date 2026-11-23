# Revisi bagan dan bahasa jadwal WBI

Menggantikan tampilan dan asumsi jam upload Toko dalam laporan inventory sebelumnya; 40 kegiatan tetap (18 milestone, 16 master, 6 balance), PIC STEM/tabel/aturan per lokasi tetap.

- Satu bagan inventory, enam kartu berurutan: opname gabungan 29–31 Des; cut off gabungan 31 Des; serah Produksi/Pabrik 19:00; upload Produksi/Pabrik 19:00–20:00; serah Toko/Store batas 22:00; upload Toko/Store 24:00.
- Ringkasan memakai satu bagan dengan 14 kartu; kartu opname/cut off sejadwal digabung, empat kartu serah/upload terpisah. Status kartu gabungan mengikuti status kedua kegiatan; tabel menyimpan kegiatan terpisah.
- Jam tunggal 24:00 diterima validator Java dan editor. Tanggal tetap 31 Desember, hitungan hari/telat tetap memakai tanggal kalender. Tidak ada jam selesai baru.
- Catatan internal: interpretasi “jam 12” sebagai 24:00 berasal dari koordinator; bila yang dimaksud 12:00 siang, ubah seed. Tidak ada migrasi jadwal tersimpan.

| Teks sebelumnya | Teks sesudah |
|---|---|
| Aturan Toko: ASUMSI upload setelah serah (setelah 22:00), tanpa jam selesai yang ditetapkan | Upload SAP 31 Desember 2026 pukul 24:00, tanpa jam selesai |
| Catatan upload/balance Toko: ASUMSI ... Jam selesai belum ditentukan Fakhri; admin dapat mengedit jadwal | Upload SAP Toko / Store: 31 Desember 2026 pukul 24:00, setelah serah ke STEM (batas akhir pukul 22:00) |
| Catatan cut off Toko: tidak menetapkan jam cut off baru | Toko / Store. Cut off inventory 31 Desember 2026 |
| Ringkasan upload menyalin catatan internal saat jam kosong | Ringkasan menampilkan tanggal dan jam upload dari data (24:00) |

Pemindaian seed dan sumber schedule.js tidak menemukan kata internal terlarang; tes mencegah kemunculan kembali. Catatan internal tetap hanya dalam dokumen pengembangan.

Bukti fixture lokal: Java 171 lulus, 0 gagal/error/skip; JS 219 terdaftar, 201 lulus, 18 skip (jsdom tidak tersedia); Chrome 1 skenario/5 kelompok pemeriksaan, 7 screenshot, 0 exception, halaman 390px tidak meluap. Log ada di `qa-wbi-timeline/`; screenshot terbaru dan JSON browser ada di `qa-wbi-inventory/`, termasuk `main-timeline-desktop.png` dan `main-timeline-mobile.png`; `main-timeline-end-desktop.png` menunjukkan ujung bagan setelah digeser.

CV tetap 37 kegiatan, 5 area, satu alur asli; seed default.json tidak diubah. Belum diuji: SAP/SL/HANA nyata, deployment, jadwal company yang sudah tersimpan (tidak dimigrasikan), 18 tes jsdom. Tidak ada instalasi paket atau perubahan warna/token. Penyesuaian layout hanya pada bagan multi-lokasi: desktop dapat digeser horizontal untuk menjaga jarak kartu; HP tetap satu garis vertikal. Tes browser membandingkan kotak setiap kartu untuk membuktikan tidak berpotongan.
