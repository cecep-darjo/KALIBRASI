import express from 'express';
import { query, queryOne } from '../config/db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import {
  asyncHandler, badRequest, notFound, forbidden, intParam, assertEnum,
} from '../lib/http.js';
import { mapTask, mapApproval, toDateOnly, TASK_SELECT, APPROVAL_SELECT } from '../lib/mappers.js';

const router = express.Router();

const STATUSES = ['Assigned', 'In_Progress', 'Submitted', 'SPV_Approved', 'Senior_SPV_Approved', 'Rejected'];
const APPROVAL_STATUSES = ['SPV_Approved', 'Senior_SPV_Approved', 'Rejected'];
/* Status yang boleh ditetapkan teknisi lewat /:id/status. */
const EDITABLE_STATUSES = ['In_Progress', 'Submitted'];
/* Status tugas yang masih boleh dikerjakan teknisi. */
const WORKABLE_STATUSES = ['Assigned', 'In_Progress', 'Rejected'];

/** Pastikan user yang dipilih benar-benar ada dan berperan Teknisi. */
async function assertTechnician(techId) {
  const tech = await queryOne('SELECT id, role FROM dbo.Users WHERE id = @id', { id: Number(techId) });
  if (!tech) throw badRequest('Teknisi tidak ditemukan.');
  if (tech.role !== 'Teknisi') throw badRequest('Pengguna yang dipilih bukan Teknisi.');
}

/* GET /api/tasks?status=&technician_id=&equipment_id=&from=&to=
   Teknisi hanya melihat tugas miliknya sendiri. */
router.get('/', authRequired, asyncHandler(async (req, res) => {
  const { status, technician_id: techId, equipment_id: eqId, from, to } = req.query;
  if (status) assertEnum(status, STATUSES, 'Status');

  const clauses = [];
  const params = {};

  if (req.user.role === 'Teknisi') {
    clauses.push('t.technician_id = @selfId');
    params.selfId = req.user.id;
  } else if (techId) {
    clauses.push('t.technician_id = @techId');
    params.techId = Number(techId);
  }

  if (status) { clauses.push('t.status = @status'); params.status = status; }
  if (eqId) { clauses.push('t.equipment_id = @eqId'); params.eqId = Number(eqId); }
  if (from) { clauses.push('t.scheduled_date >= @from'); params.from = from; }
  if (to) { clauses.push('t.scheduled_date <= @to'); params.to = to; }

  const rows = await query(
    `${TASK_SELECT}
     ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
     ORDER BY t.scheduled_date DESC, t.id DESC`,
    params
  );
  res.json(rows.map((r) => mapTask(r)));
}));

/* GET /api/tasks/:id */
router.get('/:id', authRequired, asyncHandler(async (req, res) => {
  const row = await queryOne(`${TASK_SELECT} WHERE t.id = @id`, { id: intParam(req.params.id) });
  if (!row) throw notFound('Tugas tidak ditemukan.');

  if (req.user.role === 'Teknisi' && row.technician_id !== req.user.id) {
    throw forbidden('Anda hanya dapat melihat tugas milik Anda.');
  }
  res.json(mapTask(row));
}));

/* GET /api/tasks/:id/approvals — riwayat approval sebuah tugas */
router.get('/:id/approvals', authRequired, asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const rows = await query(`${APPROVAL_SELECT} WHERE a.task_id = @id ORDER BY a.created_at`, { id });
  res.json(rows.map(mapApproval));
}));

/* POST /api/tasks — Admin menugaskan kalibrasi */
router.post('/', authRequired, requireRole('Admin'), asyncHandler(async (req, res) => {
  const { equipment_id: equipmentId, technician_id: techId, scheduled_date: scheduledDate } = req.body ?? {};

  if (!equipmentId) throw badRequest('Alat wajib dipilih.');
  if (!scheduledDate) throw badRequest('Tanggal jadwal wajib diisi.');

  const equipment = await queryOne('SELECT id FROM dbo.Equipment WHERE id = @id', { id: Number(equipmentId) });
  if (!equipment) throw badRequest('Alat tidak ditemukan.');
  if (techId) await assertTechnician(techId);

  const created = await queryOne(
    `INSERT INTO dbo.Calibration_Tasks (equipment_id, technician_id, scheduled_date, status)
     OUTPUT INSERTED.id
     VALUES (@equipment_id, @technician_id, @scheduled_date, N'Assigned')`,
    {
      equipment_id: Number(equipmentId),
      technician_id: techId ? Number(techId) : null,
      scheduled_date: toDateOnly(scheduledDate),
    }
  );

  const row = await queryOne(`${TASK_SELECT} WHERE t.id = @id`, { id: created.id });
  res.status(201).json(mapTask(row));
}));

