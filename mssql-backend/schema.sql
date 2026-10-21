/* ============================================================================
   Sistem Manajemen Kalibrasi Alat Ukur — Microsoft SQL Server Schema
   ============================================================================
   Target  : SQL Server 2016+ (diuji untuk SQL Server 2019 / SSMS 18+)
   Cara pakai:
     1. Buka file ini di SQL Server Management Studio (SSMS)
     2. Pastikan database tujuan aktif (mis. DbKalibrasi)
     3. Tekan F5 (Execute) — script ini idempotent, aman dijalankan berulang

   Script ini berisi:
     - 5 tabel  : Users, Equipment, Calibration_Tasks, Calibration_Results, Approvals
     - Index     : untuk kolom yang sering di-join / difilter
     - Constraint: CHECK untuk enum, FK untuk relasi, UNIQUE untuk tag & username
     - Trigger   : updated_at otomatis
     - Seed      : 1 akun Admin awal

   Catatan konversi dari PostgreSQL/Supabase:
     - uuid  -> INT IDENTITY
     - jsonb -> NVARCHAR(MAX) + CHECK (ISJSON(...) = 1)
     - enum  -> NVARCHAR + CHECK constraint
     - RLS   -> tidak dipakai; otorisasi ditangani di layer API (JWT + role)
   ============================================================================ */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/* ---------------------------------------------------------------------------
   1. USERS
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        id            INT IDENTITY(1,1) NOT NULL,
        username      NVARCHAR(100)  NOT NULL,
        email         NVARCHAR(255)  NULL,
        password_hash NVARCHAR(255)  NOT NULL,
        full_name     NVARCHAR(200)  NULL,
        role          NVARCHAR(20)   NOT NULL
            CONSTRAINT DF_Users_role       DEFAULT N'Teknisi'
            CONSTRAINT CK_Users_role       CHECK (role IN (N'Admin', N'Teknisi', N'SPV', N'Senior_SPV')),
        is_active     BIT            NOT NULL
            CONSTRAINT DF_Users_is_active  DEFAULT 1,
        created_at    DATETIME2(0)   NOT NULL
            CONSTRAINT DF_Users_created_at DEFAULT SYSDATETIME(),
        updated_at    DATETIME2(0)   NULL,
        CONSTRAINT PK_Users        PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_Users_username UNIQUE (username)
    );
    PRINT '[OK] Tabel dbo.Users dibuat.';
END
ELSE PRINT '[SKIP] dbo.Users sudah ada.';
GO

/* Email bersifat opsional, tetapi bila diisi harus unik (login bisa pakai
   username ATAU email) */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_Users_email' AND object_id = OBJECT_ID(N'dbo.Users')
)
BEGIN
    CREATE UNIQUE INDEX UQ_Users_email
        ON dbo.Users(email)
        WHERE email IS NOT NULL;
    PRINT '[OK] Unique index UQ_Users_email dibuat.';
END
GO

