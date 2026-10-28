/*
  Upgrade existing KalibrasiMS databases without dropping or recreating data.
  Run this script in SSMS on database DbKalibrasi.
  Safe to run repeatedly.
*/
USE [DbKalibrasi];
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF OBJECT_ID(N'dbo.Users', N'U') IS NULL
    THROW 50001, 'Tabel dbo.Users tidak ditemukan di DbKalibrasi.', 1;
GO

IF COL_LENGTH(N'dbo.Users', N'email') IS NULL
    ALTER TABLE dbo.Users ADD email NVARCHAR(255) NULL;
GO

IF COL_LENGTH(N'dbo.Users', N'is_active') IS NULL
    ALTER TABLE dbo.Users ADD is_active BIT NOT NULL
        CONSTRAINT DF_Users_is_active DEFAULT (1) WITH VALUES;
GO

IF COL_LENGTH(N'dbo.Users', N'updated_at') IS NULL
    ALTER TABLE dbo.Users ADD updated_at DATETIME2(0) NULL;
GO

IF OBJECT_ID(N'dbo.Equipment', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.Equipment', N'updated_at') IS NULL
    ALTER TABLE dbo.Equipment ADD updated_at DATETIME2(0) NULL;
GO

IF OBJECT_ID(N'dbo.Calibration_Tasks', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.Calibration_Tasks', N'updated_at') IS NULL
    ALTER TABLE dbo.Calibration_Tasks ADD updated_at DATETIME2(0) NULL;
GO

IF OBJECT_ID(N'dbo.Calibration_Results', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.Calibration_Results', N'updated_at') IS NULL
    ALTER TABLE dbo.Calibration_Results ADD updated_at DATETIME2(0) NULL;
GO

SELECT t.name AS table_name, c.name AS column_name, TYPE_NAME(c.user_type_id) AS data_type
FROM sys.tables AS t
JOIN sys.columns AS c ON c.object_id = t.object_id
WHERE t.schema_id = SCHEMA_ID(N'dbo')
  AND t.name IN (N'Users', N'Equipment', N'Calibration_Tasks', N'Calibration_Results')
  AND c.name IN (N'email', N'is_active', N'updated_at')
ORDER BY t.name, c.name;
GO
