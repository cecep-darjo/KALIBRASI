import express from 'express';
import { query, queryOne } from '../config/db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import {
  asyncHandler, badRequest, conflict, notFound, intParam, assertEnum, nullable,
} from '../lib/http.js';

const router = express.Router();
const PARAM_TYPES = ['Suhu', 'Pressure', 'DP', 'RPM'];
const SELECT_FIELDS = `id, tag_number, nama_alat, merk, model, serial_number,
                       parameter_type, range_min, range_max, unit, location,
                       created_at, updated_at`;

function readBody(body) {
  const {
    tag_number, nama_alat, merk, model, serial_number,
    parameter_type, range_min, range_max, unit, location,
  } = body ?? {};

  if (!tag_number || String(tag_number).trim() === '') throw badRequest('Tag Number wajib diisi.');
  if (!nama_alat || String(nama_alat).trim() === '') throw badRequest('Nama Alat wajib diisi.');
  assertEnum(parameter_type, PARAM_TYPES, 'Tipe Parameter');

  const rmin = nullable(range_min);
  const rmax = nullable(range_max);
  if (rmin != null && rmax != null && Number(rmin) > Number(rmax)) {
    throw badRequest('Range minimum tidak boleh lebih besar dari range maksimum.');
  }

  return {
    tag_number: String(tag_number).trim(),
    nama_alat: String(nama_alat).trim(),
    merk: nullable(merk),
    model: nullable(model),
    serial_number: nullable(serial_number),
    parameter_type,
    range_min: rmin,
    range_max: rmax,
    unit: nullable(unit),
    location: nullable(location),
  };
}

/* GET /api/equipment?search=&parameter_type= */
router.get('/', authRequired, asyncHandler(async (req, res) => {
  const { search, parameter_type: ptype } = req.query;
  if (ptype) assertEnum(ptype, PARAM_TYPES, 'Tipe Parameter');

  const clauses = [];
  const params = {};
  if (search) {
    clauses.push('(tag_number LIKE @q OR nama_alat LIKE @q OR serial_number LIKE @q)');
    params.q = `%${String(search).trim()}%`;
  }
  if (ptype) {
    clauses.push('parameter_type = @ptype');
    params.ptype = ptype;
  }

  const rows = await query(
    `SELECT ${SELECT_FIELDS} FROM dbo.Equipment
     ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY tag_number`,
    params
  );
  res.json(rows);
}));

/* GET /api/equipment/:id */
router.get('/:id', authRequired, asyncHandler(async (req, res) => {
  const row = await queryOne(
    `SELECT ${SELECT_FIELDS} FROM dbo.Equipment WHERE id = @id`,
    { id: intParam(req.params.id) }
  );
  if (!row) throw notFound('Alat tidak ditemukan.');
  res.json(row);
}));

/* POST /api/equipment (Admin) */
router.post('/', authRequired, requireRole('Admin'), asyncHandler(async (req, res) => {
  const data = readBody(req.body);

  const dupe = await queryOne('SELECT id FROM dbo.Equipment WHERE tag_number = @tag', {
    tag: data.tag_number,
  });
  if (dupe) throw conflict(`Tag Number ${data.tag_number} sudah terdaftar.`);

  const row = await queryOne(
    `INSERT INTO dbo.Equipment
       (tag_number, nama_alat, merk, model, serial_number,
        parameter_type, range_min, range_max, unit, location)
     OUTPUT INSERTED.id, INSERTED.tag_number, INSERTED.nama_alat, INSERTED.merk,
            INSERTED.model, INSERTED.serial_number, INSERTED.parameter_type,
            INSERTED.range_min, INSERTED.range_max, INSERTED.unit, INSERTED.location,
            INSERTED.created_at
     VALUES (@tag_number, @nama_alat, @merk, @model, @serial_number,
             @parameter_type, @range_min, @range_max, @unit, @location)`,
    data
  );
  res.status(201).json(row);
}));

/* PUT /api/equipment/:id (Admin) */
router.put('/:id', authRequired, requireRole('Admin'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const data = readBody(req.body);

  const dupe = await queryOne(
    'SELECT id FROM dbo.Equipment WHERE tag_number = @tag AND id <> @id',
    { tag: data.tag_number, id }
  );
  if (dupe) throw conflict(`Tag Number ${data.tag_number} sudah dipakai alat lain.`);

  const row = await queryOne(
    `UPDATE dbo.Equipment
        SET tag_number = @tag_number, nama_alat = @nama_alat, merk = @merk,
            model = @model, serial_number = @serial_number,
            parameter_type = @parameter_type, range_min = @range_min,
            range_max = @range_max, unit = @unit, location = @location,
            updated_at = SYSDATETIME()
      OUTPUT INSERTED.id, INSERTED.tag_number, INSERTED.nama_alat, INSERTED.merk,
             INSERTED.model, INSERTED.serial_number, INSERTED.parameter_type,
             INSERTED.range_min, INSERTED.range_max, INSERTED.unit, INSERTED.location,
             INSERTED.created_at
      WHERE id = @id`,
    { ...data, id }
  );
  if (!row) throw notFound('Alat tidak ditemukan.');
  res.json(row);
}));

/* DELETE /api/equipment/:id (Admin) */
router.delete('/:id', authRequired, requireRole('Admin'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);

  const used = await queryOne(
    'SELECT TOP 1 id FROM dbo.Calibration_Tasks WHERE equipment_id = @id',
    { id }
  );
  if (used) {
    throw conflict('Alat ini masih terhubung ke tugas kalibrasi dan tidak dapat dihapus.');
  }

  const rows = await query('DELETE FROM dbo.Equipment OUTPUT DELETED.id WHERE id = @id', { id });
  if (rows.length === 0) throw notFound('Alat tidak ditemukan.');
  res.json({ ok: true });
}));

export default router;
