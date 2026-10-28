import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, CalendarClock, Pencil, Plus, Search, ShieldCheck, Wrench } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select } from '@/components/ui/Field';
import { EmptyState } from '@/components/ui/EmptyState';
import { ParamBadge } from '@/components/ui/Badges';
import type { ParameterType, StandardInstrument } from '@/lib/types';

const parameterTypes: ParameterType[] = ['Suhu', 'Pressure', 'DP', 'RPM'];
type FormState = {
  standard_code: string;
  name: string;
  parameter_type: ParameterType;
  manufacturer: string;
  model: string;
  serial_number: string;
  certificate_number: string;
  range_min: string;
  range_max: string;
  unit: string;
  calibration_due_date: string;
  master_correction: string;
  expanded_uncertainty: string;
  calibration_lab: string;
  is_active: boolean;
};
type FormTextField = Exclude<keyof FormState, 'is_active'>;

const blankForm = (): FormState => ({
  standard_code: '', name: '', parameter_type: 'Suhu', manufacturer: '', model: '',
  serial_number: '', certificate_number: '', range_min: '', range_max: '',
  unit: '', calibration_due_date: '', is_active: true,
  master_correction: '', expanded_uncertainty: '', calibration_lab: '',
});

function dateOnly(value: string | null) {
  return value ? value.slice(0, 10) : '';
}

