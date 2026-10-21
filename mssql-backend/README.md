# KalibrasiMS — Backend API (Express + Microsoft SQL Server)

Backend REST untuk **Sistem Manajemen Kalibrasi Alat Ukur**. Menggantikan
Supabase (PostgreSQL) dengan **Microsoft SQL Server** on-premise, sehingga
seluruh data tersimpan di infrastruktur Anda sendiri.

---

## Daftar Isi

1. [Prasyarat](#1-prasyarat)
2. [Langkah Instalasi](#2-langkah-instalasi)
3. [Membuat Skema Database di SSMS](#3-membuat-skema-database-di-ssms)
4. [Konfigurasi Koneksi](#4-konfigurasi-koneksi)
5. [Menjalankan Server](#5-menjalankan-server)
6. [Daftar Endpoint](#6-daftar-endpoint)
7. [Alur Kerja Aplikasi](#7-alur-kerja-aplikasi)
8. [Catatan Keamanan](#8-catatan-keamanan)
9. [Pemecahan Masalah](#9-pemecahan-masalah)

---

## 1. Prasyarat

| Komponen | Versi |
|---|---|
| Node.js | 18 atau lebih baru |
| SQL Server | 2016 atau lebih baru (diuji: 2019) |
| SQL Server Management Studio | 18 atau lebih baru |

---

## 2. Langkah Instalasi

```bash
cd mssql-backend
npm install
cp .env.example .env     # lalu sesuaikan isinya (lihat bagian 4)
```

---

## 3. Membuat Skema Database di SSMS

1. Buka **SQL Server Management Studio**, sambungkan ke server Anda
   (mis. `10.14.1.81\SQLTESTO`).
2. Buat database bila belum ada:

   ```sql
   CREATE DATABASE DbKalibrasi;
   ```

3. Buka menu **File → Open → File...**, pilih `mssql-backend/schema.sql`.
4. Pastikan database tujuan sudah dipilih pada dropdown di toolbar SSMS.
5. Tekan **F5** (Execute).

Script tersebut bersifat **idempotent** — aman dijalankan berulang kali. Bila
tabel sudah ada, script akan melewatinya tanpa error.

Setelah selesai, Anda akan melihat ringkasan tabel dan satu akun admin:

| Username | Password | Peran |
|---|---|---|
| `admin` | `admin123` | Admin |

> **Penting:** segera ganti password akun admin setelah login pertama.

### Objek yang dibuat

| Tabel | Isi |
|---|---|
| `Users` | Pengguna aplikasi beserta peran (Admin / Teknisi / SPV / Senior_SPV) |
| `Equipment` | Master data alat ukur |
| `Calibration_Tasks` | Penugasan kalibrasi |
| `Calibration_Results` | Data hasil ukur (as-found & as-left, disimpan sebagai JSON) |
| `Approvals` | Jejak audit approval dua tingkat |

---

## 4. Konfigurasi Koneksi

Ada tiga cara menyambung ke SQL Server. Pilih salah satu di file `.env`.

### Mode A — SQL Server Authentication (paling sederhana)

```ini
MSSQL_SERVER=10.14.1.81
MSSQL_PORT=1433
MSSQL_DATABASE=DbKalibrasi
MSSQL_USER=sa
MSSQL_PASSWORD=password_anda
```

Atau dalam satu baris connection string:

```ini
MSSQL_CONNECTION_STRING=mssql://sa:password_anda@10.14.1.81:1433/DbKalibrasi
```

### Mode B — Named Instance (mis. `SQLTESTO` / `SQLEXPRESS`)

```ini
MSSQL_SERVER=10.14.1.81
MSSQL_INSTANCE=SQLTESTO
MSSQL_DATABASE=DbKalibrasi
MSSQL_USER=sa
MSSQL_PASSWORD=password_anda
```

> Bila memakai `MSSQL_INSTANCE`, biasanya `MSSQL_PORT` tidak perlu diisi.

### Mode C — Windows Authentication

```ini
MSSQL_TRUSTED=true
MSSQL_SERVER=10.14.1.81
MSSQL_DATABASE=DbKalibrasi
```

Windows Authentication memerlukan driver tambahan:

```bash
npm install msnodesqlv8
```

### Variabel lainnya

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `4000` | Port server API |
| `JWT_SECRET` | `dev-secret...` | **Wajib diganti** di produksi |
| `JWT_EXPIRES` | `8h` | Masa berlaku token |
| `CORS_ORIGIN` | `*` | Origin yang diizinkan, pisahkan dengan koma |
| `REPORT_VERIFY_BASE_URL` | — | Basis URL verifikasi QR pada PDF |

---

## 5. Menjalankan Server

```bash
npm run dev     # dengan auto-reload (node --watch)
npm start       # mode produksi
```

Server berjalan di `http://localhost:4000`.

Uji cepat:

```bash
curl http://localhost:4000/api/health
```

---

## 6. Daftar Endpoint

Semua endpoint (kecuali login, register, dan verifikasi QR) memerlukan header:

```
Authorization: Bearer <token>
```

### Autentikasi — `/api/auth`

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| POST | `/login` | Publik | Login dengan username **atau** email |
| POST | `/register` | Publik | Daftar akun baru (default: Teknisi) |
| GET | `/me` | Login | Profil pengguna aktif |
| PUT | `/me` | Login | Ubah nama / email sendiri |
| POST | `/change-password` | Login | Ubah password sendiri |

### Pengguna — `/api/users`

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/` | Login | Daftar pengguna (`?role=Teknisi`) |
| GET | `/technicians` | Login | Daftar teknisi aktif |
| GET | `/:id` | Login | Detail pengguna |
| POST | `/` | Admin | Buat pengguna |
| PUT | `/:id` | Admin | Ubah data pengguna |
| PUT | `/:id/role` | Admin | Ubah peran |
| PUT | `/:id/password` | Admin | Reset password |
| DELETE | `/:id` | Admin | Hapus pengguna |

### Alat Ukur — `/api/equipment`

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/` | Login | Daftar alat (`?search=&parameter_type=`) |
| GET | `/:id` | Login | Detail alat |
| POST | `/` | Admin | Tambah alat |
| PUT | `/:id` | Admin | Ubah alat |
| DELETE | `/:id` | Admin | Hapus alat |

### Tugas Kalibrasi — `/api/tasks`

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/` | Login | Daftar tugas (Teknisi hanya melihat miliknya) |
| GET | `/:id` | Login | Detail tugas |
| GET | `/:id/approvals` | Login | Riwayat approval tugas |
| POST | `/` | Admin | Tugaskan kalibrasi |
| PUT | `/:id` | Admin | Ubah penugasan |
| PUT | `/:id/status` | Login | Simpan draft / kirim untuk review |
| DELETE | `/:id` | Admin | Hapus tugas |

### Hasil Kalibrasi — `/api/results`

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/:taskId` | Login | Ambil hasil satu tugas |
| POST | `/` | Teknisi / Admin | Simpan hasil (insert atau update otomatis) |
| PUT | `/:taskId` | Teknisi / Admin | Sama seperti POST |
| DELETE | `/:taskId` | Admin | Hapus hasil |

### Approval — `/api/approvals`

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/` | Login | Daftar approval (`?stage=SPV`) |
| GET | `/task/:taskId` | Login | Riwayat approval sebuah tugas |
| POST | `/` | SPV / Senior_SPV / Admin | Catat keputusan approval |

### Dashboard — `/api/dashboard`

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/stats` | Login | Angka ringkasan + tugas terbaru |
| GET | `/workload` | Login | Beban tugas per teknisi (`?date=YYYY-MM-DD`) |

### Laporan — `/api/reports`

| Method | Path | Akses | Keterangan |
|---|---|---|---|
| GET | `/` | Login | Daftar laporan yang siap diterbitkan |
| GET | `/:taskId` | Login | Data laporan (JSON, untuk pratinjau) |
| GET | `/:taskId/pdf` | Login | Unduh laporan PDF |
| GET | `/:taskId/verify` | **Publik** | Verifikasi keaslian dokumen (tujuan QR) |

---

## 7. Alur Kerja Aplikasi

```
                    ┌──────────────────────────────────────────┐
                    │  Admin menugaskan kalibrasi ke Teknisi    │
                    │  status: Assigned                         │
                    └────────────────────┬─────────────────────┘
                                         ▼
                    ┌──────────────────────────────────────────┐
                    │  Teknisi mengisi data ukur               │
                    │  status: In_Progress (draft)              │
                    └────────────────────┬─────────────────────┘
                                         ▼
                    ┌──────────────────────────────────────────┐
                    │  Teknisi submit untuk review             │
                    │  status: Submitted                        │
                    └────────────────────┬─────────────────────┘
                                         ▼
                    ┌──────────────────────────────────────────┐
                    │  Review Supervisor (SPV)                 │
                    └───────┬──────────────────────┬───────────┘
                     Setuju │                      │ Tolak
                            ▼                      ▼
        ┌───────────────────────────────┐   ┌──────────────────┐
        │  status: SPV_Approved          │   │ status: Rejected │
        └───────────────┬───────────────┘   └────────┬─────────┘
                        ▼                            │
        ┌───────────────────────────────┐            │
        │  Review Senior Supervisor     │            │
        └───────┬───────────────┬───────┘            │
         Setuju │               │ Tolak              │
                ▼               ▼                    │
   ┌─────────────────────┐ ┌──────────────────┐     │
   │ Senior_SPV_Approved  │ │ status: Rejected │     │
   │ → laporan PDF siap   │ └────────┬─────────┘     │
   └─────────────────────┘          │               │
                                    └───────────────┘
                                    Teknisi dapat
                                    memperbaiki data
```

### Aturan penting

- **Transisi status divalidasi di server.** Status approval tidak dapat
  dilompati; `Senior_SPV_Approved` hanya bisa dicapai setelah `SPV_Approved`.
- **Approval bersifat transaksional.** Pencatatan jejak audit dan perubahan
  status tugas terjadi dalam satu transaksi, sehingga tidak akan pernah
  berbeda satu sama lain.
- **Satu tugas = satu baris hasil.** Constraint `UQ_Results_task` menjaminnya,
  dan endpoint `POST /api/results` otomatis melakukan insert atau update.
- **Teknisi hanya melihat tugasnya sendiri.** Penyaringan dilakukan di server,
  bukan di sisi klien.

---

## 8. Catatan Keamanan

RLS (Row Level Security) milik Supabase **tidak memiliki padanan langsung** di
SQL Server, sehingga otorisasi sepenuhnya ditangani di layer API:

- **Autentikasi** memakai JWT yang ditandatangani `JWT_SECRET`.
- **Otorisasi** memakai middleware `requireRole(...)` pada setiap endpoint.
- **Password** disimpan sebagai hash bcrypt (cost 10) — tidak pernah plaintext.
- **Pesan login gagal disamakan** agar tidak membocorkan username yang valid.

Yang perlu Anda lakukan sebelum produksi:

1. Ganti `JWT_SECRET` dengan nilai acak yang panjang.
2. Ganti password akun `admin` bawaan.
3. Batasi `CORS_ORIGIN` ke domain frontend Anda saja.
4. Gunakan HTTPS di depan server API ini.
5. Buat login SQL Server khusus aplikasi dengan hak terbatas pada database
   ini — jangan pakai `sa`.

---

## 9. Pemecahan Masalah

| Gejala | Penyebab & Solusi |
|---|---|
| `Gagal tersambung ke SQL Server` | Periksa `MSSQL_SERVER`, port/instance, dan firewall. Uji dengan `telnet <host> 1433`. |
| `Login failed for user` | Kredensial salah, atau mode autentikasi server diset *Windows only*. Aktifkan **Mixed Mode** di properti server. |
| `Could not connect using msnodesqlv8` | Mode `MSSQL_TRUSTED=true` dipakai tanpa driver. Jalankan `npm install msnodesqlv8`. |
| `SSL Provider: certificate chain was issued by an authority that is not trusted` | Pastikan `TrustServerCertificate=true` (sudah default di `config/db.js`). |
| `The TCP/IP connection to the host has failed` | Aktifkan protokol **TCP/IP** pada SQL Server Configuration Manager lalu restart service. |
| Tabel tidak ditemukan | `schema.sql` belum dijalankan pada database yang benar. Periksa dropdown database di SSMS. |
| `4060: Cannot open database` | Database belum dibuat, atau user SQL tidak punya hak akses ke database tersebut. |

### Menguji koneksi secara terpisah

```bash
curl http://localhost:4000/api/health
```

Respons sukses:

```json
{ "ok": true, "database": "connected" }
```
