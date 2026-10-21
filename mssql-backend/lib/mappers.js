/*
  Mapper: SQL Server mengembalikan baris datar (flat), sedangkan frontend
  mengharapkan objek bersarang (task.equipment, task.technician, task.result).
  Semua konversi tipe tanggal juga ditangani di sini.

  Pool dikonfigurasi dengan useUTC = true, sehingga DATE dan DATETIME2
  diparse sebagai UTC. Karena itu kita membaca komponen tanggal memakai
  getUTC* agar tidak bergeser satu hari pada zona waktu tertentu.
*/

/** DATE -> 'YYYY-MM-DD' */
export function toDateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** DATETIME2 -> ISO 8601 string */
export function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Numeric dari SQL Server bisa berupa string pada tipe DECIMAL. */
export function toNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function parseJson(value) {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    email: row.email ?? null,
    full_name: row.full_name ?? null,
    role: row.role,
    is_active: row.is_active === undefined ? undefined : Boolean(row.is_active),
    created_at: toIso(row.created_at),
  };
}

export function mapEquipment(row) {
  if (!row) return null;
  return {
    id: row.id,
    tag_number: row.tag_number,
    nama_alat: row.nama_alat,
    merk: row.merk ?? null,
    model: row.model ?? null,
    serial_number: row.serial_number ?? null,
    parameter_type: row.parameter_type,
    range_min: toNumber(row.range_min),
    range_max: toNumber(row.range_max),
    unit: row.unit ?? null,
    location: row.location ?? null,
    created_at: toIso(row.created_at),
  };
}

export function mapResult(row) {
  if (!row) return null;
  return {
    id: row.id,
    task_id: row.task_id,
    as_found_data: parseJson(row.as_found_data),
    as_left_data: parseJson(row.as_left_data),
    environment_temp: toNumber(row.environment_temp),
    humidity: toNumber(row.humidity),
    created_at: toIso(row.created_at),
  };
}

export function mapApproval(row) {
  if (!row) return null;
  return {
    id: row.id,
    task_id: row.task_id,
    approver_id: row.approver_id,
    stage: row.stage,
    decision: row.decision,
    notes: row.notes ?? null,
    created_at: toIso(row.created_at),
    approver: row.approver_id_2
      ? mapUser({
          id: row.approver_id_2,
          username: row.approver_username,
          email: row.approver_email,
          full_name: row.approver_full_name,
          role: row.approver_role,
          created_at: row.approver_created_at,
        })
      : undefined,
  };
}

export function mapTask(row, { withRelations = true } = {}) {
  if (!row) return null;

  const task = {
    id: row.id,
    equipment_id: row.equipment_id,
    technician_id: row.technician_id ?? null,
    status: row.status,
    scheduled_date: toDateOnly(row.scheduled_date),
    completed_at: toIso(row.completed_at),
    created_at: toIso(row.created_at),
  };

  if (withRelations) {
    task.equipment = mapEquipment({
      id: row.equipment_id,
      tag_number: row.equipment_tag_number,
      nama_alat: row.equipment_nama_alat,
      merk: row.equipment_merk,
      model: row.equipment_model,
      serial_number: row.equipment_serial_number,
      parameter_type: row.equipment_parameter_type,
      range_min: row.equipment_range_min,
      range_max: row.equipment_range_max,
      unit: row.equipment_unit,
      location: row.equipment_location,
      created_at: row.equipment_created_at,
    });

    task.technician = row.technician_id
      ? mapUser({
          id: row.technician_id,
          username: row.technician_username,
          email: row.technician_email,
          full_name: row.technician_full_name,
          role: row.technician_role,
          created_at: row.technician_created_at,
        })
      : null;

    // result bernilai null bila tugas belum memiliki data kalibrasi.
    task.result = row.result_id == null
      ? null
      : mapResult({
          id: row.result_id,
          task_id: row.id,
          as_found_data: row.result_as_found_data,
          as_left_data: row.result_as_left_data,
          environment_temp: row.result_environment_temp,
          humidity: row.result_humidity,
          created_at: row.result_created_at,
        });
  }

  return task;
}

/* SELECT standar untuk tugas — dipakai ulang oleh semua endpoint tugas. */
export const TASK_SELECT = `
  SELECT t.id, t.equipment_id, t.technician_id, t.status,
         t.scheduled_date, t.completed_at, t.created_at,

         e.tag_number         AS equipment_tag_number,
         e.nama_alat          AS equipment_nama_alat,
         e.merk               AS equipment_merk,
         e.model              AS equipment_model,
         e.serial_number      AS equipment_serial_number,
         e.parameter_type     AS equipment_parameter_type,
         e.range_min          AS equipment_range_min,
         e.range_max          AS equipment_range_max,
         e.unit               AS equipment_unit,
         e.location           AS equipment_location,
         e.created_at         AS equipment_created_at,

         u.username           AS technician_username,
         u.email              AS technician_email,
         u.full_name          AS technician_full_name,
         u.role               AS technician_role,
         u.created_at         AS technician_created_at,

         r.id                 AS result_id,
         r.as_found_data      AS result_as_found_data,
         r.as_left_data       AS result_as_left_data,
         r.environment_temp   AS result_environment_temp,
         r.humidity           AS result_humidity,
         r.created_at         AS result_created_at
  FROM dbo.Calibration_Tasks t
  LEFT JOIN dbo.Equipment e     ON e.id = t.equipment_id
  LEFT JOIN dbo.Users u         ON u.id = t.technician_id
  LEFT JOIN dbo.Calibration_Results r ON r.task_id = t.id
`;

/* SELECT standar untuk approval beserta data pemberi approval. */
export const APPROVAL_SELECT = `
  SELECT a.id, a.task_id, a.approver_id, a.stage, a.decision, a.notes, a.created_at,
         u.id         AS approver_id_2,
         u.username   AS approver_username,
         u.email      AS approver_email,
         u.full_name  AS approver_full_name,
         u.role       AS approver_role,
         u.created_at AS approver_created_at
  FROM dbo.Approvals a
  LEFT JOIN dbo.Users u ON u.id = a.approver_id
`;
