# Build CV PPMK dan WBI

Semua perubahan WBI ada di branch lokal `wbi/main`, berasal dari `main` (`ab74c0c`). Branch `main` tidak diubah dan tidak ada push.

## Dua WAR

Jalankan dari subfolder CVPPMK; simpan hasil build sebelum menjalankan `clean` berikutnya.

```powershell
# Checkout main untuk CV PPMK, dengan application.properties lokal CV milik Fakhri.
git switch main
mvn clean package
# Hasil target/cvppmk.war -> konteks Tomcat /cvppmk

git switch wbi/main
mvn clean package -Pwbi
# Hasil target/wbi.war -> konteks Tomcat /wbi
```

Pada branch WBI, build tanpa `-Pwbi` juga tetap menghasilkan `cvppmk.war` dengan profil default. Profil `wbi` ditanam saat resource filtering Maven; tidak perlu mengaktifkan profil manual ketika WAR itu dipasang. Selalu gunakan `clean` saat berganti profil agar konfigurasi build sebelumnya tidak tertinggal. Profil WBI tidak membundel `application.properties` lokal CV ke WAR.

## Konfigurasi WBI di lingkungan proses Tomcat

Endpoint HANA `192.168.20.135:30015`, schema `WBI_TEST`, dan SL `https://192.168.20.135:50000/b1s/v1`/company `WBI_TEST` sudah dikonfirmasi Fakhri. Host/port non-rahasia menjadi default profil dan dapat dioverride lewat lingkungan. User JDBC harus akun baca saja yang disediakan Fakhri, bukan DBADMIN. Semua kredensial wajib dari lingkungan, termasuk user SL. Worker hanya memverifikasi SL Login/GET; worker tidak pernah membuka JDBC.

| Variabel | Isi oleh Fakhri |
|---|---|
| `WBI_HANA_HOST` | Opsional: override host HANA default `192.168.20.135` |
| `WBI_HANA_PORT` | Opsional: override port HANA default `30015` |
| `WBI_HANA_USER` | User JDBC baca; berbeda dari user SAP |
| `WBI_HANA_PASSWORD` | Rahasia JDBC, melalui lingkungan proses |
| `WBI_SL_USER` | User SAP untuk SL; Fakhri menetapkan `manager` |
| `WBI_SL_PASSWORD` | Rahasia user SAP, melalui lingkungan proses |
| `WBI_SETUP_PASSWORD` | Rahasia untuk membuka menu Setup |
| `WBI_DATA_DIR` | Opsional: direktori induk data; default `${catalina.base}/data` |
| `WBI_SL_URL` | Opsional: override URL SL yang sudah dikonfirmasi |
| `WBI_SL_TRUST_ALL_CERTS` | Default false; gunakan sertifikat CA tepercaya, atau true hanya bila QA mengizinkan sertifikat sendiri |

Jangan menaruh nilai rahasia dalam repo, perintah yang disalin ke laporan, atau log. `.env*`, `secrets/`, dan `application-*-local.properties` diabaikan Git. Bila memakai konfigurasi eksternal, arahkan Spring ke berkas lokal yang diabaikan Git melalui `SPRING_CONFIG_ADDITIONAL_LOCATION`; jangan membundelnya ke WAR WBI. Kredensial belum diisi berarti aplikasi belum siap dijalankan ke SAP.

`docs.company=wbi` menambahkan `/wbi` ke direktori induk data, termasuk bila induknya sama dengan CV. Jangan mengisi WBI_DATA_DIR dengan direktori akhir `/wbi` kecuali memang menghendaki `/wbi/wbi`. Profil WBI menolak start bila kode company bukan `wbi` atau direktori induknya kosong. Company kosong mempertahankan seluruh path data CV lama. `docs.schedule.seed=schedule/default-wbi.json` hanya dipakai bila berkas jadwal WBI belum ada; jadwal CV hidup tidak dibaca atau dipindahkan.

## Tes lokal tanpa SAP

```powershell
mvn test
npm test
npm run preview
# UI fixture: http://127.0.0.1:18635/home.html
```

Pada JDK 25, Mockito/Byte Buddy bawaan Boot 2.7 membutuhkan `mvn '-Dnet.bytebuddy.experimental=true' test` (flag juga berlaku saat package). Target bytecode produksi tetap Java 8. Tes lama yang memakai jsdom memerlukan `JSDOM_PATH` bila lokasinya berbeda dari lingkungan pengembangan lama; tes aturan Setup dan company menggunakan Node bawaan.

Fixture preview hanya melayani file lokal dan API palsu di 127.0.0.1, tanpa proxy SAP/JDBC. Akses SAP nyata dan pengujian posting bukan bagian tes ini.

## Sumber dan tujuan QA

Keputusan Fakhri terbaru: **sumber = tujuan = WBI_TEST**. `setup.source-dbs=WBI_TEST` dan `setup.source.allow-target=true` menampilkan company tujuan sebagai sumber yang sah. Penjaga kesamaan DB baca dengan CompanyDB SL tetap berlaku. Datasource Hikari WBI memakai `read-only=true`; jalur baca Setup menegaskan `Connection.setReadOnly(true)`, koneksi sumber terpisah juga read-only, dan seluruh query katalog Retail hanya SELECT. SQL/JDBC tidak dipakai untuk menulis master; penulisan aplikasi hanya lewat SL setelah kunci Setup dibuka. Fakhri/koordinator yang menjalankan aplikasi dan QA nyata.

Tier G pada WBI diganti Retail (11 langkah dalam 8 kelompok); default CV tetap Farm Breeding. Tabel Retail harus ada dan berisi data. Karena sumber sama dengan tujuan, hasil normal adalah Sama, tanpa baris yang perlu di-upload. Tidak dibuat uploader saldo awal baru: saldo inventory/AP/AR/GL diisi user sendiri. Transaksi/log/buffer tidak dimigrasi.

`WBI_KARTON` di `192.168.40.181:30015` hanya calon sumber nanti, **tidak dikonfigurasi aktif dan tidak dihubungi worker**. Mengaktifkannya perlu keputusan sumber baru, akun baca saja terpisah, dan verifikasi ulang mapping/dependensi.
