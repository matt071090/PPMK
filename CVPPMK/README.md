# CVPPMK Docs

Web dokumentasi konfigurasi SAP B1 project CVPPMK, plus alat bantu setup / cut off data ke SAP B1.
Database: SAP B1 HANA, schema `CVPPM` (QA). Struktur bab dan status pengerjaan ada di [OUTLINE.md](OUTLINE.md).

Jalankan `DocsApplication` (atau `mvnw spring-boot:run`), lalu buka http://127.0.0.1:8090.
Koneksi DB dan Service Layer diatur di `./application.properties` (tidak di-commit, isinya kredensial).

---

## Aturan utama: semua tulis ke SAP B1 lewat Service Layer

**Semua data yang di-upload / dibuat / diubah di SAP B1 wajib lewat Service Layer (`/b1s/v1`).**
Aturan ini berlaku untuk siapa saja yang kerja di repo ini, termasuk agen AI lain.

| Boleh | Tidak boleh |
|---|---|
| Baca data lewat SQL (JDBC, `sql/<halaman>/*.sql`) | `INSERT` / `UPDATE` / `DELETE` / `MERGE` ke tabel SAP B1 (`OITM`, `OCRD`, `OPRC`, `@UDT`, dll) |
| Baca data lewat Service Layer (`GET`, action `CompanyService_Get*`) | `CREATE` / `ALTER` / `DROP` tabel atau kolom SAP B1 lewat SQL |
| Tulis lewat Service Layer: `POST` (buat baru), `PATCH` (ubah sebagian) | Tulis lewat DI API, DTW, atau tool lain tanpa dicatat di repo |
| Buat UDF / UDT / UDO lewat entity Service Layer (`UserFieldsMD`, `UserTablesMD`, `UserObjectsMD`) | Menyimpan hasil upload yang tidak bisa dilacak (tanpa file `.http` / tanpa catatan hasil) |

Kenapa:
- Service Layer menjalankan validasi bisnis SAP B1 (aturan objek, numbering, `SBO_SP_TransactionNotification`, log perubahan).
  SQL langsung melewati semua itu dan bisa merusak data tanpa ketahuan, serta tidak didukung SAP.
- Satu jalur tulis = hasilnya bisa diulang dan dicek. Agen atau orang berikutnya cukup baca file request di repo
  untuk tahu apa yang sudah dikirim, ke DB mana, dan hasilnya apa.
- Error ditolak di Service Layer dengan pesan yang jelas, bukan data setengah jadi di tabel.

Kalau ada data yang tidak bisa ditulis lewat Service Layer (entity tidak ada / field tidak didukung),
**berhenti dan tanyakan dulu ke user**. Jangan pindah ke SQL atau DI API sendiri.

---

## Dua jalur tulis yang tersedia

### 1. File request `sl-requests/*.http` (manual / sekali jalan)

Dipakai untuk master data dan setting awal (payment terms, cost center, item, BP, dll).
Dijalankan dengan REST Client (VS Code) atau tool sejenis, urut dari atas.

Format yang dipakai di semua file:

```http
# <Apa yang ditambah> (<tabel SAP>) lewat Service Layer, entity <NamaEntity>. Urut 1 -> 2 -> 3.
# Sumber data: <file sumber + versi/tanggal>. Asumsi / keputusan user dicatat di sini.
# Dijalankan di <DB> (<QA/LIVE>): <ringkasan hasil, mis. 22x HTTP 201>. Dicek ulang: <sesuai / catatan>.

@sl = https://<host>:50000/b1s/v1

### 1. Login
POST {{sl}}/Login
...

### 2. <Aksi>
POST {{sl}}/$batch
...
```

Aturan file `.http`:
- **Satu file = satu jenis data**, diberi nomor urut (`14-...http`, `15-...http`). Jangan mengubah file yang sudah dijalankan;
  kalau perlu koreksi, buat file baru dan rujuk file lamanya.
- Tulis **sumber data**, **keputusan user**, dan **hasil eksekusi** di komentar header. Ini satu-satunya catatan
  bahwa data sudah masuk ke SAP B1.
- Data yang saling bergantung dikirim dalam satu **changeset `$batch`**: kalau satu gagal, semua batal.
  Data yang berdiri sendiri boleh dikirim per baris supaya satu baris gagal tidak membatalkan yang lain.
- **Validasi dulu** ke tabel lookup (mis. `OITB`, `OUGP`, `OVTG`, valid values UDF) lewat SQL baca, sebelum kirim.
- **Baca ulang setelah kirim** (`GET` atau SQL baca) dan bandingkan dengan sumber, lalu catat hasilnya di header.
- `PATCH` pada koleksi (mis. `BPAddresses`, `BPBranchAssignment`) **menambah** baris, tidak mengganti. Perhatikan ini sebelum PATCH.
- Jangan tulis password asli di file yang di-commit. Pakai variabel (`{{password}}`) atau isi saat dijalankan.

### 2. Menu Setup / Cut Off di web (`/api/setup`)

Membandingkan data DB sumber dengan DB tujuan, lalu upload selisihnya.
Lihat [SetupController.java](src/main/java/com/stem/cvppmk/docs/SetupController.java).

- DB sumber hanya dibaca, lewat koneksi JDBC terpisah yang di-set `readOnly`.
- DB tujuan hanya ditulis lewat [ServiceLayerClient.write](src/main/java/com/stem/cvppmk/docs/ServiceLayerClient.java),
  yang hanya menerima `POST` dan `PATCH`.
- Upload hanya aktif kalau `docs.edit.enabled=true` (mode dev). War di Tomcat read-only.
- Langkah setup didefinisikan di `classpath:setup/steps.json`: query SQL (baca) + entity Service Layer tujuan.

---

## Untuk developer / agen yang menambah kode

- Kode baru yang menulis ke SAP B1 **harus** memanggil `ServiceLayerClient.write(...)`.
  Jangan menambah `jdbc.update`, `jdbc.batchUpdate`, atau SQL DML ke tabel SAP B1.
- `JdbcTemplate` di project ini hanya untuk **baca** (halaman dokumentasi dan pembanding setup).
- Endpoint baca baru ke Service Layer didaftarkan di daftar `READS` pada
  [ServiceLayerController.java](src/main/java/com/stem/cvppmk/docs/ServiceLayerController.java), dan harus baca saja.
- Yang ditulis ke file lokal (bukan SAP B1), seperti `review.json` dari [ReviewController.java](src/main/java/com/stem/cvppmk/docs/ReviewController.java),
  tidak termasuk aturan ini.
- Sebelum menulis ke DB **LIVE**, minta konfirmasi user dulu. Default kerja di QA (`CVPPM`).

## Checklist sebelum upload

1. Data sumber jelas (file + versi) dan sudah dicek ke lookup SAP.
2. Target DB benar (QA atau LIVE), dan user sudah setuju kalau LIVE.
3. Request ditulis di `sl-requests/NN-nama.http` atau lewat menu Setup, bukan SQL.
4. Setelah kirim: semua response 201 / 204, data dibaca ulang dan sama dengan sumber.
5. Hasil dicatat di header file `.http` (jumlah baris, status, tanggal).
