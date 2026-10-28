/* Jalankan di SSMS setelah memilih database DbKalibrasi. */
USE [DbKalibrasi];
GO

-- Semua kolom pada tabel yang dipakai backend, termasuk PK, identity, dan default.
SELECT
    s.name AS schema_name,
    t.name AS table_name,
    c.column_id,
    c.name AS column_name,
    ty.name AS data_type,
    CASE
      WHEN ty.name IN (N'nvarchar', N'nchar') AND c.max_length > 0 THEN c.max_length / 2
      WHEN ty.name IN (N'varchar', N'char', N'varbinary', N'binary') THEN c.max_length
      ELSE NULL
    END AS max_length,
    c.precision,
    c.scale,
    c.is_nullable,
    c.is_identity,
    dc.definition AS default_definition,
    CASE WHEN pk.column_id IS NULL THEN 0 ELSE 1 END AS is_primary_key
FROM sys.tables AS t
JOIN sys.schemas AS s ON s.schema_id = t.schema_id
JOIN sys.columns AS c ON c.object_id = t.object_id
JOIN sys.types AS ty ON ty.user_type_id = c.user_type_id
LEFT JOIN sys.default_constraints AS dc
    ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
LEFT JOIN (
    SELECT ic.object_id, ic.column_id
    FROM sys.indexes AS i
    JOIN sys.index_columns AS ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    WHERE i.is_primary_key = 1
) AS pk ON pk.object_id = c.object_id AND pk.column_id = c.column_id
WHERE s.name = N'dbo'
  AND t.name IN (N'Users', N'Equipment', N'Calibration_Tasks', N'Calibration_Results', N'Approvals', N'Standard_Instruments')
ORDER BY t.name, c.column_id;
GO

-- Foreign keys dan indeks pada tabel-tabel tersebut.
SELECT
    t.name AS table_name,
    N'FOREIGN KEY' AS object_type,
    fk.name AS object_name,
    COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS column_name,
    OBJECT_SCHEMA_NAME(fkc.referenced_object_id) + N'.' + OBJECT_NAME(fkc.referenced_object_id) AS references_table,
    COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS references_column
FROM sys.foreign_keys AS fk
JOIN sys.foreign_key_columns AS fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.tables AS t ON t.object_id = fk.parent_object_id
WHERE t.schema_id = SCHEMA_ID(N'dbo')
  AND t.name IN (N'Users', N'Equipment', N'Calibration_Tasks', N'Calibration_Results', N'Approvals', N'Standard_Instruments')
UNION ALL
SELECT
    t.name,
    N'INDEX',
    i.name,
    STRING_AGG(COL_NAME(ic.object_id, ic.column_id), N', '),
    NULL,
    NULL
FROM sys.indexes AS i
JOIN sys.tables AS t ON t.object_id = i.object_id
JOIN sys.index_columns AS ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
WHERE t.schema_id = SCHEMA_ID(N'dbo')
  AND t.name IN (N'Users', N'Equipment', N'Calibration_Tasks', N'Calibration_Results', N'Approvals', N'Standard_Instruments')
  AND i.name IS NOT NULL
GROUP BY t.name, i.name, ic.object_id, ic.index_id
ORDER BY table_name, object_type, object_name;
GO

-- Daftar tabel target yang belum ada.
SELECT expected.table_name
FROM (VALUES
    (N'Users'), (N'Equipment'), (N'Calibration_Tasks'),
    (N'Calibration_Results'), (N'Approvals'), (N'Standard_Instruments')
) AS expected(table_name)
WHERE OBJECT_ID(N'dbo.' + expected.table_name, N'U') IS NULL;
GO
