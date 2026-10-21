# Panduan Testing — Migrasi Supabase → SQL Server

Dokumen ini untuk Anda gunakan saat melakukan pengujian. Catat hasilnya dan
laporkan kembali ke saya (terutama pesan error persisnya bila ada yang gagal).

---

## Status: apa yang sudah & belum diuji

**Sudah diuji oleh saya:**
- Syntax seluruh file backend (`node --check`) — lolos
- Server API menyala, routing & error handler jalan
- Middleware autentikasi: token kosong → 401, token ngawur → 401
- Otorisasi peran: Teknisi → 403 saat akses endpoint Admin
- Validasi input sebelum menyentuh database (400)
- `npm run lint` → 0 error, `npm run typecheck` → lolos, `npm run build` → sukses
- Hash password seed `admin123` cocok dengan bcrypt

**BELUM diuji (perlu Anda, karena butuh database hidup):**
- Eksekusi `schema.sql` di SSMS
- Semua operasi yang menyentuh database (login, CRUD, approval, PDF)

**Blocker yang saya temukan:**

Koneksi ke `10.14.1.81\SQLTESTO` dari komputer ini menghasilkan:

```
Login failed for user '' (ELOGIN)
```

Server SQL-nya **terjangkau** dan Windows Authentication sudah bernegosiasi,
tetapi akun Windows `Interbat` **belum terdaftar sebagai login** di SQL Server
tersebut. Ini perlu tindakan dari DBA/sysadmin Anda.

---

## Langkah 1 — Daftarkan akun Windows Anda (perlu sysadmin)

Buka **SSMS** dan sambungkan sebagai `sa` (atau akun yang punya hak sysadmin),
lalu jalankan file:

```
mssql-backend/SETUP-LOGIN.sql
```

Script itu akan:
1. Membuat database `DbKalibrasi` bila belum ada
2. Mendaftarkan login Windows `Interbat`
3. Memberinya akses ke `DbKalibrasi`
4. Menampilkan daftar login untuk verifikasi

> Bila nama akun Anda bukan `Interbat`, atau komputer ini di domain (perlu
> format `DOMAIN\namaUser`), ubah variabel `@WindowsLogin` di baris paling atas
> file tersebut.

**Alternatif** bila Anda lebih suka SQL Authentication: minta DBA membuat user
SQL, lalu ubah `mssql-backend/.env`:

```ini
MSSQL_TRUSTED=false
MSSQL_USER=nama_user
MSSQL_PASSWORD=password
```

---

## Langkah 2 — Buat tabel

Masih di SSMS:

1. Pilih database **`DbKalibrasi`** pada dropdown di toolbar
2. **File → Open → File...** → pilih `mssql-backend/schema.sql`
3. Tekan **F5**

**Yang diharapkan:** muncul pesan `[OK] ...` untuk tiap tabel, lalu dua tabel
ringkasan di bagian bawah (5 tabel dan 1 akun admin).

Script ini aman dijalankan berulang kali — bila tabel sudah ada, akan
`[SKIP]` tanpa error.

**Harap laporkan** bila ada baris berwarna merah.

---

## Langkah 3 — Jalankan aplikasi

Dari folder root proyek:

```bash
npm run dev:all
```

Ini menjalankan backend (port 4000) dan frontend (port 5173) sekaligus.

Bila ingin terpisah, buka dua terminal:

```bash
npm run dev:api    # terminal 1 — backend
npm run dev        # terminal 2 — frontend
```

**Yang diharapkan di terminal backend:**

```
[server] KalibrasiMS API berjalan di http://localhost:4000
[db] Tersambung ke SQL Server (Windows Authentication).
[server] Koneksi database siap.
```

Bila muncul `Peringatan: database belum dapat dihubungi`, berarti Langkah 1–2
belum berhasil. Kirimkan pesan error-nya ke saya.

Uji cepat dari terminal:

```bash
curl http://localhost:4000/api/health
# Harus: {"ok":true,"database":"connected"}
```

---

## Langkah 4 — Uji fungsional di browser

Buka `http://localhost:5173`. Login dengan:

| Username | Password |
|---|---|
| `admin` | `admin123` |

### Skenario A — Data induk (peran Admin)

1. **Manajemen User** → *Tambah User*. Buat satu akun untuk tiap peran:
   - Teknisi (`teknisi1` / `teknisi123`)
   - SPV (`spv1` / `spv123`)
   - Senior SPV (`srspv1` / `srspv123`)
   - *Harap diuji:* coba buat username yang sama dua kali → harus muncul pesan
     "Username sudah dipakai."
   - *Harap diuji:* tombol hapus tidak muncul untuk akun Anda sendiri.

2. **Data Alat** → *Tambah Alat*. Isi Tag Number mis. `TAG-001`, parameter
   `Suhu`, range 0–100, satuan `°C`.
   - *Harap diuji:* coba simpan `TAG-001` lagi → harus muncul pesan
     "Tag Number TAG-001 sudah terdaftar."
   - *Harap diuji:* range min > range max → harus ditolak.