export function StandardInstrumentsPage() {
  const [items, setItems] = useState<StandardInstrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<StandardInstrument | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    setLoading(true);
    try {
      setItems(await api<StandardInstrument[]>('/standards?include_inactive=true'));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const visibleItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => [item.standard_code, item.name, item.serial_number, item.certificate_number]
      .some((value) => value?.toLowerCase().includes(q)));
  }, [items, search]);

  return (
    <div>
      <PageHeader
        title="Kalibrator Standar"
        subtitle="Kelola alat acuan yang digunakan teknisi saat menginput hasil kalibrasi."
        icon={BadgeCheck}
        action={<Button onClick={() => { setEditing(null); setShowForm(true); }}><Plus className="w-4 h-4" /> Tambah Standar</Button>}
      />

      {error && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mb-4 max-w-md relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode, nama, serial, sertifikat..." className="pl-9" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {visibleItems.length === 0 && !loading ? (
          <EmptyState
            title={search ? 'Standar tidak ditemukan' : 'Belum ada kalibrator standar'}
            subtitle={search ? 'Coba kata pencarian lain.' : 'Tambahkan alat acuan agar dapat dipilih saat input kalibrasi.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 font-medium">Kode / Nama</th>
                  <th className="px-5 py-3 font-medium">Parameter</th>
                  <th className="px-5 py-3 font-medium">Merk / Model / Serial</th>
                  <th className="px-5 py-3 font-medium">Range</th>
                  <th className="px-5 py-3 font-medium">Sertifikat berlaku sampai</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {visibleItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">{item.standard_code}</p>
                      <p className="text-slate-500">{item.name}</p>
                    </td>
                    <td className="px-5 py-3"><ParamBadge type={item.parameter_type} /></td>
                    <td className="px-5 py-3 text-slate-600">
                      <p>{[item.manufacturer, item.model].filter(Boolean).join(' ') || '—'}</p>
                      <p className="text-xs text-slate-400">SN: {item.serial_number || '—'}</p>
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {item.range_min != null || item.range_max != null
                        ? `${item.range_min ?? '—'} – ${item.range_max ?? '—'} ${item.unit ?? ''}` : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      <span className="inline-flex items-center gap-1.5"><CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                        {item.calibration_due_date ? new Date(`${dateOnly(item.calibration_due_date)}T00:00:00`).toLocaleDateString('id-ID') : '—'}
                      </span>
                      {item.certificate_number && <p className="text-xs text-slate-400">{item.certificate_number}</p>}
                    </td>
                    <td className="px-5 py-3">
                      {(() => {
                        const expired = Boolean(item.calibration_due_date
                          && dateOnly(item.calibration_due_date) < new Date().toISOString().slice(0, 10));
                        const label = !item.is_active ? 'Nonaktif' : expired ? 'Sertifikat kedaluwarsa' : 'Aktif';
                        const colors = !item.is_active || expired
                          ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-700';
                        return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${colors}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${!item.is_active || expired ? 'bg-amber-500' : 'bg-teal-500'}`} />
                          {label}
                        </span>;
                      })()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => { setEditing(item); setShowForm(true); }}>
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && <StandardInstrumentForm
        instrument={editing}
        onClose={() => setShowForm(false)}
        onSaved={() => { setShowForm(false); void load(); }}
      />}
    </div>
  );
}

function StandardInstrumentForm({ instrument, onClose, onSaved }: {
  instrument: StandardInstrument | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(() => instrument ? ({
    standard_code: instrument.standard_code,
    name: instrument.name,
    parameter_type: instrument.parameter_type,
    manufacturer: instrument.manufacturer ?? '',
    model: instrument.model ?? '',
    serial_number: instrument.serial_number ?? '',
    certificate_number: instrument.certificate_number ?? '',
    range_min: instrument.range_min?.toString() ?? '',
    range_max: instrument.range_max?.toString() ?? '',
    unit: instrument.unit ?? '',
    calibration_due_date: dateOnly(instrument.calibration_due_date),
    master_correction: instrument.master_correction?.toString() ?? '',
    expanded_uncertainty: instrument.expanded_uncertainty?.toString() ?? '',
    calibration_lab: instrument.calibration_lab ?? '',
    is_active: instrument.is_active,
  }) : blankForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setText = (key: FormTextField) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
  };

  async function save() {
    setSaving(true);
    setError(null);
    const payload = {
      ...form,
      range_min: form.range_min === '' ? null : Number(form.range_min),
      range_max: form.range_max === '' ? null : Number(form.range_max),
      manufacturer: form.manufacturer || null,
      model: form.model || null,
      serial_number: form.serial_number || null,
      certificate_number: form.certificate_number || null,
      unit: form.unit || null,
      calibration_due_date: form.calibration_due_date || null,
      master_correction: form.master_correction === '' ? null : Number(form.master_correction),
      expanded_uncertainty: form.expanded_uncertainty === '' ? null : Number(form.expanded_uncertainty),
      calibration_lab: form.calibration_lab || null,
    };
    try {
      await api(instrument ? `/standards/${instrument.id}` : '/standards', {
        method: instrument ? 'PUT' : 'POST', body: payload,
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={instrument ? 'Edit Kalibrator Standar' : 'Tambah Kalibrator Standar'} size="lg">
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Kode Standar">
            <Input value={form.standard_code} onChange={setText('standard_code')} placeholder="STD-TEMP-001" />
          </Field>
          <Field label="Nama Kalibrator">
            <Input value={form.name} onChange={setText('name')} placeholder="Dry Block Calibrator" />
          </Field>
          <Field label="Parameter">
            <Select value={form.parameter_type} onChange={setText('parameter_type')}>
              {parameterTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </Select>
          </Field>
          <Field label="Merk / Pabrikan">
            <Input value={form.manufacturer ?? ''} onChange={setText('manufacturer')} placeholder="Fluke" />
          </Field>
          <Field label="Model">
            <Input value={form.model ?? ''} onChange={setText('model')} />
          </Field>
          <Field label="Nomor Seri">
            <Input value={form.serial_number ?? ''} onChange={setText('serial_number')} />
          </Field>
          <Field label="Nomor Sertifikat">
            <Input value={form.certificate_number ?? ''} onChange={setText('certificate_number')} />
          </Field>
          <Field label="Sertifikat Berlaku Sampai">
            <Input type="date" value={form.calibration_due_date ?? ''} onChange={setText('calibration_due_date')} />
          </Field>
          <Field label="Koreksi Master">
            <Input type="number" step="any" value={form.master_correction} onChange={setText('master_correction')} placeholder="0" />
          </Field>
          <Field label="Ketidakpastian Master (Uexp)">
            <Input type="number" min="0" step="any" value={form.expanded_uncertainty} onChange={setText('expanded_uncertainty')} placeholder="0.0068" />
          </Field>
          <Field label="Laboratorium Kalibrasi">
            <Input value={form.calibration_lab} onChange={setText('calibration_lab')} placeholder="Nama laboratorium" />
          </Field>
          <Field label="Range Minimum">
            <Input type="number" value={form.range_min ?? ''} onChange={setText('range_min')} placeholder="-20" />
          </Field>
          <Field label="Range Maksimum">
            <Input type="number" value={form.range_max ?? ''} onChange={setText('range_max')} placeholder="200" />
          </Field>
          <Field label="Satuan">
            <Input value={form.unit ?? ''} onChange={setText('unit')} placeholder="°C, bar, Pa, rpm" />
          </Field>
          <Field label="Status">
            <Select value={form.is_active ? 'true' : 'false'} onChange={(e) => setForm((current) => ({ ...current, is_active: e.target.value === 'true' }))}>
              <option value="true">Aktif</option>
              <option value="false">Nonaktif</option>
            </Select>
          </Field>
        </div>
        <p className="text-xs text-slate-500 flex items-start gap-2"><ShieldCheck className="w-4 h-4 shrink-0 text-teal-600" />Standar nonaktif tidak muncul pada pilihan teknisi. Data yang pernah dipakai tetap tercatat di hasil kalibrasi.</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button onClick={save} loading={saving}><Wrench className="w-4 h-4" />{instrument ? 'Simpan' : 'Tambah'}</Button>
        </div>
      </div>
    </Modal>
  );
}
