/* ============================================================================
   PERSIAPAN AKSES — jalankan SEKALI sebagai sysadmin di SQL Server
   ============================================================================
   Server : 10.14.1.81\SQLTESTO

   Mengapa file ini diperlukan?
   Uji koneksi menghasilkan: "Login failed for user ''" (ELOGIN).
   Artinya server SQL-nya terjangkau dan Windows Authentication sudah
   dinegosiasikan, TETAPI akun Windows Anda belum terdaftar sebagai login
   di SQL Server tersebut. File ini mendaftarkannya.

   CARA PAKAI
     - Buka SSMS, sambungkan sebagai sysadmin (mis. akun 'sa' atau akun
       domain yang sudah punya hak)
     - Buka file ini, sesuaikan nama akun di bagian PALING ATAS, tekan F5
   ============================================================================ */

SET NOCOUNT ON;
GO

/* ---------------------------------------------------------------------------
   LANGKAH 0 — Sesuaikan nilai berikut dengan akun Anda
   ---------------------------------------------------------------------------
   Akun Windows yang terdeteksi dari sisi klien:  Interbat
   Bila komputer ini berada dalam domain, gunakan format DOMAIN\namaUser.
   ============================================================================ */
DECLARE @WindowsLogin SYSNAME = N'Interbat';      -- <-- SESUAIKAN BILA PERLU
DECLARE @DatabaseName SYSNAME = N'DbKalibrasi';   -- <-- SESUAIKAN BILA PERLU

/* ---------------------------------------------------------------------------
   LANGKAH 1 — Buat database bila belum ada
   --------------------------------------------------------------------------- */
IF DB_ID(@DatabaseName) IS NULL
BEGIN
    DECLARE @sqlCreate NVARCHAR(MAX) = N'CREATE DATABASE ' + QUOTENAME(@DatabaseName) + N';';
    EXEC sp_executesql @sqlCreate;
    PRINT N'[OK] Database ' + @DatabaseName + N' dibuat.';
END
ELSE
    PRINT N'[SKIP] Database ' + @DatabaseName + N' sudah ada.';
GO

/* ---------------------------------------------------------------------------
   LANGKAH 2 — Daftarkan akun Windows sebagai login SQL Server
   --------------------------------------------------------------------------- */
DECLARE @WindowsLogin SYSNAME = N'Interbat';
DECLARE @DatabaseName SYSNAME = N'DbKalibrasi';

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @WindowsLogin)
BEGIN
    DECLARE @sqlLogin NVARCHAR(MAX) =
        N'CREATE LOGIN ' + QUOTENAME(@WindowsLogin) + N' FROM WINDOWS;';
    EXEC sp_executesql @sqlLogin;
    PRINT N'[OK] Login Windows ' + @WindowsLogin + N' didaftarkan.';
END
ELSE
    PRINT N'[SKIP] Login ' + @WindowsLogin + N' sudah terdaftar.';

/* Beri hak akses ke database aplikasi.
   db_owner dipilih agar aplikasi dapat membuat tabel via schema.sql.
   Setelah tabel terbentuk, Anda dapat menurunkannya ke db_datareader +
   db_datawriter bila ingin lebih ketat. */
DECLARE @sqlUser NVARCHAR(MAX) = N'
USE ' + QUOTENAME(@DatabaseName) + N';
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = ' + QUOTENAME(@WindowsLogin, '''') + N')
    CREATE USER ' + QUOTENAME(@WindowsLogin) + N' FOR LOGIN ' + QUOTENAME(@WindowsLogin) + N';
ALTER ROLE db_owner ADD MEMBER ' + QUOTENAME(@WindowsLogin) + N';';
EXEC sp_executesql @sqlUser;
PRINT N'[OK] ' + @WindowsLogin + N' diberi akses ke ' + @DatabaseName + N'.';
GO

/* ---------------------------------------------------------------------------
   LANGKAH 3 — Verifikasi
   --------------------------------------------------------------------------- */
SELECT  sp.name AS LoginName,
        sp.type_desc AS TipeLogin,
        sp.is_disabled AS Nonaktif
FROM    sys.server_principals sp
WHERE   sp.name NOT LIKE N'##%'
  AND   sp.type IN ('S', 'U', 'G')
ORDER BY sp.name;
GO

PRINT N'';
PRINT N'Selesai. Langkah berikutnya:';
PRINT N'  1. Jalankan schema.sql pada database DbKalibrasi (SSMS)';
PRINT N'  2. Kembali ke terminal, jalankan: npm run dev';
GO