### Skenario B — Alur kalibrasi lengkap (ini yang paling penting)

Ikuti berurutan, perhatikan **perubahan badge status** di tiap tahap:

| # | Login sebagai | Aksi | Status yang diharapkan |
|---|---|---|---|
| 1 | admin | Penugasan Kalibrasi → Tugaskan alat TAG-001 ke `teknisi1` | `Ditugaskan` |
| 2 | admin | Buka **Kalender Jadwal**, klik tanggal yang ada tugasnya | tugas tampil di sel tanggal |
| 3 | teknisi1 | Input Kalibrasi → *Input Data* → isi 5 baris As-Found & As-Left → *Simpan Draft* | `Berjalan` |
| 4 | teknisi1 | Buka lagi → *Submit untuk Review* | `Dikirim` |
| 5 | spv1 | Review SPV → *Review* → Setujui | `Disetujui SPV` |
| 6 | srspv1 | Review Senior SPV → *Review* → Setujui | `Disetujui Sr. SPV` |
| 7 | admin | Laporan Kalibrasi → *Pratinjau* lalu *Unduh PDF* | PDF terunduh |

**Yang perlu Anda perhatikan khusus:**

- **Error dihitung otomatis.** Isi Standar=10, Bacaan=12 → kolom Error harus
  terisi `2.00` tanpa Anda ketik.
- **Teknisi hanya melihat tugasnya sendiri.** Login `teknisi1` — tugas milik
  teknisi lain tidak boleh muncul.
- **Status tidak bisa dilompati.** Coba login `srspv1` saat tugas masih
  `Dikirim` (belum di-approve SPV) → tugas itu **tidak boleh muncul** di daftar
  Review Senior SPV.
- **Alur ditolak.** Ulangi dari awal, di tahap 5 pilih **Tolak**. Status jadi
  `Ditolak`, dan teknisi harus bisa membuka kembali tugas itu untuk perbaikan.
- **PDF.** Cek isinya: nomor dokumen `LKK-00000001`, tabel As-Found/As-Left,
  riwayat persetujuan, tanda tangan SPV & Sr. SPV, dan QR code.

### Skenario C — Penugasan otomatis

Di **Kalender Jadwal** → *Tugaskan* → aktifkan toggle **Penugasan Otomatis**.
Sistem harus menampilkan satu teknisi dengan beban tugas paling rendah pada
rentang ±3 hari dari tanggal yang dipilih.

### Skenario D — Keamanan

1. Logout, lalu akses langsung `http://localhost:5173/admin/users` tanpa login
   → harus dialihkan ke halaman login.
2. Login sebagai `teknisi1`, lihat menu sidebar → hanya *Dashboard* dan
   *Input Kalibrasi* yang muncul.

---

## Bagian yang paling saya khawatirkan (tolong prioritaskan)

Bila waktu Anda terbatas, uji **tiga hal ini** lebih dulu — ini titik yang
paling berisiko gagal:

1. **`schema.sql` berjalan bersih di SSMS.** Saya tidak bisa mengeksekusinya
   tanpa database, jadi seluruh DDL belum pernah dijalankan sungguhan.
2. **Simpan data kalibrasi (Langkah 4, skenario B nomor 3).** Di sinilah JSON
   `as_found_data` / `as_left_data` masuk ke kolom `NVARCHAR(MAX)` yang punya
   CHECK constraint `ISJSON(...) = 1`.
3. **Unduh PDF (nomor 7).** `pdfmake` pada Node bisa berbeda perilakunya
   dibanding versi browser yang dipakai sebelumnya.

---

## Cara melaporkan hasil

Cukup kirimkan, untuk tiap langkah:

- ✅ berhasil, atau
- ❌ gagal + **pesan error persisnya** (salin dari layar / terminal)

Bila error muncul di terminal backend, mohon sertakan juga ~10 baris terakhir
dari output terminal tersebut — di situ saya menambahkan log `[error]` yang
memuat detail aslinya.

---

## Referensi singkat

| Perintah | Fungsi |
|---|---|
| `npm run dev:all` | Jalankan backend + frontend sekaligus |
| `npm run dev:api` | Backend saja (port 4000) |
| `npm run dev` | Frontend saja (port 5173) |
| `npm run typecheck` | Cek tipe TypeScript |
| `npm run lint` | Cek kualitas kode |
| `curl localhost:4000/api/health` | Cek koneksi database |

| Berkas | Isi |
|---|---|
| `mssql-backend/SETUP-LOGIN.sql` | Daftarkan akun Windows ke SQL Server |
| `mssql-backend/schema.sql` | Buat 5 tabel + akun admin awal |
| `mssql-backend/.env` | Konfigurasi koneksi database |
| `mssql-backend/README.md` | Dokumentasi lengkap API |
