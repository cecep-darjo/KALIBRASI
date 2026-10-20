import { useEffect, useState } from 'react';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select } from '@/components/ui/Field';
import { StatusBadge, ParamBadge } from '@/components/ui/Badges';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CalibrationTask, Equipment, Profile } from '@/lib/types';

export function TaskAssignmentPage() {
  const [tasks, setTasks] = useState<CalibrationTask[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [techs, setTechs] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const [t, e, p] = await Promise.all([
      supabase.from('calibration_tasks').select('*, equipment(*), technician(*)').order('scheduled_date', { ascending: false }),
      supabase.from('equipment').select('*').order('tag_number'),
      supabase.from('profiles').select('*').eq('role', 'Teknisi').order('full_name'),
    ]);
    setTasks((t.data ?? []) as CalibrationTask[]);
    setEquipment((e.data ?? []) as Equipment[]);
    setTechs((p.data ?? []) as Profile[]);
    setLoading(false);
  }

  return (
    <div>
      <PageHeader
        title="Penugasan Kalibrasi"
        subtitle="Jadwalkan tugas kalibrasi untuk teknisi."
        icon={ClipboardList}
        action={<Button onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Tugaskan</Button>}
      />

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {tasks.length === 0 && !loading ? (
          <EmptyState title="Belum ada penugasan" subtitle="Klik 'Tugaskan' untuk membuat jadwal kalibrasi." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 font-medium">Alat</th>
                  <th className="px-5 py-3 font-medium">Parameter</th>
                  <th className="px-5 py-3 font-medium">Teknisi</th>
                  <th className="px-5 py-3 font-medium">Jadwal</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900">{t.equipment?.tag_number}</p>
                      <p className="text-xs text-slate-400">{t.equipment?.nama_alat}</p>
                    </td>
                    <td className="px-5 py-3">{t.equipment && <ParamBadge type={t.equipment.parameter_type} />}</td>
                    <td className="px-5 py-3 text-slate-600">{t.technician?.full_name ?? t.technician?.username ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-500">{new Date(t.scheduled_date).toLocaleDateString('id-ID')}</td>
                    <td className="px-5 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (confirm('Hapus tugas ini?')) { await supabase.from('calibration_tasks').delete().eq('id', t.id); load(); }
                      }}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <TaskForm equipment={equipment} techs={techs} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />
      )}
    </div>
  );
}

function TaskForm({ equipment, techs, onClose, onSaved }: { equipment: Equipment[]; techs: Profile[]; onClose: () => void; onSaved: () => void }) {
  const [equipmentId, setEquipmentId] = useState('');
  const [techId, setTechId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!equipmentId) { setError('Pilih alat terlebih dahulu.'); return; }
    setSaving(true);
    setError(null);
    const { error } = await supabase.from('calibration_tasks').insert({
      equipment_id: equipmentId,
      technician_id: techId || null,
      scheduled_date: date,
      status: 'Assigned',
    });
    if (error) { setError(error.message); setSaving(false); return; }
    onSaved();
  }

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
        <Field label="Teknisi">
          <Select value={techId} onChange={(e) => setTechId(e.target.value)}>
            <option value="">— Pilih teknisi —</option>
            {techs.map((t) => (
              <option key={t.id} value={t.id}>{t.full_name ?? t.username}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tanggal Jadwal">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button onClick={save} loading={saving}>Tugaskan</Button>
        </div>
      </div>
    </Modal>
  );
}
