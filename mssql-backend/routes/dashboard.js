import express from 'express';
import { query, queryOne } from '../config/db.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler } from '../lib/http.js';
import { mapTask, TASK_SELECT } from '../lib/mappers.js';

const router = express.Router();

/* GET /api/dashboard/stats — angka ringkasan + tugas terbaru untuk halaman Dashboard */
router.get('/stats', authRequired, asyncHandler(async (req, res) => {
  const isTechnician = req.user.role === 'Teknisi';

  // Teknisi hanya melihat ringkasan tugasnya sendiri.
  const scope = isTechnician ? 'WHERE t.technician_id = @selfId' : '';
  const params = isTechnician ? { selfId: req.user.id } : undefined;

  const totals = await queryOne(
    `SELECT
       (SELECT COUNT(*) FROM dbo.Equipment) AS total_equipment,
       COUNT(*) AS total_tasks,
       SUM(CASE WHEN t.status = N'Submitted' THEN 1 ELSE 0 END) AS pending_spv,
       SUM(CASE WHEN t.status = N'SPV_Approved' THEN 1 ELSE 0 END) AS pending_senior,
       SUM(CASE WHEN t.status = N'Senior_SPV_Approved' THEN 1 ELSE 0 END) AS approved,
       SUM(CASE WHEN t.status = N'Rejected' THEN 1 ELSE 0 END) AS rejected,
       SUM(CASE WHEN t.status IN (N'Assigned', N'In_Progress') THEN 1 ELSE 0 END) AS active
     FROM dbo.Calibration_Tasks t
     ${scope}`,
    params
  );

  const recent = await query(
    `${TASK_SELECT}
     ${scope}
     ORDER BY t.created_at DESC, t.id DESC`,
    params
  );

  const num = (v) => Number(v ?? 0);

  res.json({
    equipment: num(totals?.total_equipment),
    tasks: num(totals?.total_tasks),
    pending: num(totals?.pending_spv) + num(totals?.pending_senior),
    pending_spv: num(totals?.pending_spv),
    pending_senior: num(totals?.pending_senior),
    approved: num(totals?.approved),
    rejected: num(totals?.rejected),
    active: num(totals?.active),
    recent_tasks: recent.slice(0, 5).map((r) => mapTask(r)),
  });
}));

/* GET /api/dashboard/workload?date=YYYY-MM-DD — beban tugas per teknisi,
   dipakai fitur "Penugasan Otomatis" pada kalender (beban dalam rentang ±3 hari). */
router.get('/workload', authRequired, asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  const rows = await query(
    `SELECT u.id, u.username, u.full_name, u.role,
            COALESCE(load.cnt, 0) AS load_count
       FROM dbo.Users u
       LEFT JOIN (
            SELECT t.technician_id, COUNT(*) AS cnt
              FROM dbo.Calibration_Tasks t
             WHERE t.scheduled_date BETWEEN DATEADD(day, -3, @date) AND DATEADD(day, 3, @date)
             GROUP BY t.technician_id
       ) load ON load.technician_id = u.id
      WHERE u.role = N'Teknisi' AND u.is_active = 1
      ORDER BY load_count ASC, ISNULL(u.full_name, u.username) ASC`,
    { date }
  );

  res.json(rows.map((r) => ({
    id: r.id,
    username: r.username,
    full_name: r.full_name ?? null,
    role: r.role,
    load_count: Number(r.load_count ?? 0),
  })));
}));

export default router;
