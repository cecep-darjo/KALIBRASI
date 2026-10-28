import { useEffect, useState, useCallback } from 'react';
import { FileText, Download, Eye } from 'lucide-react';
import { api, downloadFile, errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { StatusBadge, ParamBadge } from '@/components/ui/Badges';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CalibrationTask, Approval, CalibrationData } from '@/lib/types';

export function ReportsPage() {
  const [tasks, setTasks] = useState<CalibrationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewTask, setPreviewTask] = useState<CalibrationTask | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [downloading, setDownloading] = useState<number | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const data = await api<CalibrationTask[]>('/reports');
      setTasks(data);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const openPreview = useCallback(async (task: CalibrationTask) => {
    setError(null);
    try {
      const aps = await api<Approval[]>(`/approvals/task/${task.id}`);
      setApprovals(aps);
      setPreviewTask(task);

    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  /* Mengunduh PDF langsung dari backend, sehingga hasilnya konsisten
     dengan dokumen resmi (bukan hasil cetak peramban). */
  const handleDownload = useCallback(async (task: CalibrationTask) => {
    setError(null);
    setDownloading(task.id);
    try {
      const docNumber = `LKK-${String(task.id).padStart(8, '0')}`;
      await downloadFile(
        `/reports/${task.id}/pdf`,
        `${docNumber}-${task.equipment?.tag_number ?? 'alat'}.pdf`
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setDownloading(null);
    }
  }, []);

  return (
    <div>
      <PageHeader title="Laporan Hasil Kalibrasi" subtitle="Laporan yang telah diperiksa SPV dan siap diterbitkan." icon={FileText} />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {tasks.length === 0 && !loading ? (
          <EmptyState title="Belum ada laporan yang siap" subtitle="Laporan muncul setelah hasil kalibrasi disetujui SPV." />
        ) : (
          <div className="divide-y divide-slate-50">
            {tasks.map((t) => (
              <div key={t.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-slate-900">{t.equipment?.tag_number}</p>
                    {t.equipment && <ParamBadge type={t.equipment.parameter_type} />}
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{t.equipment?.nama_alat}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Selesai: {t.completed_at ? new Date(t.completed_at).toLocaleDateString('id-ID') : '—'}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <Button size="sm" variant="outline" onClick={() => openPreview(t)}>
                    <Eye className="w-3.5 h-3.5" /> Pratinjau
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={downloading === t.id}
                    onClick={() => handleDownload(t)}
                  >
                    <Download className="w-3.5 h-3.5" /> PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewTask && (
        <ReportPreview
          task={previewTask}
          approvals={approvals}
          onDownload={() => handleDownload(previewTask)}
          downloading={downloading === previewTask.id}
          onClose={() => setPreviewTask(null)}
        />
      )}
    </div>
  );
}

function ReportPreview({ task, approvals, onDownload, downloading, onClose }: {
  task: CalibrationTask;
  approvals: Approval[];
  onDownload: () => void;
  downloading: boolean;
  onClose: () => void;
}) {
  const result = task.result;
  const asFound = result?.as_found_data;
  const asLeft = result?.as_left_data;
  const param = task.equipment?.parameter_type ?? '';
  const unit = asFound?.unit ?? '';
  const docNumber = `LKK-${String(task.id).padStart(8, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-slate-900">Data Laporan</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" loading={downloading} onClick={onDownload}>
              <Download className="w-3.5 h-3.5" /> Generate / Unduh PDF
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>Tutup</Button>
          </div>
        </div>
        <div className="p-6" id="report-print-area">
          {/* Header */}
          <div className="report-header">
            <div>
              <div className="report-title">LAPORAN KALIBRASI {param.toUpperCase()}</div>
              <div className="report-subtitle">Sistem Manajemen Kalibrasi Alat Ukur — KalibrasiMS</div>
              <div className="report-subtitle">No. Dokumen: {docNumber}</div>
            </div>
            <div className="text-right">
              <span className="badge">Disetujui SPV</span>
              <div className="report-subtitle mt-2">Tanggal: {task.completed_at ? new Date(task.completed_at).toLocaleDateString('id-ID') : new Date().toLocaleDateString('id-ID')}</div>
            </div>
          </div>

          {/* Equipment info */}
          <h3>Informasi Alat</h3>
          <div className="info-grid">
            <InfoItem label="Tag Number" value={task.equipment?.tag_number ?? ''} />
            <InfoItem label="Nama Alat" value={task.equipment?.nama_alat ?? ''} />
            <InfoItem label="Merk" value={task.equipment?.merk ?? '—'} />
            <InfoItem label="Model" value={task.equipment?.model ?? '—'} />
            <InfoItem label="Serial Number" value={task.equipment?.serial_number ?? '—'} />
            <InfoItem label="Tipe Parameter" value={param} />
            <InfoItem label="Range" value={task.equipment?.range_min != null ? `${task.equipment.range_min} – ${task.equipment.range_max} ${task.equipment?.unit ?? ''}` : '—'} />
            <InfoItem label="Lokasi" value={task.equipment?.location ?? '—'} />
            <InfoItem
              label="Kalibrator Standar"
              value={asFound?.reference_standard
                ? `${asFound.reference_standard.standard_code} — ${asFound.reference_standard.name}`
                : '—'}
            />
            <InfoItem label="Sertifikat Standar" value={asFound?.reference_standard?.certificate_number ?? '—'} />
          </div>

          {/* Environment */}
          <h3>Kondisi Lingkungan</h3>
          <div className="env">
            <InfoItem label="Suhu Ruangan" value={`${result?.environment_temp ?? '—'} °C`} />
            <InfoItem label="Kelembapan" value={`${result?.humidity ?? '—'} %RH`} />
            <InfoItem label="Teknisi" value={task.technician?.full_name ?? task.technician?.username ?? '—'} />
          </div>

          {/* As Found */}
          {asFound != null && (
            <>
              <h3>Data As-Found</h3>
              <PrintTable data={asFound} unit={unit} />
            </>
          )}
          {asLeft != null && (
            <>
              <h3>Data As-Left</h3>
              <PrintTable data={asLeft} unit={unit} />
            </>
          )}

          {/* LKK Notes */}
          {asFound?.lkk_notes != null && (
            <>
              <h3>Catatan LKK</h3>
              <div className="lkk">{asFound.lkk_notes}</div>
            </>
          )}

          {/* Approvals */}
          <h3>Riwayat Persetujuan</h3>
          <table>
            <thead><tr><th>Tahap</th><th>Pemberi Persetujuan</th><th>Keputusan</th><th>Tanggal</th><th>Catatan</th></tr></thead>
            <tbody>
              {approvals.map((a) => (
                <tr key={a.id}>
                  <td>{a.stage === 'SPV' ? 'Supervisor' : 'Senior Supervisor'}</td>
                  <td>{a.approver?.full_name ?? a.approver?.username}</td>
                  <td>{a.decision === 'Approved' ? 'Disetujui' : 'Ditolak'}</td>
                  <td>{a.created_at ? new Date(a.created_at).toLocaleDateString('id-ID') : '—'}</td>
                  <td>{a.notes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Signatures */}
          <div className="sign-section">
            <SignBox label="Diperiksa oleh (SPV)" name={approvals.find(a => a.stage === 'SPV' && a.decision === 'Approved')?.approver?.full_name ?? '—'} />
            <SignBox label="Disetujui oleh (Sr. SPV)" name={approvals.find(a => a.stage === 'Senior_SPV' && a.decision === 'Approved')?.approver?.full_name ?? '—'} />
            <SignBox label="Dikalibrasi oleh (Teknisi)" name={task.technician?.full_name ?? task.technician?.username ?? '—'} />
          </div>

        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return <div className="info-item"><span className="info-label">{label}: </span><span className="info-value">{value}</span></div>;
}

function PrintTable({ data, unit }: { data: CalibrationData; unit: string }) {
  const points = data.points ?? [];
  return (
    <table>
    <thead><tr><th>No.</th><th>DUC {unit && `(${unit})`}</th><th>P1 {unit && `(${unit})`}</th><th>P2 {unit && `(${unit})`}</th><th>Koreksi {unit && `(${unit})`}</th></tr></thead>
      <tbody>
        {points.map((p, i) => (
          <tr key={i}><td>{i + 1}</td><td>{p.standard || '—'}</td><td>{p.reading || '—'}</td><td>{p.reading2 || '—'}</td><td>{p.error || '—'}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function SignBox({ label, name }: { label: string; name: string }) {
  return <div className="sign-box"><div className="sign-label">{label}</div><div className="sign-name">{name}</div></div>;
}
