# Dokumentasi Project CVPPMK

Database: SAP B1 HANA, schema `CVPPM` (QA). App: Spring Boot 2.7 (Java 8, supaya bisa jalan di server Java 8), jalankan `DocsApplication` dari Spring Boot Dashboard
(atau `mvnw spring-boot:run`), lalu buka http://127.0.0.1:8090

Struktur web (per halaman, mengikuti nomor blueprint `docx/01.01 - General Parameters ...`):
- `static/sections.json`: daftar bab & halaman untuk sidebar, plus status (`todo` / `progress` / `done`).
- `sql/<id-halaman>/*.sql`: query per halaman, dipanggil lewat `/api/section/<id-halaman>`.
- `static/js/pages/general.js`: isi tiap halaman (format tabel No | Pengaturan | Nilai) + temuan otomatis.
- Tanda **?** di samping pengaturan = pemetaan kolom DB belum dicek langsung di layar SAP B1.

| # | Bagian | Sumber blueprint | Status |
|---|---|---|---|
| 1 | General Parameter (1.1–1.20, Organization Structure) | 01.01 General Parameters | 🟡 progress |
| 2 | Keuangan: Chart of Accounts, G/L Account Determination, Fixed Asset | 01.02 GL Account, 07.01 Financial, 08.01 Fixed Asset | 🟡 progress |
| 3 | Master Data: Item Group, Customer & Vendor Group, Price List, Status Master Data | 01.03–01.05 Master Data | 🟡 progress |
| 4 | Kontrol Dokumen: Approval, Alert, Form Layout, Validasi SP | Approval Rule / Alert / List of Form / SP Notif di 02.01–06.01 | 🟡 progress |
| 5 | Add-on & Kustomisasi STEM: UDO, UDT, UDF, Saved Query | Functional Gap di semua blueprint | 🟡 progress |

Narasi alur proses (Activity/Why/Who/How) dan flowchart di blueprint modul tidak dipindah ke web: tetap di Word.
Halaman bab 2–5 ada di `static/js/pages/modules.js`.

## 1. Konfigurasi General

Query: `src/main/resources/sql/<id-halaman>/*.sql` (company-details, general-settings, posting-period, currencies, document-numbering, users, org-structure)

| No | Sub-bagian | Isi | Tabel |
|---|---|---|---|
| 1.1 | Profil Perusahaan | Nama, alias, NPWP, IDTKU, kontak, alamat | `OADM`, `ADM1` |
| 1.2 | Sistem & Mata Uang | Versi SAP B1, schema, mata uang lokal/sistem, kurs direct | `OADM`, `CINF` |
| 1.3 | Pengaturan Dasar | Multi branch, perpetual inventory, valuasi, G/L determination, dimension, bin, warehouse default | `OADM` |
| 1.4 | Format & Desimal | Format tanggal/jam, pemisah angka, digit desimal | `OADM` |
| 1.5 | Branch | Daftar branch, warehouse default, NPWP, jumlah warehouse & user | `OBPL`, `OWHS`, `USR6` |
| 1.6 | Warehouse | Warehouse per branch + tipe STEM | `OWHS` |
| 1.7 | Posting Period & Mata Uang | Periode + status, daftar currency | `OFPR`, `OACP`, `OCRN` |
| 1.8 | Numbering Series | Series per dokumen/UDO, per branch & tahun | `NNM1`, `OUDO` |
| 1.9 | User SAP B1 | User, superuser, branch, login terakhir | `OUSR`, `USR6` |

Temuan otomatis yang dicek di web: company details kosong, NPWP branch kosong, semua user superuser,
user tanpa branch, posting period tahun depan belum dibuat, tipe warehouse tanpa keterangan,
numbering series dengan range bentrok / tahun tidak cocok.

### Pertanyaan terbuka
- [ ] Arti kode tipe warehouse `O`, `F`, `T` (UDF `U_STEM_TYPE`)
- [ ] Series AR Invoice `T-ARIN34` & `T-ARIN36`: range sama (341000001–341999999) dan remark "Non-R" di branch Trading. Salah setup?