/* ---------------------------------------------------------------------------
   2. EQUIPMENT (master data alat ukur)
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Equipment', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Equipment (
        id             INT IDENTITY(1,1) NOT NULL,
        tag_number     NVARCHAR(50)   NOT NULL,
        nama_alat      NVARCHAR(200)  NOT NULL,
        merk           NVARCHAR(100)  NULL,
        model          NVARCHAR(100)  NULL,
        serial_number  NVARCHAR(100)  NULL,
        parameter_type NVARCHAR(20)   NOT NULL
            CONSTRAINT CK_Equipment_parameter_type
            CHECK (parameter_type IN (N'Suhu', N'Pressure', N'DP', N'RPM')),
        range_min      DECIMAL(18,4)  NULL,
        range_max      DECIMAL(18,4)  NULL,
        unit           NVARCHAR(20)   NULL,
        location       NVARCHAR(200)  NULL,
        created_at     DATETIME2(0)   NOT NULL
            CONSTRAINT DF_Equipment_created_at DEFAULT SYSDATETIME(),
        updated_at     DATETIME2(0)   NULL,
        CONSTRAINT PK_Equipment           PRIMARY KEY CLUSTERED (id),
        CONSTRAINT UQ_Equipment_tag       UNIQUE (tag_number),
        CONSTRAINT CK_Equipment_range     CHECK (range_min IS NULL OR range_max IS NULL OR range_min <= range_max)
    );
    PRINT '[OK] Tabel dbo.Equipment dibuat.';
END
ELSE PRINT '[SKIP] dbo.Equipment sudah ada.';
GO

/* ---------------------------------------------------------------------------
   3. CALIBRATION_TASKS (penugasan kalibrasi)
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Calibration_Tasks', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Calibration_Tasks (
        id            INT IDENTITY(1,1) NOT NULL,
        equipment_id  INT           NOT NULL,
        technician_id INT           NULL,
        status        NVARCHAR(30)  NOT NULL
            CONSTRAINT DF_Tasks_status DEFAULT N'Assigned'
            CONSTRAINT CK_Tasks_status
            CHECK (status IN (N'Assigned', N'In_Progress', N'Submitted',
                              N'SPV_Approved', N'Senior_SPV_Approved', N'Rejected')),
        scheduled_date DATE         NOT NULL,
        completed_at   DATETIME2(0) NULL,
        created_at     DATETIME2(0) NOT NULL
            CONSTRAINT DF_Tasks_created_at DEFAULT SYSDATETIME(),
        updated_at     DATETIME2(0) NULL,
        CONSTRAINT PK_Calibration_Tasks
            PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_Tasks_Equipment
            FOREIGN KEY (equipment_id)  REFERENCES dbo.Equipment(id),
        CONSTRAINT FK_Tasks_Technician
            FOREIGN KEY (technician_id) REFERENCES dbo.Users(id)
            ON DELETE SET NULL
    );
    PRINT '[OK] Tabel dbo.Calibration_Tasks dibuat.';
END
ELSE PRINT '[SKIP] dbo.Calibration_Tasks sudah ada.';
GO

/* ---------------------------------------------------------------------------
   4. CALIBRATION_RESULTS (data hasil ukur teknisi)
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Calibration_Results', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Calibration_Results (
        id               INT IDENTITY(1,1) NOT NULL,
        task_id          INT            NOT NULL,
        as_found_data    NVARCHAR(MAX)  NULL,
        as_left_data     NVARCHAR(MAX)  NULL,
        environment_temp DECIMAL(6,2)   NULL,
        humidity         DECIMAL(6,2)   NULL,
        created_at       DATETIME2(0)   NOT NULL
            CONSTRAINT DF_Results_created_at DEFAULT SYSDATETIME(),
        updated_at       DATETIME2(0)   NULL,
        CONSTRAINT PK_Calibration_Results PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_Results_Task
            FOREIGN KEY (task_id) REFERENCES dbo.Calibration_Tasks(id)
            ON DELETE CASCADE,
        CONSTRAINT CK_Results_as_found_json
            CHECK (as_found_data IS NULL OR ISJSON(as_found_data) = 1),
        CONSTRAINT CK_Results_as_left_json
            CHECK (as_left_data IS NULL OR ISJSON(as_left_data) = 1)
    );
    PRINT '[OK] Tabel dbo.Calibration_Results dibuat.';
END
ELSE PRINT '[SKIP] dbo.Calibration_Results sudah ada.';
GO

/* Satu tugas hanya boleh punya SATU baris hasil kalibrasi. Inilah yang membuat
   tombol "Simpan Draft" bersifat update-or-insert di backend. */
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE name = N'UQ_Results_task' AND object_id = OBJECT_ID(N'dbo.Calibration_Results')
)
BEGIN
    CREATE UNIQUE INDEX UQ_Results_task ON dbo.Calibration_Results(task_id);
    PRINT '[OK] Unique index UQ_Results_task dibuat (1 hasil per tugas).';
END
GO

/* ---------------------------------------------------------------------------
   5. APPROVALS (jejak audit approval SPV & Senior SPV)
   --------------------------------------------------------------------------- */
