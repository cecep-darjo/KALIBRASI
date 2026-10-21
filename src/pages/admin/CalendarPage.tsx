import { useEffect, useState, useMemo, useCallback } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Sparkles, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select } from '@/components/ui/Field';
import { StatusBadge, ParamBadge } from '@/components/ui/Badges';
import type {
  CalibrationTask, Equipment, Profile, TaskStatus, TechnicianWorkload,
} from '@/lib/types';

const MONTHS_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const DAYS_ID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function CalendarPage() {
  const [tasks, setTasks] = useState<CalibrationTask[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [techs, setTechs] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [showForm, setShowForm] = useState(false);
  const [preselectedDate, setPreselectedDate] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<{ date: string; tasks: CalibrationTask[] } | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [t, e, p] = await Promise.all([
        api<CalibrationTask[]>('/tasks'),
        api<Equipment[]>('/equipment'),
        api<Profile[]>('/users/technicians'),
      ]);
      setTasks(t);
      setEquipment(e);
      setTechs(p);
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const tasksByDate = useMemo(() => {
    const map: Record<string, CalibrationTask[]> = {};
    for (const t of tasks) {
      const key = t.scheduled_date.slice(0, 10);
      (map[key] ??= []).push(t);
    }
    return map;
  }, [tasks]);

  const calendarGrid = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: { date: string; day: number; inMonth: boolean }[] = [];
    // Leading days from prev month
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      cells.push({ date: toYMD(d), day: d.getDate(), inMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      cells.push({ date: toYMD(date), day: d, inMonth: true });
    }
    // Trailing to fill 6 rows (42 cells)
    while (cells.length < 42) {
      const last = new Date(cells[cells.length - 1].date);
      last.setDate(last.getDate() + 1);
      cells.push({ date: toYMD(last), day: last.getDate(), inMonth: false });
    }
    return cells;
  }, [cursor]);

  const today = toYMD(new Date());

  const prevMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const nextMonth = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  const goToday = () => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); };

  return (
    <div>
      <PageHeader
        title="Kalender Jadwal Kalibrasi"
        subtitle="Lihat dan kelola jadwal kalibrasi dalam tampilan kalender bulanan."
        icon={CalendarDays}
        action={<Button onClick={() => { setPreselectedDate(null); setShowForm(true); }}><Plus className="w-4 h-4" /> Tugaskan</Button>}
      />

      {loadError && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={prevMonth}><ChevronLeft className="w-4 h-4" /></Button>
          <h2 className="text-lg font-bold text-slate-900 min-w-[180px] text-center">
            {MONTHS_ID[cursor.getMonth()]} {cursor.getFullYear()}
          </h2>
          <Button size="sm" variant="outline" onClick={nextMonth}><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <Button size="sm" variant="ghost" onClick={goToday}>Hari Ini</Button>
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-slate-100">
          {DAYS_ID.map((d) => (
            <div key={d} className="px-2 py-2.5 text-center text-xs font-semibold text-slate-400 uppercase">{d}</div>
          ))}
        </div>
        {/* Cells */}
        <div className="grid grid-cols-7">
          {calendarGrid.map((cell, idx) => {
            const dayTasks = tasksByDate[cell.date] ?? [];
            const isToday = cell.date === today;
            const isLastCol = idx % 7 === 6;
            const isLastRow = idx >= 35;
            return (
              <div
                key={cell.date}
                className={`min-h-[96px] sm:min-h-[120px] px-1.5 py-1.5 border-r border-b ${isLastCol ? 'border-r-0' : ''} ${isLastRow ? 'border-b-0' : ''} ${cell.inMonth ? 'bg-white' : 'bg-slate-50/60'} hover:bg-slate-50 transition-colors cursor-pointer`}
                onClick={() => dayTasks.length > 0 ? setDayDetail({ date: cell.date, tasks: dayTasks }) : (setPreselectedDate(cell.date), setShowForm(true))}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-teal-600 text-white' : cell.inMonth ? 'text-slate-700' : 'text-slate-300'}`}>
                    {cell.day}
                  </span>
                  {dayTasks.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreselectedDate(cell.date); setShowForm(true); }}
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-teal-600 transition-colors"
                      title="Tambah tugas di tanggal ini"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {dayTasks.slice(0, 3).map((t) => (
                    <div key={t.id} className={`px-1.5 py-1 rounded-md text-[10px] font-medium truncate border ${statusColor(t.status)}`}>
                      {t.equipment?.tag_number}
                    </div>
                  ))}
                  {dayTasks.length > 3 && (
                    <p className="text-[10px] text-slate-400 px-1">+{dayTasks.length - 3} lainnya</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading && <p className="text-sm text-slate-400 mt-4 text-center">Memuat data...</p>}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4">
        {([
          ['Assigned', 'Ditugaskan'],
          ['In_Progress', 'Berjalan'],
          ['Submitted', 'Dikirim'],
          ['SPV_Approved', 'SPV'],
          ['Senior_SPV_Approved', 'Sr. SPV'],
          ['Rejected', 'Ditolak'],
        ] as [TaskStatus, string][]).map(([s, label]) => (
          <div key={s} className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className={`w-3 h-3 rounded border ${statusColor(s)}`} />
            {label}
          </div>
        ))}
      </div>

      {showForm && (
        <TaskFormWithAuto
          equipment={equipment}
          techs={techs}
          preselectedDate={preselectedDate}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}

      {dayDetail && (
        <DayDetailModal
          date={dayDetail.date}
          tasks={dayDetail.tasks}
          onClose={() => setDayDetail(null)}
          onAdd={() => { setPreselectedDate(dayDetail.date); setDayDetail(null); setShowForm(true); }}
          onChanged={load}
          onError={setLoadError}
        />
      )}
    </div>
  );
}

function statusColor(status: TaskStatus): string {
  const map: Record<TaskStatus, string> = {
    Assigned: 'bg-slate-50 border-slate-200 text-slate-600',
    In_Progress: 'bg-amber-50 border-amber-200 text-amber-700',
    Submitted: 'bg-blue-50 border-blue-200 text-blue-700',
    SPV_Approved: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    Senior_SPV_Approved: 'bg-teal-50 border-teal-200 text-teal-700',
    Rejected: 'bg-red-50 border-red-200 text-red-600',
  };
  return map[status];
}

function DayDetailModal({ date, tasks, onClose, onAdd, onChanged, onError }: {
  date: string;
  tasks: CalibrationTask[];
  onClose: () => void;
  onAdd: () => void;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  return (
    <Modal open onClose={onClose} title={`Jadwal — ${new Date(date).toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`} size="md">
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Tidak ada tugas di tanggal ini.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium text-slate-900">{t.equipment?.tag_number}</p>
                    {t.equipment && <ParamBadge type={t.equipment.parameter_type} />}
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{t.equipment?.nama_alat}</p>
                  <p className="text-xs text-slate-400">Teknisi: {t.technician?.full_name ?? t.technician?.username ?? '—'}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={async () => {
                  if (!confirm('Hapus tugas ini?')) return;
                  try {
                    await api(`/tasks/${t.id}`, { method: 'DELETE' });
                    onChanged();
                  } catch (err) {
                    onError(errorMessage(err));
                  }
                }}>
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex justify-between pt-2 border-t border-slate-100">
          <Button variant="ghost" onClick={onClose}>Tutup</Button>
          <Button size="sm" onClick={onAdd}><Plus className="w-3.5 h-3.5" /> Tambah di Tanggal Ini</Button>
        </div>
      </div>
    </Modal>
  );
}

function TaskFormWithAuto({ equipment, techs, preselectedDate, onClose, onSaved }: {
  equipment: Equipment[];
  techs: Profile[];
  preselectedDate: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [equipmentId, setEquipmentId] = useState('');
  const [techId, setTechId] = useState('');
  const [date, setDate] = useState(preselectedDate ?? toYMD(new Date()));
  const [autoAssign, setAutoAssign] = useState(false);
  const [workload, setWorkload] = useState<TechnicianWorkload[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Saat penugasan otomatis aktif, tanyakan beban teknisi pada tanggal tersebut
     ke backend (beban dihitung dalam rentang ±3 hari). */
  useEffect(() => {
    if (!autoAssign) {
      setWorkload(null);
      return;
    }
    let active = true;
    api<TechnicianWorkload[]>(`/dashboard/workload?date=${date}`)
      .then((rows) => {
        if (active) setWorkload(rows);
      })
      .catch((err) => {
        if (active) {
          setWorkload([]);
          setError(errorMessage(err));
        }
      });
    return () => { active = false; };
  }, [autoAssign, date]);

  const recommendedTech = workload?.[0] ?? null;
  const effectiveTechId = autoAssign ? (recommendedTech?.id ?? null) : (techId ? Number(techId) : null);

  const save = useCallback(async () => {
    if (!equipmentId) { setError('Pilih alat terlebih dahulu.'); return; }
    if (autoAssign && !effectiveTechId) { setError('Belum ada teknisi terdaftar untuk penugasan otomatis.'); return; }
    setSaving(true);
    setError(null);
    try {
      await api('/tasks', {
        method: 'POST',
        body: {
          equipment_id: Number(equipmentId),
          technician_id: effectiveTechId,
          scheduled_date: date,
        },
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }, [equipmentId, effectiveTechId, date, autoAssign, onSaved]);

  return (
    <Modal open onClose={onClose} title="Tugaskan Kalibrasi" size="md">
      <div className="space-y-4">
        <Field label="Alat Ukur">
          <Select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}>
            <option value="">— Pilih alat —</option>
            {equipment.map((eq) => (
              <option key={eq.id} value={eq.id}>{eq.tag_number} — {eq.nama_alat} ({eq.parameter_type})</option>
            ))}
          </Select>
        </Field>

        <Field label="Tanggal Jadwal">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        {/* Auto-assign toggle */}
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => { setAutoAssign(!autoAssign); if (!autoAssign) setTechId(''); }}
            className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors ${autoAssign ? 'bg-teal-50' : 'bg-white hover:bg-slate-50'}`}
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className={`w-4.5 h-4.5 ${autoAssign ? 'text-teal-600' : 'text-slate-400'}`} />
              <div>
                <p className="text-sm font-medium text-slate-900">Penugasan Otomatis</p>
                <p className="text-xs text-slate-400">Sistem memilih teknisi dengan beban tugas paling sedikit.</p>
              </div>
            </div>
            <span className={`w-9 h-5 rounded-full transition-colors relative ${autoAssign ? 'bg-teal-600' : 'bg-slate-300'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${autoAssign ? 'left-4.5' : 'left-0.5'}`} />
            </span>
          </button>

          {autoAssign && (
            <div className="px-4 py-3 bg-teal-50/50 border-t border-slate-100">
              {recommendedTech ? (
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-xs font-semibold text-teal-700">
                    {(recommendedTech.full_name ?? recommendedTech.username).charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{recommendedTech.full_name ?? recommendedTech.username}</p>
                    <p className="text-xs text-teal-600">Direkomendasikan — beban tugas paling rendah pada tanggal tersebut</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Belum ada teknisi terdaftar.</p>
              )}
            </div>
          )}
        </div>

        {!autoAssign && (
          <Field label="Teknisi">
            <Select value={techId} onChange={(e) => setTechId(e.target.value)}>
              <option value="">— Pilih teknisi —</option>
              {techs.map((t) => (
                <option key={t.id} value={t.id}>{t.full_name ?? t.username}</option>
              ))}
            </Select>
          </Field>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button onClick={save} loading={saving}>Tugaskan</Button>
        </div>
      </div>
    </Modal>
  );
}
