import { useEffect, useState } from 'react';
import { Wrench, Plus, Pencil, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select } from '@/components/ui/Field';
import { ParamBadge } from '@/components/ui/Badges';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Equipment, ParameterType } from '@/lib/types';

const paramTypes: ParameterType[] = ['Suhu', 'Pressure', 'DP', 'RPM'];

export function EquipmentPage() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setItems(await api<Equipment[]>('/equipment'));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function removeEquipment(eq: Equipment) {
    if (!confirm(`Hapus alat ${eq.tag_number}?`)) return;
    try {
      await api(`/equipment/${eq.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Data Alat Ukur"
        subtitle="Master data instrumen pengukuran."
        icon={Wrench}
        action={<Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="w-4 h-4" /> Tambah Alat</Button>}
      />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {items.length === 0 && !loading ? (
          <EmptyState title="Belum ada alat terdaftar" subtitle="Klik 'Tambah Alat' untuk menambahkan instrumen." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 font-medium">Tag Number</th>
                  <th className="px-5 py-3 font-medium">Nama Alat</th>
                  <th className="px-5 py-3 font-medium">Merk / Model</th>
                  <th className="px-5 py-3 font-medium">Serial</th>
                  <th className="px-5 py-3 font-medium">Parameter</th>
                  <th className="px-5 py-3 font-medium">Range</th>
                  <th className="px-5 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {items.map((eq) => (
                  <tr key={eq.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">{eq.tag_number}</td>
                    <td className="px-5 py-3 text-slate-700">{eq.nama_alat}</td>
                    <td className="px-5 py-3 text-slate-500">{eq.merk ?? '—'} {eq.model ?? ''}</td>
                    <td className="px-5 py-3 text-slate-500">{eq.serial_number ?? '—'}</td>
                    <td className="px-5 py-3"><ParamBadge type={eq.parameter_type} /></td>
                    <td className="px-5 py-3 text-slate-500 text-xs">
                      {eq.range_min != null && eq.range_max != null ? `${eq.range_min} – ${eq.range_max} ${eq.unit ?? ''}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(eq); setShowForm(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => removeEquipment(eq)}>
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <EquipmentForm
          equipment={editing}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}
    </div>
  );
}

function EquipmentForm({ equipment, onClose, onSaved }: { equipment: Equipment | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    tag_number: equipment?.tag_number ?? '',
    nama_alat: equipment?.nama_alat ?? '',
    merk: equipment?.merk ?? '',
    model: equipment?.model ?? '',
    serial_number: equipment?.serial_number ?? '',
    parameter_type: equipment?.parameter_type ?? 'Suhu' as ParameterType,
    range_min: equipment?.range_min?.toString() ?? '',
    range_max: equipment?.range_max?.toString() ?? '',
    unit: equipment?.unit ?? '',
    location: equipment?.location ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  async function save() {
    setSaving(true);
    setError(null);
    const payload = {
      tag_number: form.tag_number,
      nama_alat: form.nama_alat,
      merk: form.merk || null,
      model: form.model || null,
      serial_number: form.serial_number || null,
      parameter_type: form.parameter_type,
      range_min: form.range_min ? parseFloat(form.range_min) : null,
      range_max: form.range_max ? parseFloat(form.range_max) : null,
      unit: form.unit || null,
      location: form.location || null,
    };
    try {
      await api(equipment ? `/equipment/${equipment.id}` : '/equipment', {
        method: equipment ? 'PUT' : 'POST',
        body: payload,
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={equipment ? 'Edit Alat' : 'Tambah Alat'} size="lg">
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Tag Number" error={undefined}>
            <Input value={form.tag_number} onChange={set('tag_number')} placeholder="TAG-001" />
          </Field>
          <Field label="Nama Alat">
            <Input value={form.nama_alat} onChange={set('nama_alat')} placeholder="Thermometer Digital" />
          </Field>
          <Field label="Merk">
            <Input value={form.merk} onChange={set('merk')} placeholder="Fluke" />
          </Field>
          <Field label="Model">
            <Input value={form.model} onChange={set('model')} placeholder="1551A" />
          </Field>
          <Field label="Serial Number">
            <Input value={form.serial_number} onChange={set('serial_number')} />
          </Field>
          <Field label="Tipe Parameter">
            <Select value={form.parameter_type} onChange={set('parameter_type')}>
              {paramTypes.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Range Minimum">
            <Input type="number" value={form.range_min} onChange={set('range_min')} placeholder="0" />
          </Field>
          <Field label="Range Maksimum">
            <Input type="number" value={form.range_max} onChange={set('range_max')} placeholder="100" />
          </Field>
          <Field label="Satuan">
            <Input value={form.unit} onChange={set('unit')} placeholder="°C, bar, Pa, rpm" />
          </Field>
          <Field label="Lokasi">
            <Input value={form.location} onChange={set('location')} placeholder="Lab Kalibrasi A" />
          </Field>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button onClick={save} loading={saving}>{equipment ? 'Simpan' : 'Tambah'}</Button>
        </div>
      </div>
    </Modal>
  );
}