IF OBJECT_ID(N'dbo.Approvals', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.Approvals (
        id          INT IDENTITY(1,1) NOT NULL,
        task_id     INT            NOT NULL,
        approver_id INT            NOT NULL,
        stage       NVARCHAR(20)   NOT NULL
            CONSTRAINT CK_Approvals_stage
            CHECK (stage IN (N'SPV', N'Senior_SPV')),
        decision    NVARCHAR(10)   NOT NULL
            CONSTRAINT CK_Approvals_decision
            CHECK (decision IN (N'Approved', N'Rejected')),
        notes       NVARCHAR(MAX)  NULL,
        created_at  DATETIME2(0)   NOT NULL
            CONSTRAINT DF_Approvals_created_at DEFAULT SYSDATETIME(),
        CONSTRAINT PK_Approvals PRIMARY KEY CLUSTERED (id),
        CONSTRAINT FK_Approvals_Task
            FOREIGN KEY (task_id)     REFERENCES dbo.Calibration_Tasks(id) ON DELETE CASCADE,
        CONSTRAINT FK_Approvals_Approver
            FOREIGN KEY (approver_id) REFERENCES dbo.Users(id)
    );
    PRINT '[OK] Tabel dbo.Approvals dibuat.';
END
ELSE PRINT '[SKIP] dbo.Approvals sudah ada.';
GO

/* ---------------------------------------------------------------------------
   6. INDEX
   --------------------------------------------------------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Tasks_equipment' AND object_id = OBJECT_ID(N'dbo.Calibration_Tasks'))
    CREATE INDEX IX_Tasks_equipment  ON dbo.Calibration_Tasks(equipment_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Tasks_technician' AND object_id = OBJECT_ID(N'dbo.Calibration_Tasks'))
    CREATE INDEX IX_Tasks_technician ON dbo.Calibration_Tasks(technician_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Tasks_status' AND object_id = OBJECT_ID(N'dbo.Calibration_Tasks'))
    CREATE INDEX IX_Tasks_status     ON dbo.Calibration_Tasks(status);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Tasks_sched' AND object_id = OBJECT_ID(N'dbo.Calibration_Tasks'))
    CREATE INDEX IX_Tasks_sched      ON dbo.Calibration_Tasks(scheduled_date);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Results_task' AND object_id = OBJECT_ID(N'dbo.Calibration_Results'))
    CREATE INDEX IX_Results_task     ON dbo.Calibration_Results(task_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Approvals_task' AND object_id = OBJECT_ID(N'dbo.Approvals'))
    CREATE INDEX IX_Approvals_task   ON dbo.Approvals(task_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Approvals_approver' AND object_id = OBJECT_ID(N'dbo.Approvals'))
    CREATE INDEX IX_Approvals_approver ON dbo.Approvals(approver_id);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_Users_role' AND object_id = OBJECT_ID(N'dbo.Users'))
    CREATE INDEX IX_Users_role       ON dbo.Users(role);
GO

/* ---------------------------------------------------------------------------
   7. CATATAN PENTING — kolom updated_at
   ---------------------------------------------------------------------------
   Kolom updated_at TIDAK diisi oleh trigger, melainkan di-set eksplisit
   (updated_at = SYSDATETIME()) pada setiap statement UPDATE di layer API.

   Alasannya: SQL Server melarang klausa OUTPUT tanpa INTO bila tabel target
   memiliki trigger yang aktif (error 334). Hampir semua endpoint di aplikasi
   ini memakai "OUTPUT INSERTED.*" untuk mengembalikan baris hasil operasi,
   sehingga keberadaan trigger akan mematahkan seluruh alur CRUD.

   Konsekuensi: bila Anda menambah UPDATE baru, sertakan juga updated_at.
   --------------------------------------------------------------------------- */
PRINT '[INFO] updated_at diisi eksplisit oleh API (tanpa trigger).';
GO

/* ---------------------------------------------------------------------------
   8. SEED — akun Admin awal
   ---------------------------------------------------------------------------
   Login  : admin
   Sandi  : admin123   <-- SEGERA ganti setelah login pertama
   ============================================================================ */
IF NOT EXISTS (SELECT 1 FROM dbo.Users WHERE username = N'admin')
BEGIN
    INSERT INTO dbo.Users (username, email, password_hash, full_name, role)
    VALUES (
        N'admin',
        N'admin@kalibrasi.local',
        N'$2a$10$cdtcplxsDIiz3qBVCkrcc.oU5Vzk1wTYiPL8o3wrcwB/3vhJD8SH6',
        N'Administrator',
        N'Admin'
    );
    PRINT '[OK] Akun admin awal dibuat (admin / admin123).';
END
ELSE PRINT '[SKIP] Akun admin sudah ada.';
GO

/* ---------------------------------------------------------------------------
   VERIFIKASI
   --------------------------------------------------------------------------- */
SELECT  t.name AS Tabel,
        (SELECT COUNT(*) FROM sys.columns c WHERE c.object_id = t.object_id) AS JumlahKolom
FROM    sys.tables t
WHERE   t.schema_id = SCHEMA_ID(N'dbo')
  AND   t.name IN (N'Users', N'Equipment', N'Calibration_Tasks',
                   N'Calibration_Results', N'Approvals')
ORDER BY t.name;

SELECT  u.id, u.username, u.email, u.full_name, u.role, u.created_at
FROM    dbo.Users u
ORDER BY u.id;
GO
