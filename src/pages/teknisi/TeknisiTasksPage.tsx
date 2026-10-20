import { useEffect, useState } from 'react';
import { Gauge, ClipboardCheck, Send, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { StatusBadge, ParamBadge } from '@/components/ui/Badges';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CalibrationTask, CalibrationResult, ParameterType } from '@/lib/types';

export function TeknisiTasksPage() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<CalibrationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState<CalibrationTask | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    if (!profile) return;
    const { data } = await supabase
      .from('calibration_tasks')
      .select('*, equipment(*), technician(*), result:calibration_results(*)')
      .eq('technician_id', profile.id)
      .order('scheduled_date', { ascending: false });
    setTasks((data ?? []) as CalibrationTask[]);
    setLoading(false);
  }

  return (
    <div>
      <PageHeader title="Input Kalibrasi" subtitle="Tugas kalibrasi yang ditugaskan kepada Anda." icon={Gauge} />

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {tasks.length === 0 && !loading ? (
          <EmptyState title="Belum ada tugas untuk Anda" subtitle="Tugas akan muncul di sini setelah Admin menugaskannya." />
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
                  <p className="text-sm text-slate-500 mt-1">{t.equipment?.nama_alat} — {t.equipment?.merk} {t.equipment?.model}</p>
                  <p className="text-xs text-slate-400 mt-0.5">Jadwal: {new Date(t.scheduled_date).toLocaleDateString('id-ID')}</p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {t.result && (
                    <Button size="sm" variant="outline" onClick={() => setActiveTask(t)}>
                      <Eye className="w-3.5 h-3.5" /> Lihat
                    </Button>
                  )}
                  {(t.status === 'Assigned' || t.status === 'In_Progress' || t.status === 'Rejected') && (
                    <Button size="sm" onClick={() => setActiveTask(t)}>
                      <ClipboardCheck className="w-3.5 h-3.5" /> Input Data
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {activeTask && (
        <CalibrationForm task={activeTask} onClose={() => setActiveTask(null)} onSaved={() => { setActiveTask(null); load(); }} />
      )}
    </div>
  );
}

interface PointRow { standard: string; reading: string; error: string; }

const paramUnits: Record<ParameterType, string> = { Suhu: '°C', Pressure: 'bar', DP: 'Pa', RPM: 'rpm' };

function CalibrationForm({ task, onClose, onSaved }: { task: CalibrationTask; onClose: () => void; onSaved: () => void }) {
  const param = task.equipment?.parameter_type ?? 'Suhu';
  const unit = paramUnits[param];
  const existing = task.result;

  const [points, setPoints] = useState<PointRow[]>(
    existing?.as_found_data
      ? (existing.as_found_data.points as PointRow[]) ?? [{ standard: '', reading: '', error: '' }]
      : Array.from({ length: 5 }, () => ({ standard: '', reading: '', error: '' }))
  );
  const [pointsLeft, setPointsLeft] = useState<PointRow[]>(
    existing?.as_left_data
      ? (existing.as_left_data.points as PointRow[]) ?? Array.from({ length: 5 }, () => ({ standard: '', reading: '', error: '' }))
      : Array.from({ length: 5 }, () => ({ standard: '', reading: '', error: '' }))
  );
  const [envTemp, setEnvTemp] = useState(existing?.environment_temp?.toString() ?? '24');
  const [humidity, setHumidity] = useState(existing?.humidity?.toString() ?? '55');
  const [lkkNotes, setLkkNotes] = useState<string>(
    (existing?.as_found_data?.lkk_notes as string) ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePoint = (idx: number, key: keyof PointRow, val: string, isLeft: boolean) => {
    const setter = isLeft ? setPointsLeft : setPoints;
    setter(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      const updated = { ...p, [key]: val };
      if (key === 'standard' || key === 'reading') {
        const s = parseFloat(updated.standard);
        const r = parseFloat(updated.reading);
        updated.error = (!isNaN(s) && !isNaN(r)) ? (r - s).toFixed(2) : '';
      }
      return updated;
    }));
  };

  async function persist(status: 'In_Progress' | 'Submitted') {
    setSaving(true);
    setError(null);
    const asFound = { points, lkk_notes: lkkNotes, parameter: param, unit };
    const asLeft = { points: pointsLeft, parameter: param, unit };
    const payload = {
      task_id: task.id,
      as_found_data: asFound,
      as_left_data: asLeft,
      environment_temp: envTemp ? parseFloat(envTemp) : null,
      humidity: humidity ? parseFloat(humidity) : null,
    };

    let resultId = existing?.id;
    if (existing) {
      const { error: ue } = await supabase.from('calibration_results').update(payload).eq('id', existing.id);
      if (ue) { setError(ue.message); setSaving(false); return; }
    } else {
      const { data, error: ie } = await supabase.from('calibration_results').insert(payload).select().single();
      if (ie) { setError(ie.message); setSaving(false); return; }
      resultId = (data as CalibrationResult).id;
    }

    const taskPayload: Record<string, unknown> = { status };
    if (status === 'Submitted') taskPayload.completed_at = new Date().toISOString();
    const { error: te } = await supabase.from('calibration_tasks').update(taskPayload).eq('id', task.id);
    if (te) { setError(te.message); setSaving(false); return; }

    setSaving(false);
    onSaved();
  }

  return (
    <Modal open onClose={onClose} title={`Input Kalibrasi — ${task.equipment?.tag_number}`} size="xl">
      <div className="space-y-6">
        {/* Equipment info */}
        <div className="rounded-xl bg-slate-50 border border-slate-100 p-4">
          <div className="grid sm:grid-cols-3 gap-3 text-sm">
            <Info label="Nama Alat" value={task.equipment?.nama_alat ?? ''} />
            <Info label="Merk / Model" value={`${task.equipment?.merk ?? ''} ${task.equipment?.model ?? ''}`} />
            <Info label="Serial Number" value={task.equipment?.serial_number ?? '—'} />
            <Info label="Parameter" value={param} />
            <Info label="Range" value={task.equipment?.range_min != null ? `${task.equipment.range_min} – ${task.equipment.range_max} ${task.equipment?.unit ?? ''}` : '—'} />
            <Info label="Lokasi" value={task.equipment?.location ?? '—'} />
          </div>
        </div>

        {/* Environment */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Suhu Ruangan (°C)">
            <Input type="number" value={envTemp} onChange={(e) => setEnvTemp(e.target.value)} />
          </Field>
          <Field label="Kelembapan (%RH)">
            <Input type="number" value={humidity} onChange={(e) => setHumidity(e.target.value)} />
          </Field>
        </div>

        {/* As Found */}
        <DataTable title="Data As-Found" points={points} unit={unit} onChange={(i, k, v) => updatePoint(i, k, v, false)} />

        {/* As Left */}
        <DataTable title="Data As-Left" points={pointsLeft} unit={unit} onChange={(i, k, v) => updatePoint(i, k, v, true)} />

        {/* LKK Digital */}
        <div>
          <h4 className="font-semibold text-slate-900 text-sm mb-2 flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4" /> Lembar Kerja Kalibrasi (LKK) Digital
          </h4>
          <Textarea
            rows={4}
            value={lkkNotes}
            onChange={(e) => setLkkNotes(e.target.value)}
            placeholder="Catatan teknis, metode yang digunakan, standar acuan, kondisi alat, dll."
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-col-reverse sm:flex-row justify-between gap-2 pt-2 border-t border-slate-100">
          <Button variant="ghost" onClick={onClose}>Tutup</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => persist('In_Progress')} loading={saving}>
              Simpan Draft
            </Button>
            <Button variant="secondary" onClick={() => persist('Submitted')} loading={saving}>
              <Send className="w-4 h-4" /> Submit untuk Review
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="font-medium text-slate-800">{value}</p>
    </div>
  );
}

function DataTable({ title, points, unit, onChange }: {
  title: string;
  points: PointRow[];
  unit: string;
  onChange: (i: number, k: keyof PointRow, v: string) => void;
}) {
  return (
    <div>
      <h4 className="font-semibold text-slate-900 text-sm mb-2">{title}</h4>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium w-12">No.</th>
              <th className="px-3 py-2 text-left font-medium">Standar ({unit})</th>
              <th className="px-3 py-2 text-left font-medium">Bacaan Alat ({unit})</th>
              <th className="px-3 py-2 text-left font-medium">Error ({unit})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {points.map((p, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                <td className="px-3 py-2"><Input type="number" value={p.standard} onChange={(e) => onChange(i, 'standard', e.target.value)} className="py-1.5 text-xs" /></td>
                <td className="px-3 py-2"><Input type="number" value={p.reading} onChange={(e) => onChange(i, 'reading', e.target.value)} className="py-1.5 text-xs" /></td>
                <td className="px-3 py-2"><Input value={p.error} readOnly className="py-1.5 text-xs bg-slate-50" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
