import express from 'express';
import { query, queryOne } from '../config/db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { mapStandardInstrument } from '../lib/mappers.js';
import {
  asyncHandler, badRequest, conflict, notFound, intParam, assertEnum, nullable,
} from '../lib/http.js';

const router = express.Router();
const PARAM_TYPES = ['Suhu', 'Pressure', 'DP', 'RPM'];
const SELECT_FIELDS = `id, standard_code, name, parameter_type, manufacturer, model,
  serial_number, certificate_number, range_min, range_max, unit,
  calibration_due_date, master_correction, expanded_uncertainty, calibration_lab,
  is_active, created_at, updated_at`;

function readBody(body) {
  const { standard_code, name, parameter_type, manufacturer, model, serial_number,
    certificate_number, range_min, range_max, unit, calibration_due_date,
    master_correction, expanded_uncertainty, calibration_lab, is_active } = body ?? {};
  if (!standard_code || !String(standard_code).trim()) throw badRequest('Kode standar wajib diisi.');
  if (!name || !String(name).trim()) throw badRequest('Nama kalibrator standar wajib diisi.');
  assertEnum(parameter_type, PARAM_TYPES, 'Tipe parameter');

  const min = nullable(range_min) === null ? null : Number(range_min);
  const max = nullable(range_max) === null ? null : Number(range_max);
  if ((min !== null && !Number.isFinite(min)) || (max !== null && !Number.isFinite(max))) {
    throw badRequest('Range harus berupa angka yang valid.');
  }
  if (min !== null && max !== null && min > max) throw badRequest('Range minimum melebihi range maksimum.');
  if (calibration_due_date && Number.isNaN(Date.parse(calibration_due_date))) {
    throw badRequest('Tanggal kalibrasi berikutnya tidak valid.');
  }
  const correction = nullable(master_correction) === null ? null : Number(master_correction);
  const uncertainty = nullable(expanded_uncertainty) === null ? null : Number(expanded_uncertainty);
  if ([correction, uncertainty].some((v) => v !== null && !Number.isFinite(v))
      || (uncertainty !== null && uncertainty < 0)) {
    throw badRequest('Koreksi dan ketidakpastian master harus berupa angka valid (ketidakpastian tidak boleh negatif).');
  }

  return {
    standard_code: String(standard_code).trim(),
    name: String(name).trim(),
    parameter_type,
    manufacturer: nullable(manufacturer),
    model: nullable(model),
    serial_number: nullable(serial_number),
    certificate_number: nullable(certificate_number),
    range_min: min,
    range_max: max,
    unit: nullable(unit),
    calibration_due_date: nullable(calibration_due_date),
    master_correction: correction,
    expanded_uncertainty: uncertainty,
    calibration_lab: nullable(calibration_lab),
    is_active: is_active === undefined ? 1 : (is_active ? 1 : 0),
  };
}

/* Daftar aktif tersedia bagi teknisi; Admin dapat meminta seluruh data. */
router.get('/', authRequired, asyncHandler(async (req, res) => {
  const clauses = [];
  const params = {};
  if (req.query.parameter_type) {
    assertEnum(req.query.parameter_type, PARAM_TYPES, 'Tipe parameter');
    clauses.push('parameter_type = @parameter_type');
    params.parameter_type = req.query.parameter_type;
  }
  const includeInactive = req.user.role === 'Admin' && req.query.include_inactive === 'true';
  if (!includeInactive) {
    clauses.push('is_active = 1 AND (calibration_due_date IS NULL OR calibration_due_date >= CAST(SYSDATETIME() AS date))');
  }
  const rows = await query(
    `SELECT ${SELECT_FIELDS} FROM dbo.Standard_Instruments
     ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY parameter_type, standard_code`,
    params
  );
  res.json(rows.map(mapStandardInstrument));
}));

router.post('/', authRequired, requireRole('Admin'), asyncHandler(async (req, res) => {
  const data = readBody(req.body);
  const duplicate = await queryOne(
    'SELECT id FROM dbo.Standard_Instruments WHERE standard_code = @standard_code',
    { standard_code: data.standard_code }
  );
  if (duplicate) throw conflict('Kode standar sudah digunakan.');

  const row = await queryOne(
    `INSERT INTO dbo.Standard_Instruments
      (standard_code, name, parameter_type, manufacturer, model, serial_number,
       certificate_number, range_min, range_max, unit, calibration_due_date,
       master_correction, expanded_uncertainty, calibration_lab, is_active)
     OUTPUT INSERTED.*
     VALUES (@standard_code, @name, @parameter_type, @manufacturer, @model, @serial_number,
       @certificate_number, @range_min, @range_max, @unit, @calibration_due_date,
       @master_correction, @expanded_uncertainty, @calibration_lab, @is_active)`,
    data
  );
  res.status(201).json(mapStandardInstrument(row));
}));

router.put('/:id', authRequired, requireRole('Admin'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const data = readBody(req.body);
  const duplicate = await queryOne(
    'SELECT id FROM dbo.Standard_Instruments WHERE standard_code = @standard_code AND id <> @id',
    { standard_code: data.standard_code, id }
  );
  if (duplicate) throw conflict('Kode standar sudah digunakan.');

  const row = await queryOne(
    `UPDATE dbo.Standard_Instruments
        SET standard_code = @standard_code, name = @name, parameter_type = @parameter_type,
            manufacturer = @manufacturer, model = @model, serial_number = @serial_number,
            certificate_number = @certificate_number, range_min = @range_min,
            range_max = @range_max, unit = @unit, calibration_due_date = @calibration_due_date,
            master_correction = @master_correction, expanded_uncertainty = @expanded_uncertainty,
            calibration_lab = @calibration_lab,
            is_active = @is_active, updated_at = SYSDATETIME()
      OUTPUT INSERTED.*
      WHERE id = @id`,
    { ...data, id }
  );
  if (!row) throw notFound('Kalibrator standar tidak ditemukan.');
  res.json(mapStandardInstrument(row));
}));

export default router;
