import express from 'express';
import { query, queryOne } from '../config/db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { asyncHandler, badRequest, notFound, forbidden, intParam } from '../lib/http.js';
import { mapResult } from '../lib/mappers.js';

const router = express.Router();

/** Hasil hanya boleh diubah selama tugas belum masuk proses approval. */
const EDITABLE_STATUSES = ['Assigned', 'In_Progress', 'Rejected'];

function serializeResultPayload(body) {
  const { as_found_data: asFound, as_left_data: asLeft, environment_temp: temp, humidity } = body ?? {};

  const nullOrNumber = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  const t = nullOrNumber(temp);
  const h = nullOrNumber(humidity);

  if (t !== null && Number.isNaN(t)) throw badRequest('Suhu lingkungan tidak valid.');
  if (h !== null && Number.isNaN(h)) throw badRequest('Kelembapan tidak valid.');

  return {
    as_found_data: asFound === undefined ? null : JSON.stringify(asFound),
    as_left_data: asLeft === undefined ? null : JSON.stringify(asLeft),
    environment_temp: t,
    humidity: h,
  };
}

/** Cek hak akses: teknisi pemilik tugas, atau Admin saat tugas masih bisa diedit. */
async function assertCanWriteResults(taskId, user) {
  const task = await queryOne(
    'SELECT id, technician_id, status FROM dbo.Calibration_Tasks WHERE id = @id',
    { id: taskId }
  );
  if (!task) throw notFound('Tugas tidak ditemukan.');

  const isOwner = task.technician_id === user.id;

  if (user.role === 'Teknisi' && !isOwner) {
    throw forbidden('Anda hanya dapat mengisi tugas milik Anda.');
  }
  if (user.role !== 'Teknisi' && user.role !== 'Admin') {
    throw forbidden('Hanya Teknisi atau Admin yang dapat mengisi data kalibrasi.');
  }
  if (!EDITABLE_STATUSES.includes(task.status)) {
    throw badRequest(`Tugas berstatus ${task.status} tidak dapat diubah lagi.`);
  }
  return task;
}

/** Insert atau update — satu tugas hanya memiliki satu baris hasil. */
async function upsertResult(taskId, payload) {
  const existing = await queryOne(
    'SELECT id FROM dbo.Calibration_Results WHERE task_id = @taskId',
    { taskId }
  );

  if (existing) {
    return queryOne(
      `UPDATE dbo.Calibration_Results
          SET as_found_data = @as_found_data,
              as_left_data  = @as_left_data,
              environment_temp = @environment_temp,
              humidity = @humidity,
              updated_at = SYSDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @rid`,
      { ...payload, rid: existing.id }
    );
  }

  return queryOne(
    `INSERT INTO dbo.Calibration_Results
       (task_id, as_found_data, as_left_data, environment_temp, humidity)
     OUTPUT INSERTED.*
     VALUES (@task_id, @as_found_data, @as_left_data, @environment_temp, @humidity)`,
    { task_id: taskId, ...payload }
  );
}

/* GET /api/results/:taskId */
router.get('/:taskId', authRequired, asyncHandler(async (req, res) => {
  const taskId = intParam(req.params.taskId, 'taskId');

  const task = await queryOne(
    'SELECT id, technician_id FROM dbo.Calibration_Tasks WHERE id = @id',
    { id: taskId }
  );
  if (!task) throw notFound('Tugas tidak ditemukan.');
  if (req.user.role === 'Teknisi' && task.technician_id !== req.user.id) {
    throw forbidden('Ini bukan tugas Anda.');
  }

  const row = await queryOne('SELECT * FROM dbo.Calibration_Results WHERE task_id = @taskId', { taskId });
  if (!row) throw notFound('Hasil kalibrasi belum diisi.');
  res.json(mapResult(row));
}));

/* POST /api/results — dipakai "Simpan Draft" dan "Submit untuk Review" */
router.post('/', authRequired, asyncHandler(async (req, res) => {
  const { task_id: taskId } = req.body ?? {};
  if (!taskId) throw badRequest('Task ID wajib diisi.');

  const id = intParam(taskId, 'task_id');
  await assertCanWriteResults(id, req.user);

  const row = await upsertResult(id, serializeResultPayload(req.body));
  res.json(mapResult(row));
}));

/* PUT /api/results/:taskId — sama dengan POST, untuk semantik REST */
router.put('/:taskId', authRequired, asyncHandler(async (req, res) => {
  const taskId = intParam(req.params.taskId, 'taskId');
  await assertCanWriteResults(taskId, req.user);

  const row = await upsertResult(taskId, serializeResultPayload(req.body));
  res.json(mapResult(row));
}));

/* DELETE /api/results/:taskId (Admin) */
router.delete('/:taskId', authRequired, requireRole('Admin'), asyncHandler(async (req, res) => {
  const taskId = intParam(req.params.taskId, 'taskId');
  const rows = await query(
    'DELETE FROM dbo.Calibration_Results OUTPUT DELETED.id WHERE task_id = @taskId',
    { taskId }
  );
  if (rows.length === 0) throw notFound('Hasil kalibrasi tidak ditemukan.');
  res.json({ ok: true });
}));

export default router;
