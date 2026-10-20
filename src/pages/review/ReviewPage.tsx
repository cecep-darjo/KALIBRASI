import { useEffect, useState } from 'react';
import { CheckSquare, Check, X, Eye, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Textarea } from '@/components/ui/Field';
import { StatusBadge, ParamBadge, RoleBadge } from '@/components/ui/Badges';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CalibrationTask, Approval, ApprovalStage, ApprovalDecision } from '@/lib/types';

interface ReviewPageProps {
  stage: ApprovalStage;
  incomingStatus: 'Submitted' | 'SPV_Approved';
  approvedStatus: 'SPV_Approved' | 'Senior_SPV_Approved';
  title: string;
  subtitle: string;
}

export function ReviewPage({ stage, incomingStatus, approvedStatus, title, subtitle }: ReviewPageProps) {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<CalibrationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewTask, setReviewTask] = useState<CalibrationTask | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [decision, setDecision] = useState<ApprovalDecision>('Approved');
  const [notes, setNotes] = useState('');
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase
      .from('calibration_tasks')
      .select('*, equipment(*), technician(*), result:calibration_results(*)')
      .eq('status', incomingStatus)
      .order('scheduled_date', { ascending: false });
    setTasks((data ?? []) as CalibrationTask[]);
    setLoading(false);
  }

  async function openReview(task: CalibrationTask) {
    const { data: aps } = await supabase
      .from('approvals')
      .select('*, approver:profiles(*)')
      .eq('task_id', task.id)
      .order('created_at', { ascending: true });
    setApprovals((aps ?? []) as Approval[]);
    setReviewTask(task);
    setNotes('');
    setDecision('Approved');
    setError(null);
  }

  async function submitDecision() {
    if (!reviewTask || !profile) return;
    setActing(true);
    setError(null);
    const newStatus = decision === 'Approved' ? approvedStatus : 'Rejected';
    const { error: ae } = await supabase.from('approvals').insert({
      task_id: reviewTask.id,
      approver_id: profile.id,
      stage,
      decision,
      notes: notes || null,
    });
    if (ae) { setError(ae.message); setActing(false); return; }
    const { error: te } = await supabase.from('calibration_tasks').update({ status: newStatus }).eq('id', reviewTask.id);
    if (te) { setError(te.message); setActing(false); return; }
    setActing(false);
    setReviewTask(null);
    load();
  }

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} icon={stage === 'SPV' ? CheckSquare : FileText} />

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {tasks.length === 0 && !loading ? (
          <EmptyState title="Tidak ada tugas untuk direview" subtitle={`Tugas dengan status sesuai akan muncul di sini untuk ${stage === 'SPV' ? 'Supervisor' : 'Senior Supervisor'}.`} />
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
                  <p className="text-xs text-slate-400 mt-0.5">Teknisi: {t.technician?.full_name ?? t.technician?.username ?? '—'}</p>
                </div>
                <Button size="sm" onClick={() => openReview(t)}>
                  <Eye className="w-3.5 h-3.5" /> Review
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {reviewTask && (
        <Modal open onClose={() => setReviewTask(null)} title={`Review ${stage === 'SPV' ? 'Supervisor' : 'Senior Supervisor'} — ${reviewTask.equipment?.tag_number}`} size="lg">
          <div className="space-y-5">
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <Info label="Alat" value={`${reviewTask.equipment?.tag_number} — ${reviewTask.equipment?.nama_alat}`} />
                <Info label="Parameter" value={reviewTask.equipment?.parameter_type ?? ''} />
                <Info label="Merk / Model" value={`${reviewTask.equipment?.merk ?? ''} ${reviewTask.equipment?.model ?? ''}`} />
                <Info label="Serial" value={reviewTask.equipment?.serial_number ?? '—'} />
                <Info label="Teknisi" value={reviewTask.technician?.full_name ?? reviewTask.technician?.username ?? '—'} />
                <Info label="Suhu / Kelembapan" value={`${reviewTask.result?.environment_temp ?? '—'} °C / ${reviewTask.result?.humidity ?? '—'} %RH`} />
              </div>
            </div>

            {/* Data tables */}
            {reviewTask.result?.as_found_data != null && (
              <ResultTable title="Data As-Found" data={reviewTask.result.as_found_data} />
            )}
            {reviewTask.result?.as_left_data != null && (
              <ResultTable title="Data As-Left" data={reviewTask.result.as_left_data} />
            )}

            {reviewTask.result?.as_found_data?.lkk_notes != null && (
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-1.5">Catatan LKK</h4>
                <p className="text-sm text-slate-600 rounded-lg bg-slate-50 p-3 border border-slate-100 whitespace-pre-wrap">
                  {reviewTask.result.as_found_data.lkk_notes as string}
                </p>
              </div>
            )}

            {/* Approval history */}
            {approvals.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-2">Riwayat Approval</h4>
                <div className="space-y-2">
                  {approvals.map((a) => (
                    <div key={a.id} className="flex items-start gap-2.5 text-sm rounded-lg bg-slate-50 p-3 border border-slate-100">
                      <div className="flex-shrink-0 mt-0.5">
                        {a.decision === 'Approved' ? <Check className="w-4 h-4 text-teal-600" /> : <X className="w-4 h-4 text-red-500" />}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800">
                          {a.stage === 'SPV' ? 'Supervisor' : 'Senior Supervisor'}: {a.decision === 'Approved' ? 'Disetujui' : 'Ditolak'}
                        </p>
                        <p className="text-xs text-slate-400">{a.approver?.full_name ?? a.approver?.username} • {new Date(a.created_at).toLocaleString('id-ID')}</p>
                        {a.notes && <p className="text-xs text-slate-500 mt-1">{a.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Decision form */}
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <Field label="Keputusan">
                <div className="flex gap-2">
                  <button onClick={() => setDecision('Approved')} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${decision === 'Approved' ? 'bg-teal-50 border-teal-300 text-teal-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    <Check className="w-4 h-4 inline mr-1.5" /> Setujui
                  </button>
                  <button onClick={() => setDecision('Rejected')} className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${decision === 'Rejected' ? 'bg-red-50 border-red-300 text-red-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    <X className="w-4 h-4 inline mr-1.5" /> Tolak
                  </button>
                </div>
              </Field>
              <Field label="Catatan (opsional)">
                <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Catatan review..." />
              </Field>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setReviewTask(null)}>Batal</Button>
                <Button variant={decision === 'Approved' ? 'secondary' : 'danger'} onClick={submitDecision} loading={acting}>
                  {decision === 'Approved' ? 'Setujui' : 'Tolak'}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-slate-400">{label}</p><p className="font-medium text-slate-800">{value}</p></div>;
}

function ResultTable({ title, data }: { title: string; data: Record<string, unknown> }) {
  const points = (data.points as Array<{ standard: string; reading: string; error: string }>) ?? [];
  const unit = (data.unit as string) ?? '';
  if (points.length === 0) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold text-slate-900 mb-2">{title}</h4>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-12">No.</th>
              <th className="px-3 py-2 text-left font-medium">Standar {unit && `(${unit})`}</th>
              <th className="px-3 py-2 text-left font-medium">Bacaan {unit && `(${unit})`}</th>
              <th className="px-3 py-2 text-left font-medium">Error {unit && `(${unit})`}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {points.map((p, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                <td className="px-3 py-2 text-slate-700">{p.standard || '—'}</td>
                <td className="px-3 py-2 text-slate-700">{p.reading || '—'}</td>
                <td className="px-3 py-2 text-slate-700">{p.error || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
