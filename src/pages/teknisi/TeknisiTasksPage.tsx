import { useEffect, useState } from 'react';
import { Gauge, ClipboardCheck, Send, Eye } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { StatusBadge, ParamBadge } from '@/components/ui/Badges';
import { EmptyState } from '@/components/ui/EmptyState';
import type {
  CalibrationTask, CalibrationResult, CalibrationPoint, ParameterType, TaskStatus,
  StandardInstrument, StandardInstrumentSnapshot,
} from '@/lib/types';

export function TeknisiTasksPage() {
  const [tasks, setTasks] = useState<CalibrationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTask, setActiveTask] = useState<CalibrationTask | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      // Backend otomatis membatasi hasil hanya pada tugas milik teknisi yang login.
      setTasks(await api<CalibrationTask[]>('/tasks'));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="Input Kalibrasi" subtitle="Tugas kalibrasi yang ditugaskan kepada Anda." icon={Gauge} />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

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

const paramUnits: Record<ParameterType, string> = { Suhu: '°C', Pressure: 'bar', DP: 'Pa', RPM: 'rpm' };

const emptyRow = (): CalibrationPoint => ({ standard: '', reading: '', error: '' });
const emptyRows = (n = 9) => Array.from({ length: n }, emptyRow);

function CalibrationForm({ task, onClose, onSaved }: { task: CalibrationTask; onClose: () => void; onSaved: () => void }) {
  const param = task.equipment?.parameter_type ?? 'Suhu';
  const unit = paramUnits[param];
  const existing = task.result;

  const [points, setPoints] = useState<CalibrationPoint[]>(
    existing?.as_found_data?.points?.length ? existing.as_found_data.points : emptyRows()
  );
  const [pointsLeft, setPointsLeft] = useState<CalibrationPoint[]>(
    existing?.as_left_data?.points?.length ? existing.as_left_data.points : emptyRows()
  );
  const [envTemp, setEnvTemp] = useState(existing?.environment_temp?.toString() ?? '24');
  const [humidity, setHumidity] = useState(existing?.humidity?.toString() ?? '55');
  const [ducResolution, setDucResolution] = useState(existing?.as_found_data?.duc_resolution ?? '');
  const [repeatability, setRepeatability] = useState(existing?.as_found_data?.repeatability ?? '');
  const [nextCalibrationDate, setNextCalibrationDate] = useState(existing?.as_found_data?.next_calibration_date ?? '');
  const [lkkNotes, setLkkNotes] = useState(existing?.as_found_data?.lkk_notes ?? '');
  const savedStandard = existing?.as_found_data?.reference_standard
    ?? existing?.as_left_data?.reference_standard ?? null;
  const [standards, setStandards] = useState<StandardInstrument[]>([]);
  const [standardsLoading, setStandardsLoading] = useState(true);
  const [standardId, setStandardId] = useState(savedStandard ? String(savedStandard.id) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<StandardInstrument[]>(`/standards?parameter_type=${encodeURIComponent(param)}`)
      .then((rows) => { if (!cancelled) setStandards(rows); })
      .catch((err) => { if (!cancelled) setError(errorMessage(err)); })
      .finally(() => { if (!cancelled) setStandardsLoading(false); });
    return () => { cancelled = true; };
  }, [param]);

  const standardOptions: Array<StandardInstrument | StandardInstrumentSnapshot> = savedStandard && !standards.some((item) => item.id === savedStandard.id)
    ? [...standards, savedStandard]
    : standards;
  const selectedStandard = standardOptions.find((item) => String(item.id) === standardId) ?? null;

  const updatePoint = (idx: number, key: keyof CalibrationPoint, val: string, isLeft: boolean) => {
    const setter = isLeft ? setPointsLeft : setPoints;
    setter(prev => prev.map((p, i) => {
      if (i !== idx) return p;
      const updated = { ...p, [key]: val };
      // Bacaan standar laporan adalah rerata P1/P2; koreksi = rerata - DUC.
      if (key === 'standard' || key === 'reading' || key === 'reading2') {
        const s = parseFloat(updated.standard);
        const p1 = parseFloat(updated.reading);
        const p2 = parseFloat(updated.reading2 ?? '');
        const r = Number.isFinite(p2) ? (p1 + p2) / 2 : p1;
        updated.error = (!isNaN(s) && !isNaN(r)) ? (r - s).toFixed(2) : '';
      }
      return updated;
    }));
  };

  async function persist(status: Extract<TaskStatus, 'In_Progress' | 'Submitted'>) {
    if (status === 'Submitted' && !selectedStandard) {
      setError('Pilih kalibrator standar acuan sebelum mengirim hasil untuk review.');
      return;
    }
    if (status === 'Submitted' && (!ducResolution || !repeatability || !nextCalibrationDate
      || selectedStandard?.master_correction == null || selectedStandard?.expanded_uncertainty == null
      || !selectedStandard?.calibration_lab || !selectedStandard?.calibration_due_date)) {
      setError('Lengkapi resolusi, repeatability, tanggal kalibrasi berikutnya, serta koreksi, ketidakpastian, lab, dan jatuh tempo pada data kalibrator standar.');
      return;
    }
    const measuredPoints = points.filter((point) => Boolean(point.standard || point.reading || point.reading2));
    if (status === 'Submitted' && (measuredPoints.length === 0 || measuredPoints.some((point) =>
      !point.standard || !point.reading || !point.reading2))) {
      setError('Isi nilai DUC, pembacaan P1, dan pembacaan P2 pada setiap titik yang digunakan.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const referenceStandard = selectedStandard ? {
        id: selectedStandard.id,
        standard_code: selectedStandard.standard_code,
        name: selectedStandard.name,
        parameter_type: selectedStandard.parameter_type,
        manufacturer: selectedStandard.manufacturer,
        model: selectedStandard.model,
        serial_number: selectedStandard.serial_number,
        certificate_number: selectedStandard.certificate_number,
        calibration_due_date: selectedStandard.calibration_due_date,
        unit: selectedStandard.unit,
        master_correction: selectedStandard.master_correction,
        expanded_uncertainty: selectedStandard.expanded_uncertainty,
        calibration_lab: selectedStandard.calibration_lab,
      } : null;
      // 1. Simpan hasil kalibrasi — backend melakukan insert atau update otomatis.
      await api<CalibrationResult>('/results', {
        method: 'POST',
        body: {
          task_id: task.id,
          as_found_data: { points: measuredPoints, lkk_notes: lkkNotes, parameter: param, unit, reference_standard: referenceStandard, duc_resolution: ducResolution, repeatability, next_calibration_date: nextCalibrationDate },
          as_left_data: { points: pointsLeft.filter((point) => point.standard || point.reading || point.reading2), parameter: param, unit, reference_standard: referenceStandard },
          environment_temp: envTemp ? parseFloat(envTemp) : null,
          humidity: humidity ? parseFloat(humidity) : null,
        },
      });

      // 2. Perbarui status tugas.
      await api(`/tasks/${task.id}/status`, { method: 'PUT', body: { status } });

      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
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

        <Field
          label="Kalibrator Standar Acuan"
          hint={standardsLoading ? 'Memuat daftar kalibrator standar...' : 'Pilih alat standar yang digunakan untuk pengukuran ini.'}
        >
          <Select value={standardId} onChange={(e) => setStandardId(e.target.value)} disabled={standardsLoading}>
            <option value="">Pilih kalibrator standar</option>
            {standardOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.standard_code} — {item.name}{item.serial_number ? ` (SN ${item.serial_number})` : ''}
                {!('is_active' in item && item.is_active) ? ' — Nonaktif / kedaluwarsa (data tersimpan)' : ''}
              </option>
            ))}
          </Select>
          {!standardsLoading && standardOptions.length === 0 && (
            <p className="text-xs text-amber-700 mt-1">Belum ada standar aktif untuk parameter {param}. Minta Admin menambahkannya di halaman Kalibrator Standar.</p>
          )}
          {selectedStandard?.certificate_number && (
            <p className="text-xs text-slate-500 mt-1">Sertifikat: {selectedStandard.certificate_number}
              {selectedStandard.calibration_due_date ? ` · Berlaku sampai ${new Date(`${selectedStandard.calibration_due_date.slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID')}` : ''}
            </p>
          )}
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={`Resolusi alat DUC (${unit})`} hint="Nilai skala terkecil sesuai spesifikasi alat.">
            <Input type="number" min="0" step="any" value={ducResolution} onChange={(e) => setDucResolution(e.target.value)} />
          </Field>
          <Field label={`Repeatability (${unit})`} hint="Nilai ketidakpastian repeatability dari metode/LKK.">
            <Input type="number" min="0" step="any" value={repeatability} onChange={(e) => setRepeatability(e.target.value)} />
          </Field>
          <Field label="Jadwal kalibrasi berikutnya">
            <Input type="date" value={nextCalibrationDate} onChange={(e) => setNextCalibrationDate(e.target.value)} />
          </Field>
        </div>

        {/* As Found */}
        <DataTable title="Lembar Kerja Kalibrasi (P1 / P2)" points={points} unit={unit} onChange={(i, k, v) => updatePoint(i, k, v, false)} />

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
  points: CalibrationPoint[];
  unit: string;
  onChange: (i: number, k: keyof CalibrationPoint, v: string) => void;
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
          <th className="px-3 py-2 text-left font-medium">P1 ({unit})</th>
          <th className="px-3 py-2 text-left font-medium">P2 ({unit})</th>
              <th className="px-3 py-2 text-left font-medium">Error ({unit})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {points.map((p, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                <td className="px-3 py-2"><Input type="number" value={p.standard} onChange={(e) => onChange(i, 'standard', e.target.value)} className="py-1.5 text-xs" /></td>
                <td className="px-3 py-2"><Input type="number" value={p.reading} onChange={(e) => onChange(i, 'reading', e.target.value)} className="py-1.5 text-xs" /></td>
                <td className="px-3 py-2"><Input type="number" value={p.reading2 ?? ''} onChange={(e) => onChange(i, 'reading2', e.target.value)} className="py-1.5 text-xs" /></td>
                <td className="px-3 py-2"><Input value={p.error} readOnly className="py-1.5 text-xs bg-slate-50" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
