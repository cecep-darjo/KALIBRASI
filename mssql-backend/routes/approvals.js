import express from 'express';
import { query, queryOne, withTransaction, requestWith } from '../config/db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import {
  asyncHandler, badRequest, conflict, notFound, forbidden, intParam, assertEnum, nullable,
} from '../lib/http.js';
import { mapApproval, mapTask, APPROVAL_SELECT, TASK_SELECT } from '../lib/mappers.js';

const router = express.Router();

const STAGES = ['SPV', 'Senior_SPV'];
const DECISIONS = ['Approved', 'Rejected'];

/* Status tugas yang sah menjadi pintu masuk tiap tahap. */
const INCOMING = { SPV: 'Submitted', Senior_SPV: 'SPV_Approved' };

/* Peran yang berhak menekan tombol pada tiap tahap. */
const STAGE_ROLE = { SPV: 'SPV', Senior_SPV: 'Senior_SPV' };

const RESULT_STATUS = {
  SPV: { Approved: 'SPV_Approved', Rejected: 'Rejected' },
  Senior_SPV: { Approved: 'Senior_SPV_Approved', Rejected: 'Rejected' },
};

/* GET /api/approvals/task/:taskId — riwayat approval sebuah tugas */
router.get('/task/:taskId', authRequired, asyncHandler(async (req, res) => {
  const taskId = intParam(req.params.taskId, 'taskId');
  const rows = await query(
    `${APPROVAL_SELECT} WHERE a.task_id = @taskId ORDER BY a.created_at, a.id`,
    { taskId }
  );
  res.json(rows.map(mapApproval));
}));

/* GET /api/approvals?stage=SPV — daftar approval (audit) */
router.get('/', authRequired, requireRole('Admin', 'SPV', 'Senior_SPV'), asyncHandler(async (req, res) => {
  const { stage } = req.query;
  if (stage) assertEnum(stage, STAGES, 'Tahap');
  const rows = await query(
    `${APPROVAL_SELECT}
     ${stage ? 'WHERE a.stage = @stage' : ''}
     ORDER BY a.created_at DESC`,
    stage ? { stage } : undefined
  );
  res.json(rows.map(mapApproval));
}));

/* POST /api/approvals — catat keputusan approval dan ubah status tugas.
   Dilakukan dalam satu transaksi agar jejak audit dan status tidak pernah
   berbeda satu sama lain. */
router.post('/', authRequired, requireRole('Admin', 'SPV', 'Senior_SPV'), asyncHandler(async (req, res) => {
  const { task_id: taskId, stage, decision, notes } = req.body ?? {};

  if (!taskId) throw badRequest('Task ID wajib diisi.');
  const id = intParam(taskId, 'task_id');
  assertEnum(stage, STAGES, 'Tahap');
  assertEnum(decision, DECISIONS, 'Keputusan');

  // Hanya peran yang sesuai yang boleh bertindak pada tahapnya.
  if (req.user.role !== 'Admin' && req.user.role !== STAGE_ROLE[stage]) {
    throw forbidden(`Tahap ${stage} hanya dapat diproses oleh ${STAGE_ROLE[stage]}.`);
  }

  const result = await withTransaction(async (trx) => {
    // Kunci baris tugas agar dua approval bersamaan tidak saling menimpa.
    const taskReq = requestWith(trx, { id });
    const taskRes = await taskReq.query(
      `SELECT id, status, technician_id
         FROM dbo.Calibration_Tasks WITH (UPDLOCK, ROWLOCK)
        WHERE id = @id`
    );
    const task = taskRes.recordset?.[0];
    if (!task) throw notFound('Tugas tidak ditemukan.');

    if (task.status !== INCOMING[stage]) {
      throw conflict(
        `Tugas berstatus ${task.status}, tidak dapat diproses pada tahap ${stage}. ` +
        `Tahap ini memerlukan status ${INCOMING[stage]}.`
      );
    }

    const newStatus = RESULT_STATUS[stage][decision];

    // Bila ditolak, hasil lama dipertahankan agar teknisi dapat memperbaiki.
    await requestWith(trx, {
      task_id: id,
      approver_id: req.user.id,
      stage,
      decision,
      notes: nullable(notes),
    }).query(
      `INSERT INTO dbo.Approvals (task_id, approver_id, stage, decision, notes)
       VALUES (@task_id, @approver_id, @stage, @decision, @notes)`
    );

    await requestWith(trx, { status: newStatus, id }).query(
      `UPDATE dbo.Calibration_Tasks SET status = @status, updated_at = SYSDATETIME() WHERE id = @id`
    );

    return { newStatus };
  });

  const full = await queryOne(`${TASK_SELECT} WHERE t.id = @id`, { id });
  res.status(201).json({ task: mapTask(full), status: result.newStatus });
}));

export default router;
