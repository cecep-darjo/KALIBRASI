import express from 'express';
import PdfPrinter from 'pdfmake';
import QRCode from 'qrcode';
import { query, queryOne } from '../config/db.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler, notFound, badRequest, intParam } from '../lib/http.js';
import { mapTask, mapApproval, toDateOnly, toIso, TASK_SELECT, APPROVAL_SELECT } from '../lib/mappers.js';

const router = express.Router();

/* pdfmake dengan font standar PDF (tidak perlu file font eksternal). */
const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
};
const printer = new PdfPrinter(fonts);

const STATUS_APPROVED = 'Senior_SPV_Approved';

function formatDateId(value) {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

/** Ambil data lengkap satu tugas untuk laporan. */
async function loadReportData(taskId) {
  const row = await queryOne(`${TASK_SELECT} WHERE t.id = @id`, { id: taskId });
  if (!row) return null;

  const approvalRows = await query(
    `${APPROVAL_SELECT} WHERE a.task_id = @id ORDER BY a.created_at, a.id`,
    { id: taskId }
  );

  return {
    task: mapTask(row),
    approvals: approvalRows.map(mapApproval),
  };
}

/* GET /api/reports — daftar tugas yang siap diterbitkan */
router.get('/', authRequired, asyncHandler(async (_req, res) => {
  const rows = await query(
    `${TASK_SELECT}
      WHERE t.status = @status
      ORDER BY t.completed_at DESC, t.id DESC`,
    { status: STATUS_APPROVED }
  );
  res.json(rows.map((r) => mapTask(r)));
}));

/* GET /api/reports/:taskId/verify — data verifikasi QR (publik, tanpa token) */
router.get('/:taskId/verify', asyncHandler(async (req, res) => {
  const taskId = intParam(req.params.taskId, 'taskId');
  const row = await queryOne(
    `SELECT t.id, t.status, t.completed_at, e.tag_number, e.nama_alat
       FROM dbo.Calibration_Tasks t
       LEFT JOIN dbo.Equipment e ON e.id = t.equipment_id
      WHERE t.id = @id`,
    { id: taskId }
  );
  if (!row) throw notFound('Dokumen tidak ditemukan.');

  const docNumber = `LKK-${String(row.id).padStart(8, '0')}`;
  res.json({
    valid: row.status === STATUS_APPROVED,
    document_number: docNumber,
    task_id: row.id,
    tag_number: row.tag_number,
    nama_alat: row.nama_alat,
    status: row.status,
    completed_at: toIso(row.completed_at),
  });
}));

/* GET /api/reports/:taskId — data laporan dalam bentuk JSON (untuk pratinjau) */
router.get('/:taskId', authRequired, asyncHandler(async (req, res) => {
  const data = await loadReportData(intParam(req.params.taskId, 'taskId'));
  if (!data) throw notFound('Tugas tidak ditemukan.');
  res.json(data);
}));

/* GET /api/reports/:taskId/pdf — unduh laporan PDF */
router.get('/:taskId/pdf', authRequired, asyncHandler(async (req, res) => {
  const { task, approvals } = await loadReportData(intParam(req.params.taskId, 'taskId'))
    ?? { task: null, approvals: [] };

  if (!task) throw notFound('Tugas tidak ditemukan.');
  if (task.status !== STATUS_APPROVED) {
    throw badRequest('Laporan belum disetujui Senior Supervisor sehingga belum dapat diterbitkan.');
  }

  const result = task.result;
  const asFound = result?.as_found_data ?? {};
  const asLeft = result?.as_left_data ?? {};
  const unit = asFound.unit || task.equipment?.unit || '';
  const docNumber = `LKK-${String(task.id).padStart(8, '0')}`;

  const pointsTable = (data, title) => {
    const points = Array.isArray(data.points) ? data.points : [];
    const body = [[
      { text: 'No.', style: 'th' },
      { text: `Standar ${unit && `(${unit})`}`, style: 'th' },
      { text: `Bacaan ${unit && `(${unit})`}`, style: 'th' },
      { text: `Error ${unit && `(${unit})`}`, style: 'th' },
    ]];
    points.forEach((p, i) => {
      body.push([
        String(i + 1),
        p?.standard || '-',
        p?.reading || '-',
        p?.error || '-',
      ]);
    });
    if (points.length === 0) {
      body.push([{ text: 'Tidak ada data', colSpan: 4, alignment: 'center', color: '#94a3b8' }, '', '', '']);
    }
    return [
      { text: title, style: 'h3' },
      {
        table: { headerRows: 1, widths: [30, '*', '*', '*'], body },
        margin: [0, 0, 0, 12],
      },
    ];
  };

  const verificationUrl =
    process.env.REPORT_VERIFY_BASE_URL
      ? `${process.env.REPORT_VERIFY_BASE_URL.replace(/\/$/, '')}/verify/${task.id}`
      : `KalibrasiMS|LKK|${task.id}|${task.equipment?.tag_number ?? ''}|${task.status}`;

  const qrDataUrl = await QRCode.toDataURL(verificationUrl, { margin: 1, width: 200 });

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 40, 40, 50],
    content: [
      { text: 'LAPORAN HASIL KALIBRASI', style: 'title' },
      { text: 'Sistem Manajemen Kalibrasi Alat Ukur — KalibrasiMS', style: 'subtitle', margin: [0, 2, 0, 2] },
      { text: `No. Dokumen: ${docNumber}`, style: 'subtitle' },
      { text: `Tanggal Terbit: ${formatDateId(task.completed_at)}`, style: 'subtitle', margin: [0, 0, 0, 16] },

      { text: 'Informasi Alat', style: 'h3' },
      {
        table: {
          widths: ['auto', '*', 'auto', '*'],
          body: [
            ['Tag Number', task.equipment?.tag_number ?? '-', 'Parameter', task.equipment?.parameter_type ?? '-'],
            ['Nama Alat', task.equipment?.nama_alat ?? '-', 'Merk / Model', `${task.equipment?.merk ?? '-'} / ${task.equipment?.model ?? '-'}`],
            ['Serial Number', task.equipment?.serial_number ?? '-', 'Lokasi', task.equipment?.location ?? '-'],
            ['Range', task.equipment?.range_min != null
              ? `${task.equipment.range_min} – ${task.equipment.range_max} ${task.equipment?.unit ?? ''}`
              : '-', 'Jadwal', toDateOnly(task.scheduled_date) ?? '-'],
          ],
        },
        margin: [0, 0, 0, 12],
      },

      { text: 'Kondisi Lingkungan', style: 'h3' },
      {
        table: {
          widths: ['*', '*', '*'],
          body: [
            [{ text: 'Suhu Ruangan', style: 'th' }, { text: 'Kelembapan', style: 'th' }, { text: 'Teknisi', style: 'th' }],
            [
              result?.environment_temp != null ? `${result.environment_temp} °C` : '-',
              result?.humidity != null ? `${result.humidity} %RH` : '-',
              task.technician?.full_name ?? task.technician?.username ?? '-',
            ],
          ],
        },
        margin: [0, 0, 0, 12],
      },

      ...pointsTable(asFound, 'Data As-Found (Sebelum Kalibrasi)'),
      ...pointsTable(asLeft, 'Data As-Left (Setelah Kalibrasi)'),

      ...(asFound.lkk_notes
        ? [{ text: 'Catatan LKK', style: 'h3' }, { text: String(asFound.lkk_notes), margin: [0, 0, 0, 12] }]
        : []),

      { text: 'Riwayat Persetujuan', style: 'h3' },
      {
        table: {
          headerRows: 1,
          widths: [70, '*', 60, 65, '*'],
          body: [
            [
              { text: 'Tahap', style: 'th' }, { text: 'Pemberi Persetujuan', style: 'th' },
              { text: 'Keputusan', style: 'th' }, { text: 'Tanggal', style: 'th' },
              { text: 'Catatan', style: 'th' },
            ],
            ...approvals.map((a) => [
              a.stage === 'SPV' ? 'Supervisor' : 'Senior Supervisor',
              a.approver?.full_name ?? a.approver?.username ?? '-',
              a.decision === 'Approved' ? 'Disetujui' : 'Ditolak',
              formatDateId(a.created_at),
              a.notes ?? '-',
            ]),
          ],
        },
        margin: [0, 0, 0, 24],
      },

      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'Diperiksa oleh (SPV)', style: 'signLabel' },
              { text: '\n\n' },
              { text: approvals.find((a) => a.stage === 'SPV' && a.decision === 'Approved')?.approver?.full_name ?? '—', style: 'signName' },
            ],
          },
          {
            width: '*',
            stack: [
              { text: 'Disetujui oleh (Sr. SPV)', style: 'signLabel' },
              { text: '\n\n' },
              { text: approvals.find((a) => a.stage === 'Senior_SPV' && a.decision === 'Approved')?.approver?.full_name ?? '—', style: 'signName' },
            ],
          },
          {
            width: '*',
            stack: [
              { text: 'Dikalibrasi oleh (Teknisi)', style: 'signLabel' },
              { text: '\n\n' },
              { text: task.technician?.full_name ?? task.technician?.username ?? '—', style: 'signName' },
            ],
          },
        ],
        margin: [0, 0, 0, 24],
      },

      {
        table: {
          widths: [70, '*'],
          body: [[
            { image: qrDataUrl, width: 64, rowSpan: 2, border: [false, false, false, false] },
            { text: 'Verifikasi Dokumen', bold: true, color: '#0f766e', border: [false, false, false, false] },
          ], [
            { text: `Pindai QR code untuk memverifikasi keaslian laporan ini. ID Tugas: ${docNumber}`, fontSize: 9, color: '#64748b', border: [false, false, false, false] },
          ]],
        },
      },
    ],
    styles: {
      title: { fontSize: 20, bold: true, color: '#0f766e' },
      subtitle: { fontSize: 9, color: '#64748b' },
      h3: { fontSize: 12, bold: true, color: '#0f766e', margin: [0, 10, 0, 5] },
      th: { fontSize: 9, bold: true, color: '#475569', fillColor: '#f1f5f9' },
      signLabel: { fontSize: 9, color: '#64748b' },
      signName: { fontSize: 10, bold: true },
    },
    defaultStyle: { fontSize: 10 },
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${docNumber}-${task.equipment?.tag_number ?? 'alat'}.pdf"`);
  pdfDoc.pipe(res);
  pdfDoc.end();
}));

export default router;
