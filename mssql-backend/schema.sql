-- ============================================================
-- Sistem Manajemen Kalibrasi Alat Ukur — SQL Server 2019 Schema
-- ============================================================
-- Run with: sqlcmd -S <server> -U <user> -P <pass> -d <db> -i schema.sql
-- ============================================================

CREATE TABLE Users (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  username      NVARCHAR(100)  NOT NULL UNIQUE,
  password_hash NVARCHAR(255)  NOT NULL,
  full_name     NVARCHAR(200)  NULL,
  role          NVARCHAR(20)   NOT NULL DEFAULT 'Teknisi'
                CHECK (role IN ('Admin','Teknisi','SPV','Senior_SPV')),
  created_at    DATETIME2      NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE Equipment (
  id             INT IDENTITY(1,1) PRIMARY KEY,
  tag_number     NVARCHAR(50)  NOT NULL UNIQUE,
  nama_alat      NVARCHAR(200) NOT NULL,
  merk           NVARCHAR(100) NULL,
  model          NVARCHAR(100) NULL,
  serial_number  NVARCHAR(100) NULL,
  parameter_type NVARCHAR(20)  NOT NULL
                 CHECK (parameter_type IN ('Suhu','Pressure','DP','RPM')),
  range_min      DECIMAL(18,4) NULL,
  range_max      DECIMAL(18,4) NULL,
  unit           NVARCHAR(20)  NULL,
  location       NVARCHAR(200) NULL,
  created_at     DATETIME2     NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE Calibration_Tasks (
  id            INT IDENTITY(1,1) PRIMARY KEY,
  equipment_id  INT NOT NULL REFERENCES Equipment(id),
  technician_id INT NULL REFERENCES Users(id),
  status        NVARCHAR(30) NOT NULL DEFAULT 'Assigned'
                CHECK (status IN ('Assigned','In_Progress','Submitted','SPV_Approved','Senior_SPV_Approved','Rejected')),
  scheduled_date DATE NOT NULL,
  completed_at  DATETIME2 NULL,
  created_at    DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE Calibration_Results (
  id              INT IDENTITY(1,1) PRIMARY KEY,
  task_id         INT NOT NULL REFERENCES Calibration_Tasks(id) ON DELETE CASCADE,
  as_found_data   NVARCHAR(MAX) NULL,  -- JSON
  as_left_data    NVARCHAR(MAX) NULL,  -- JSON
  environment_temp DECIMAL(6,2) NULL,
  humidity        DECIMAL(6,2) NULL,
  created_at      DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

CREATE TABLE Approvals (
  id          INT IDENTITY(1,1) PRIMARY KEY,
  task_id     INT NOT NULL REFERENCES Calibration_Tasks(id) ON DELETE CASCADE,
  approver_id INT NOT NULL REFERENCES Users(id),
  stage       NVARCHAR(20) NOT NULL CHECK (stage IN ('SPV','Senior_SPV')),
  decision    NVARCHAR(10) NOT NULL CHECK (decision IN ('Approved','Rejected')),
  notes       NVARCHAR(MAX) NULL,
  created_at  DATETIME2 NOT NULL DEFAULT SYSDATETIME()
);

CREATE INDEX idx_tasks_equipment  ON Calibration_Tasks(equipment_id);
CREATE INDEX idx_tasks_technician ON Calibration_Tasks(technician_id);
CREATE INDEX idx_tasks_status     ON Calibration_Tasks(status);
CREATE INDEX idx_results_task     ON Calibration_Results(task_id);
CREATE INDEX idx_approvals_task   ON Approvals(task_id);
