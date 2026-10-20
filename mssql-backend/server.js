import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import PdfPrinter from 'pdfmake';
import QRCode from 'qrcode';
import { query, queryOne, sql } from './config/db.js';
import 'dotenv/config';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const PORT = process.env.PORT || 4000;

// ---------- Auth middleware ----------
function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

// ---------- Auth ----------
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await queryOne('SELECT * FROM Users WHERE username = @username', { username });
  if (!user) return res.status(401).json({ error: 'User not found' });
  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role } });
});

app.post('/api/auth/register', async (req, res) => {
  const { username, password, full_name, role } = req.body;
  const hash = await bcrypt.hash(password, 10);
  try {
    const row = await queryOne(
      `INSERT INTO Users (username, password_hash, full_name, role) OUTPUT INSERTED.* VALUES (@username, @hash, @full_name, @role)`,
      { username, hash, full_name: full_name ?? null, role: role ?? 'Teknisi' }
    );
    res.json(row);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- Equipment ----------
app.get('/api/equipment', authRequired, async (_req, res) => {
  const rows = await query('SELECT * FROM Equipment ORDER BY created_at DESC');
  res.json(rows);
});

app.post('/api/equipment', authRequired, requireRole('Admin'), async (req, res) => {
  const { tag_number, nama_alat, merk, model, serial_number, parameter_type, range_min, range_max, unit, location } = req.body;
  const row = await queryOne(
    `INSERT INTO Equipment (tag_number, nama_alat, merk, model, serial_number, parameter_type, range_min, range_max, unit, location)
     OUTPUT INSERTED.* VALUES (@tag, @nama, @merk, @model, @serial, @ptype, @rmin, @rmax, @unit, @loc)`,
    { tag: tag_number, nama: nama_alat, merk: merk ?? null, model: model ?? null, serial: serial_number ?? null, ptype: parameter_type, rmin: range_min ?? null, rmax: range_max ?? null, unit: unit ?? null, loc: location ?? null }
  );
  res.json(row);
});

app.put('/api/equipment/:id', authRequired, requireRole('Admin'), async (req, res) => {
  const { tag_number, nama_alat, merk, model, serial_number, parameter_type, range_min, range_max, unit, location } = req.body;
  await query(
    `UPDATE Equipment SET tag_number=@tag, nama_alat=@nama, merk=@merk, model=@model, serial_number=@serial, parameter_type=@ptype, range_min=@rmin, range_max=@rmax, unit=@unit, location=@loc WHERE id=@id`,
    { tag: tag_number, nama: nama_alat, merk: merk ?? null, model: model ?? null, serial: serial_number ?? null, ptype: parameter_type, rmin: range_min ?? null, rmax: range_max ?? null, unit: unit ?? null, loc: location ?? null, id: Number(req.params.id) }
  );
  const row = await queryOne('SELECT * FROM Equipment WHERE id = @id', { id: Number(req.params.id) });
  res.json(row);
});

app.delete('/api/equipment/:id', authRequired, requireRole('Admin'), async (req, res) => {
  await query('DELETE FROM Equipment WHERE id = @id', { id: Number(req.params.id) });
  res.json({ ok: true });
});

// ---------- Calibration Tasks ----------
app.get('/api/tasks', authRequired, async (req, res) => {
  const rows = await query(
    `SELECT t.*, e.tag_number, e.nama_alat, e.parameter_type, u.full_name AS technician_name
     FROM Calibration_Tasks t
     LEFT JOIN Equipment e ON e.id = t.equipment_id
     LEFT JOIN Users u ON u.id = t.technician_id
     ORDER BY t.scheduled_date DESC`
  );
  res.json(rows);
});

app.post('/api/tasks', authRequired, requireRole('Admin'), async (req, res) => {
  const { equipment_id, technician_id, scheduled_date } = req.body;
  const row = await queryOne(
    `INSERT INTO Calibration_Tasks (equipment_id, technician_id, scheduled_date, status)
     OUTPUT INSERTED.* VALUES (@eq, @tech, @date, 'Assigned')`,
    { eq: Number(equipment_id), tech: technician_id ? Number(technician_id) : null, date: scheduled_date }
  );
  res.json(row);
});

app.put('/api/tasks/:id/status', authRequired, async (req, res) => {
  const { status, completed_at } = req.body;
  await query(
    `UPDATE Calibration_Tasks SET status=@status, completed_at=@completed WHERE id=@id`,
    { status, completed: completed_at ?? null, id: Number(req.params.id) }
  );
  res.json({ ok: true });
});

// ---------- Calibration Results ----------
app.get('/api/results/:taskId', authRequired, async (req, res) => {
  const row = await queryOne('SELECT * FROM Calibration_Results WHERE task_id = @taskId', { taskId: Number(req.params.taskId) });
  res.json(row);
});

app.post('/api/results', authRequired, requireRole('Teknisi'), async (req, res) => {
  const { task_id, as_found_data, as_left_data, environment_temp, humidity } = req.body;
  const existing = await queryOne('SELECT id FROM Calibration_Results WHERE task_id = @taskId', { taskId: Number(task_id) });
  if (existing) {
    await query(
      `UPDATE Calibration_Results SET as_found_data=@af, as_left_data=@al, environment_temp=@et, humidity=@h WHERE id=@id`,
      { af: JSON.stringify(as_found_data), al: JSON.stringify(as_left_data), et: environment_temp ?? null, h: humidity ?? null, id: existing.id }
    );
    res.json({ ok: true, id: existing.id });
  } else {
    const row = await queryOne(
      `INSERT INTO Calibration_Results (task_id, as_found_data, as_left_data, environment_temp, humidity)
       OUTPUT INSERTED.* VALUES (@taskId, @af, @al, @et, @h)`,
      { taskId: Number(task_id), af: JSON.stringify(as_found_data), al: JSON.stringify(as_left_data), et: environment_temp ?? null, h: humidity ?? null }
    );
    res.json(row);
  }
});

// ---------- Approvals ----------
app.post('/api/approvals', authRequired, async (req, res) => {
  const { task_id, stage, decision, notes } = req.body;
  const row = await queryOne(
    `INSERT INTO Approvals (task_id, approver_id, stage, decision, notes)
     OUTPUT INSERTED.* VALUES (@taskId, @approverId, @stage, @decision, @notes)`,
    { taskId: Number(task_id), approverId: Number(req.user.id), stage, decision, notes: notes ?? null }
  );
  const newStatus = decision === 'Approved' ? (stage === 'SPV' ? 'SPV_Approved' : 'Senior_SPV_Approved') : 'Rejected';
  await query('UPDATE Calibration_Tasks SET status = @status WHERE id = @id', { status: newStatus, id: Number(task_id) });
  res.json(row);
});

// ---------- PDF Report ----------
const fonts = { Roboto: { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' } };
const printer = new PdfPrinter(fonts);

app.get('/api/reports/:taskId', authRequired, async (req, res) => {
  const task = await queryOne(
    `SELECT t.*, e.tag_number, e.nama_alat, e.merk, e.model, e.serial_number, e.parameter_type, e.range_min, e.range_max, e.unit, e.location,
            u.full_name AS technician_name
     FROM Calibration_Tasks t
     LEFT JOIN Equipment e ON e.id = t.equipment_id
     LEFT JOIN Users u ON u.id = t.technician_id
     WHERE t.id = @id`, { id: Number(req.params.taskId) }
  );
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (task.status !== 'Senior_SPV_Approved') return res.status(400).json({ error: 'Report not yet approved' });

  const result = await queryOne('SELECT * FROM Calibration_Results WHERE task_id = @id', { id: task.id });
  const approvals = await query(
    `SELECT a.*, u.full_name AS approver_name FROM Approvals a JOIN Users u ON u.id = a.approver_id WHERE a.task_id = @id ORDER BY a.created_at`,
    { id: task.id }
  );

  const asFound = result?.as_found_data ? JSON.parse(result.as_found_data) : { points: [] };
  const asLeft = result?.as_left_data ? JSON.parse(result.as_left_data) : { points: [] };
  const unit = asFound.unit || '';
  const tableFor = (data, title) => {
    const body = [[{ text: 'No.', style: 'th' }, { text: `Standar (${unit})`, style: 'th' }, { text: `Bacaan (${unit})`, style: 'th' }, { text: `Error (${unit})`, style: 'th' }]];
    (data.points || []).forEach((p, i) => body.push([String(i + 1), p.standard || '-', p.reading || '-', p.error || '-']));
    return [{ text: title, style: 'h3' }, { table: { widths: [30, '*', '*', '*'], body }, margin: [0, 0, 0, 12] }];
  };

  const verificationPayload = JSON.stringify({ taskId: task.id, tag: task.tag_number, status: task.status, date: task.completed_at });
  const qrDataUrl = await QRCode.toDataURL(verificationPayload, { margin: 1, width: 160 });

  const docDefinition = {
    content: [
      { text: 'LAPORAN HASIL KALIBRASI', style: 'title' },
      { text: `No. Dokumen: LKK-${String(task.id).padStart(8, '0')}`, style: 'subtitle', margin: [0, 2, 0, 4] },
      { text: `Tanggal: ${new Date(task.completed_at).toLocaleDateString('id-ID')}`, style: 'subtitle', margin: [0, 0, 0, 16] },
      { text: 'Informasi Alat', style: 'h3' },
      {
        table: {
          widths: ['auto', '*'],
          body: [
            ['Tag Number', task.tag_number],
            ['Nama Alat', task.nama_alat],
            ['Merk / Model', `${task.merk || '-'} / ${task.model || '-'}`],
            ['Serial Number', task.serial_number || '-'],
            ['Parameter', task.parameter_type],
            ['Range', task.range_min != null ? `${task.range_min} - ${task.range_max} ${task.unit || ''}` : '-'],
            ['Lokasi', task.location || '-'],
          ],
        },
        margin: [0, 0, 0, 12],
      },
      { text: 'Kondisi Lingkungan', style: 'h3' },
      { text: `Suhu: ${result?.environment_temp ?? '-'} °C    |    Kelembapan: ${result?.humidity ?? '-'} %RH    |    Teknisi: ${task.technician_name || '-'}`, margin: [0, 0, 0, 12] },
      ...tableFor(asFound, 'Data As-Found'),
      ...tableFor(asLeft, 'Data As-Left'),
      ...(asFound.lkk_notes ? [{ text: 'Catatan LKK', style: 'h3' }, { text: asFound.lkk_notes, margin: [0, 0, 0, 12] }] : []),
      { text: 'Riwayat Persetujuan', style: 'h3' },
      {
        table: {
          widths: ['auto', '*', 'auto', 'auto'],
          body: [
            [{ text: 'Tahap', style: 'th' }, { text: 'Pemberi Persetujuan', style: 'th' }, { text: 'Keputusan', style: 'th' }, { text: 'Tanggal', style: 'th' }],
            ...approvals.map(a => [a.stage === 'SPV' ? 'Supervisor' : 'Senior Supervisor', a.approver_name || '-', a.decision === 'Approved' ? 'Disetujui' : 'Ditolak', new Date(a.created_at).toLocaleDateString('id-ID')]),
          ],
        },
        margin: [0, 0, 0, 16],
      },
      { image: qrDataUrl, width: 120, margin: [0, 16, 0, 4] },
      { text: 'Pindai QR code untuk memverifikasi keaslian laporan ini.', style: 'subtitle' },
    ],
    styles: {
      title: { fontSize: 20, bold: true, color: '#0f766e' },
      subtitle: { fontSize: 10, color: '#64748b' },
      h3: { fontSize: 13, bold: true, color: '#0f766e', margin: [0, 12, 0, 4] },
      th: { fontSize: 9, bold: true, color: '#64748b', fillColor: '#f1f5f9' },
    },
    defaultStyle: { fontSize: 10 },
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="LKK-${task.tag_number}.pdf"`);
  pdfDoc.pipe(res);
  pdfDoc.end();
});

app.listen(PORT, () => console.log(`[server] KalibrasiMS API running on http://localhost:${PORT}`));
