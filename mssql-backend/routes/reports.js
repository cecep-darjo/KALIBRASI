import express from 'express';
import PdfPrinter from 'pdfmake';
import { query, queryOne } from '../config/db.js';
import { authRequired } from '../middleware/auth.js';
import { asyncHandler, notFound, badRequest, intParam } from '../lib/http.js';
import { mapTask, mapApproval, toIso, TASK_SELECT, APPROVAL_SELECT } from '../lib/mappers.js';

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

const REPORT_STATUSES = ['SPV_Approved', 'Senior_SPV_Approved'];

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
      WHERE t.status IN (@spv, @senior)
      ORDER BY t.completed_at DESC, t.id DESC`,
    { spv: REPORT_STATUSES[0], senior: REPORT_STATUSES[1] }
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
    valid: REPORT_STATUSES.includes(row.status),
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
  if (!REPORT_STATUSES.includes(task.status)) {
    throw badRequest('Laporan baru dapat diterbitkan setelah diperiksa dan disetujui SPV.');
  }

  const result = task.result;
  const asFound = result?.as_found_data ?? {};
  const standard = asFound.reference_standard ?? {};
  const unit = asFound.unit || task.equipment?.unit || '';
  const docNumber = `LKK-${String(task.id).padStart(8, '0')}`;
  const points = Array.isArray(asFound.points) ? asFound.points : [];
  const num = (value) => value === '' || value == null || !Number.isFinite(Number(value)) ? null : Number(value);
  const fmt = (value, digits = 3) => value == null ? '-' : Number(value).toLocaleString('id-ID', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
  const fmtTrim = (value, digits = 4) => value == null ? '-' : Number(value).toLocaleString('id-ID', {
    maximumFractionDigits: digits,
  });
  const readings = points.map((point) => {
    const p1 = num(point?.reading);
    const p2 = num(point?.reading2) ?? p1;
    const mean = p1 == null || p2 == null ? null : (p1 + p2) / 2;
    const nominal = num(point?.standard);
    return { nominal, mean, correction: nominal == null || mean == null ? null : mean - nominal };
  });
  const masterUexp = num(standard.expanded_uncertainty);
  const resolution = num(asFound.duc_resolution);
  const repeatability = num(asFound.repeatability);
  const masterStd = masterUexp == null ? null : masterUexp / 2;
  const resolutionExp = resolution == null ? null : resolution / 2;
  const resolutionStd = resolutionExp == null ? null : resolutionExp / Math.sqrt(3);
  const combinedVariance = masterStd == null || resolutionStd == null || repeatability == null
    ? null : (masterStd ** 2) + (resolutionStd ** 2) + (repeatability ** 2);
  const combinedStd = combinedVariance == null ? null : Math.sqrt(combinedVariance);
  const expandedU = combinedStd == null ? null : 2 * combinedStd;

  if (points.length === 0) throw badRequest('Lembar kerja belum memiliki titik pengukuran.');
  if (masterUexp == null || resolution == null || repeatability == null || expandedU == null) {
    throw badRequest('Data ketidakpastian belum lengkap. Lengkapi Uexp pada kalibrator, resolusi DUC, dan repeatability.');
  }

  const section = (label, title) => ({
    columns: [
      { text: label, width: 19, bold: true },
      { text: title, bold: true },
    ], margin: [0, 4, 0, 5], fontSize: 9.5,
  });
  const identityRow = (label, value) => ({
    columns: [
      { text: label, width: 155 },
      { text: ':', width: 9 },
      { text: value || '-', fillColor: '#f1f1f1', margin: [3, 1, 3, 1] },
    ], margin: [16, 0, 0, 1], fontSize: 8.5,
  });
  const standardName = standard.name ?? '-';
  const standardType = [standard.manufacturer, standard.model, standard.serial_number]
    .filter(Boolean).join(' / ') || standard.parameter_type || '-';
  const equipmentId = [task.equipment?.serial_number, task.equipment?.tag_number]
    .filter(Boolean).join(' / ');
  const unitLabel = unit || standard.unit || '';
  const recalibrationDate = asFound.next_calibration_date
    ? formatDateId(asFound.next_calibration_date)
    : '-';
  const reportTitle = task.equipment?.parameter_type === 'Pressure'
    ? 'PRESSURE GAUGE'
    : (task.equipment?.parameter_type ?? 'ALAT UKUR').toUpperCase();
  const approvedSpv = approvals.find((a) => a.stage === 'SPV' && a.decision === 'Approved');
  const approvedSenior = approvals.find((a) => a.stage === 'Senior_SPV' && a.decision === 'Approved');

  const docDefinition = {
    pageSize: 'A4',
    pageMargins: [40, 34, 40, 32],
    content: [
      {
        table: { widths: ['*', 180], body: [[
          { text: 'INTERBAT', fontSize: 20, bold: true, color: '#1596c5', border: [false, false, false, false] },
          { text: `Lampiran 3. Protap no. 4.2.10.081/00/00\nHalaman 1 dari 1`, alignment: 'right', fontSize: 8, border: [false, false, false, false] },
        ], [{ text: [{ text: 'LAPORAN KALIBRASI ' }, { text: reportTitle, italics: true }], colSpan: 2, alignment: 'center', bold: true, fontSize: 13, margin: [0, 3, 0, 3], border: [false, false, false, true] }, {}]] },
        margin: [0, 0, 0, 8],
      },
      section('I.', 'IDENTITAS ALAT'),
      identityRow('Nama Alat', task.equipment?.nama_alat),
      identityRow('Mesin', task.equipment?.location),
      identityRow('Merk / Tipe Alat', [task.equipment?.merk, task.equipment?.model].filter(Boolean).join(' / ')),
      identityRow('Nomor seri / ID', equipmentId),
      identityRow('Resolusi', resolution == null ? '-' : `${fmtTrim(resolution)} ${unitLabel}`),
      identityRow('Kapasitas', task.equipment?.range_min != null
        ? `${fmt(task.equipment.range_min, 0)}-${fmt(task.equipment.range_max, 0)} ${task.equipment?.unit ?? unitLabel}` : '-'),
      identityRow('Tanggal kalibrasi', formatDateId(task.completed_at)),
      identityRow('Suhu Ruangan', result?.environment_temp == null ? '-' : `${fmt(result.environment_temp, 1)} °C`),

      section('II.', 'IDENTITAS STANDART'),
      identityRow('Nama Alat / No ID', `${standardName}${standard.standard_code ? ` / ${standard.standard_code}` : ''}`),
      identityRow('Tipe', standardType),
      identityRow('Jatuh Tempo Kalibrasi', formatDateId(standard.calibration_due_date)),
      identityRow('Koreksi Master', standard.master_correction == null ? '-' : `${fmt(standard.master_correction, 4)} ${unitLabel}`),
      identityRow('Ketidakpastian Master', masterUexp == null ? '-' : `${fmt(masterUexp, 4)} ${unitLabel}`),
      identityRow('Lab Kalibrasi Referensi', standard.calibration_lab ?? '-'),

      section('III.', 'HASIL KALIBRASI'),
      {
        table: {
          headerRows: 2,
          widths: ['*', '*', '*'],
          body: [
            [
              { text: 'Pembacaan Alat', style: 'th', alignment: 'center' },
              { text: 'Pembacaan Standar', style: 'th', alignment: 'center' },
              { text: 'Koreksi', style: 'th', alignment: 'center' },
            ],
            ...[[unitLabel, unitLabel, unitLabel].map((label) => ({ text: label, alignment: 'center', fontSize: 8 }))],
            ...readings.map((reading) => [
              { text: fmt(reading.nominal, 1), alignment: 'center' },
              { text: fmt(reading.mean == null ? null : reading.mean + (num(standard.master_correction) ?? 0), 3), alignment: 'center' },
              { text: fmt(reading.correction, 2), alignment: 'center' },
            ]),
          ],
        },
        layout: { hLineColor: () => '#111827', vLineColor: () => '#111827', hLineWidth: () => 0.65, vLineWidth: () => 0.65, paddingTop: () => 3, paddingBottom: () => 3 },
        margin: [24, 0, 280, 5],
      },
      { text: [{ text: 'Ketidakpastian Yang Diperluas = ', bold: true }, { text: fmt(expandedU, 3), bold: true }, { text: ` ${unitLabel}`, bold: true }], margin: [16, 2, 0, 1], fontSize: 9 },
      { text: 'Ketidak pastian kalibrasi ditetapkan pada tingkat kepercayaan 95%', margin: [16, 0, 0, 6], fontSize: 8.5 },
      identityRow('Catatan', asFound.lkk_notes || '-'),
      identityRow('Rekalibrasi', recalibrationDate),
      {
        columns: [
          { text: `Pelaksana Kalibrasi,\n\n\n\n(TTD & Inisial)\n${task.technician?.full_name ?? task.technician?.username ?? ''}`, alignment: 'center' },
          { text: `Diperiksa oleh,\n\n\n\n(TTD & Inisial)\n${approvedSpv?.approver?.full_name ?? ''}`, alignment: 'center' },
          { text: `Mengetahui,\n\n\n\n(TTD & Inisial)\n${approvedSenior?.approver?.full_name ?? ''}`, alignment: 'center' },
        ], margin: [0, 15, 0, 0], fontSize: 8,
      },
    ],
    styles: {
      th: { fontSize: 8, bold: true, fillColor: '#f1f1f1', margin: [3, 2, 3, 2] },
    },
    defaultStyle: { font: 'Helvetica', fontSize: 8.5, color: '#111827' },
    background: (_currentPage, pageSize) => ({
      canvas: [{ type: 'rect', x: 36, y: 28, w: pageSize.width - 72, h: pageSize.height - 56, lineWidth: 0.8, lineColor: '#111827' }],
    }),
  };

  const pdfDoc = printer.createPdfKitDocument(docDefinition);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${docNumber}-${task.equipment?.tag_number ?? 'alat'}.pdf"`);
  pdfDoc.pipe(res);
  pdfDoc.end();
}));

export default router;