/* PUT /api/tasks/:id — Admin mengubah penugasan (alat, teknisi, jadwal).
   Perubahan status tidak di sini — pakai /status atau /api/approvals. */
router.put('/:id', authRequired, requireRole('Admin'), asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const body = req.body ?? {};

  const task = await queryOne('SELECT id FROM dbo.Calibration_Tasks WHERE id = @id', { id });
  if (!task) throw notFound('Tugas tidak ditemukan.');

  const sets = [];
  const params = { id };

  if (body.equipment_id !== undefined) {
    const equipment = await queryOne('SELECT id FROM dbo.Equipment WHERE id = @id', {
      id: Number(body.equipment_id),
    });
    if (!equipment) throw badRequest('Alat tidak ditemukan.');
    sets.push('equipment_id = @equipment_id');
    params.equipment_id = Number(body.equipment_id);
  }

  // technician_id boleh dikosongkan secara sengaja (null).
  if (Object.prototype.hasOwnProperty.call(body, 'technician_id')) {
    if (body.technician_id) await assertTechnician(body.technician_id);
    sets.push('technician_id = @technician_id');
    params.technician_id = body.technician_id ? Number(body.technician_id) : null;
  }

  if (body.scheduled_date !== undefined) {
    if (!body.scheduled_date) throw badRequest('Tanggal jadwal tidak boleh kosong.');
    sets.push('scheduled_date = @scheduled_date');
    params.scheduled_date = toDateOnly(body.scheduled_date);
  }

  if (sets.length === 0) throw badRequest('Tidak ada perubahan yang dikirim.');

  await query(
    `UPDATE dbo.Calibration_Tasks SET ${sets.join(', ')}, updated_at = SYSDATETIME() WHERE id = @id`,
    params
  );

  const row = await queryOne(`${TASK_SELECT} WHERE t.id = @id`, { id });
  res.json(mapTask(row));
}));

/* PUT /api/tasks/:id/status — teknisi menyimpan draft atau mengirim untuk review.
   Status approval hanya boleh lewat /api/approvals agar jejak audit tercatat. */
router.put('/:id/status', authRequired, asyncHandler(async (req, res) => {
  const id = intParam(req.params.id);
  const { status, completed_at: completedAt } = req.body ?? {};
  assertEnum(status, STATUSES, 'Status');

  const task = await queryOne(
    'SELECT id, technician_id, status FROM dbo.Calibration_Tasks WHERE id = @id',
    { id }
  );
  if (!task) throw notFound('Tugas tidak ditemukan.');

  if (APPROVAL_STATUSES.includes(status)) {
    throw badRequest('Status approval hanya dapat diubah melalui endpoint /api/approvals.');
  }

  /* Hanya status kerja yang boleh ditetapkan lewat endpoint ini. */
  if (!EDITABLE_STATUSES.includes(status)) {
    throw badRequest(`Status ${status} tidak dapat ditetapkan melalui endpoint ini.`);
  }

  if (req.user.role === 'Teknisi') {
    if (task.technician_id !== req.user.id) throw forbidden('Ini bukan tugas Anda.');
  } else {
    throw forbidden('Status pengerjaan hanya dapat ditetapkan oleh Teknisi pemilik tugas.');
  }

  /* Tugas yang sudah masuk proses approval tidak boleh dikembalikan diam-diam. */
  if (!WORKABLE_STATUSES.includes(task.status)) {
    throw badRequest(`Tugas berstatus ${task.status} tidak dapat diubah lagi.`);
  }

  if (status === 'Submitted') {
    const result = await queryOne('SELECT id FROM dbo.Calibration_Results WHERE task_id = @id', { id });
    if (!result) throw badRequest('Isi data kalibrasi terlebih dahulu sebelum dikirim untuk review.');
  }

  await query(
    `UPDATE dbo.Calibration_Tasks
        SET status = @status,
            completed_at = CASE WHEN @setCompleted = 1 THEN @completed_at ELSE completed_at END,
            updated_at = SYSDATETIME()
      WHERE id = @id`,
    {
      status,
      setCompleted: status === 'Submitted' ? 1 : 0,
      completed_at: status === 'Submitted' ? (completedAt ?? new Date().toISOString()) : null,
      id,
    }
  );

  const row = await queryOne(`${TASK_SELECT} WHERE t.id = @id`, { id });
  res.json(mapTask(row));
}));

/* DELETE /api/tasks/:id (Admin) — hasil & approval ikut terhapus (CASCADE). */
router.delete('/:id', authRequired, requireRole('Admin'), asyncHandler(async (req, res) => {
  const rows = await query(
    'DELETE FROM dbo.Calibration_Tasks OUTPUT DELETED.id WHERE id = @id',
    { id: intParam(req.params.id) }
  );
  if (rows.length === 0) throw notFound('Tugas tidak ditemukan.');
  res.json({ ok: true });
}));

export default router;
