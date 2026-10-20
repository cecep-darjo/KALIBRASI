import { useEffect, useState, useCallback } from 'react';
import { FileText, Download, Eye, ShieldCheck } from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { StatusBadge, ParamBadge } from '@/components/ui/Badges';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CalibrationTask, Approval } from '@/lib/types';

export function ReportsPage() {
  const [tasks, setTasks] = useState<CalibrationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewTask, setPreviewTask] = useState<CalibrationTask | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase
      .from('calibration_tasks')
      .select('*, equipment(*), technician(*), result:calibration_results(*)')
      .eq('status', 'Senior_SPV_Approved')
      .order('completed_at', { ascending: false });
    setTasks((data ?? []) as CalibrationTask[]);
    setLoading(false);
  }

  const openPreview = useCallback(async (task: CalibrationTask) => {
    const [aps] = await Promise.all([
      supabase.from('approvals').select('*, approver:profiles(*)').eq('task_id', task.id).order('created_at', { ascending: true }),
    ]);
    setApprovals((aps.data ?? []) as Approval[]);
    setPreviewTask(task);
    const verificationPayload = JSON.stringify({
      taskId: task.id,
      tag: task.equipment?.tag_number,
      status: task.status,
      date: task.completed_at,
    });
    const qr = await QRCode.toDataURL(verificationPayload, { margin: 1, width: 160 });
    setQrDataUrl(qr);
  }, []);

  return (
    <div>
      <PageHeader title="Laporan Hasil Kalibrasi" subtitle="Laporan yang telah disetujui Senior Supervisor dan siap diterbitkan." icon={FileText} />

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {tasks.length === 0 && !loading ? (
          <EmptyState title="Belum ada laporan yang siap" subtitle="Laporan muncul setelah kalibrasi disetujui Senior Supervisor." />
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
                  <Button size="sm" variant="secondary" onClick={() => openPreview(t)}>
                    <Download className="w-3.5 h-3.5" /> PDF
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewTask && (
        <ReportPreview task={previewTask} approvals={approvals} qrDataUrl={qrDataUrl} onClose={() => setPreviewTask(null)} />
      )}
    </div>
  );
}

function ReportPreview({ task, approvals, qrDataUrl, onClose }: {
  task: CalibrationTask;
  approvals: Approval[];
  qrDataUrl: string;
  onClose: () => void;
}) {
  const result = task.result;
  const asFound = result?.as_found_data;
  const asLeft = result?.as_left_data;
  const param = task.equipment?.parameter_type ?? '';
  const unit = (asFound?.unit as string) ?? '';

  const handlePrint = () => {
    const printContents = document.getElementById('report-print-area')?.innerHTML;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win || !printContents) return;
    win.document.write(`<!doctype html><html><head><title>Laporan Kalibrasi - ${task.equipment?.tag_number}</title>
    <style>
      * { font-family: 'Segoe UI', Arial, sans-serif; box-sizing: border-box; }
      body { margin: 0; padding: 40px; color: #1e293b; font-size: 12px; }
      .report-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0f766e; padding-bottom: 16px; margin-bottom: 24px; }
      .report-title { font-size: 20px; font-weight: 700; color: #0f766e; }
      .report-subtitle { font-size: 11px; color: #64748b; margin-top: 4px; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 32px; margin-bottom: 20px; }
      .info-item { font-size: 11px; }
      .info-label { color: #94a3b8; }
      .info-value { font-weight: 600; color: #1e293b; }
      h3 { font-size: 13px; font-weight: 700; color: #0f766e; margin: 20px 0 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
      th { background: #f1f5f9; text-align: left; padding: 6px 8px; font-size: 10px; text-transform: uppercase; color: #64748b; }
      td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; font-size: 11px; }
      .env { display: flex; gap: 24px; margin-bottom: 16px; }
      .sign-section { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 40px; }
      .sign-box { text-align: center; }
      .sign-label { font-size: 10px; color: #64748b; margin-bottom: 40px; }
      .sign-name { font-size: 11px; font-weight: 600; border-top: 1px solid #cbd5e1; padding-top: 6px; }
      .qr-section { display: flex; align-items: center; gap: 12px; margin-top: 24px; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; }
      .qr-section img { width: 80px; height: 80px; }
      .qr-text { font-size: 10px; color: #64748b; }
      .qr-text strong { color: #0f766e; }
      .lkk { white-space: pre-wrap; background: #f8fafc; padding: 10px; border-radius: 6px; font-size: 11px; border: 1px solid #e2e8f0; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; background: #ccfbf1; color: #0f766e; }
    </style></head><body>${printContents}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-slate-900">Pratinjau Laporan</h2>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={handlePrint}><Download className="w-3.5 h-3.5" /> Cetak / Simpan PDF</Button>
            <Button size="sm" variant="ghost" onClick={onClose}>Tutup</Button>
          </div>
        </div>
        <div className="p-6" id="report-print-area">
          {/* Header */}
          <div className="report-header">
            <div>
              <div className="report-title">LAPORAN HASIL KALIBRASI</div>
              <div className="report-subtitle">Sistem Manajemen Kalibrasi Alat Ukur — KalibrasiMS</div>
              <div className="report-subtitle">No. Dokumen: LKK-{task.id.slice(0, 8).toUpperCase()}</div>
            </div>
            <div className="text-right">
              <span className="badge">Disetujui Senior SPV</span>
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
              <div className="lkk">{asFound.lkk_notes as string}</div>
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
                  <td>{new Date(a.created_at).toLocaleDateString('id-ID')}</td>
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

          {/* QR */}
          <div className="qr-section">
            {qrDataUrl && <img src={qrDataUrl} alt="QR Verifikasi" />}
            <div className="qr-text">
              <strong><ShieldCheck className="inline w-3 h-3 mr-1" />Verifikasi Dokumen</strong><br />
              Pindai QR code untuk memverifikasi keaslian laporan ini.<br />
              ID Tugas: {task.id.slice(0, 8).toUpperCase()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return <div className="info-item"><span className="info-label">{label}: </span><span className="info-value">{value}</span></div>;
}

function PrintTable({ data, unit }: { data: Record<string, unknown>; unit: string }) {
  const points = (data.points as Array<{ standard: string; reading: string; error: string }>) ?? [];
  return (
    <table>
      <thead><tr><th>No.</th><th>Standar {unit && `(${unit})`}</th><th>Bacaan Alat {unit && `(${unit})`}</th><th>Error {unit && `(${unit})`}</th></tr></thead>
      <tbody>
        {points.map((p, i) => (
          <tr key={i}><td>{i + 1}</td><td>{p.standard || '—'}</td><td>{p.reading || '—'}</td><td>{p.error || '—'}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function SignBox({ label, name }: { label: string; name: string }) {
  return <div className="sign-box"><div className="sign-label">{label}</div><div className="sign-name">{name}</div></div>;
}
