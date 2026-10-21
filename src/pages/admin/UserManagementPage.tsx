import { useEffect, useState } from 'react';
import { Users, Shield, UserPlus, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Input, Select } from '@/components/ui/Field';
import { RoleBadge } from '@/components/ui/Badges';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Profile, UserRole } from '@/lib/types';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'Admin', label: 'Admin' },
  { value: 'Teknisi', label: 'Teknisi' },
  { value: 'SPV', label: 'Supervisor (SPV)' },
  { value: 'Senior_SPV', label: 'Senior Supervisor' },
];

export function UserManagementPage() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Profile | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('Teknisi');

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    username: '', password: '', full_name: '', email: '', role: 'Teknisi' as UserRole,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      setUsers(await api<Profile[]>('/users'));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveRole() {
    if (!editing) return;
    setSaving(true);
    try {
      await api(`/users/${editing.id}/role`, { method: 'PUT', body: { role: editRole } });
      setEditing(null);
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function createUser() {
    setSaving(true);
    setError(null);
    try {
      await api('/users', {
        method: 'POST',
        body: {
          username: form.username,
          password: form.password,
          full_name: form.full_name || null,
          email: form.email || null,
          role: form.role,
        },
      });
      setShowCreate(false);
      setForm({ username: '', password: '', full_name: '', email: '', role: 'Teknisi' });
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(u: Profile) {
    if (!confirm(`Hapus pengguna ${u.username}?`)) return;
    try {
      await api(`/users/${u.id}`, { method: 'DELETE' });
      load();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Manajemen User"
        subtitle="Kelola pengguna dan peran dalam sistem."
        icon={Users}
        action={<Button onClick={() => setShowCreate(true)}><UserPlus className="w-4 h-4" /> Tambah User</Button>}
      />

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {users.length === 0 && !loading ? (
          <EmptyState title="Belum ada pengguna" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-3 font-medium">Nama</th>
                  <th className="px-5 py-3 font-medium">Username</th>
                  <th className="px-5 py-3 font-medium">Peran</th>
                  <th className="px-5 py-3 font-medium">Dibuat</th>
                  <th className="px-5 py-3 font-medium text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-xs font-semibold text-slate-600">
                          {(u.full_name ?? u.username).charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium text-slate-900">{u.full_name ?? u.username}</span>
                        {u.id === me?.id && <span className="text-xs text-slate-400">(Anda)</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{u.username}</td>
                    <td className="px-5 py-3"><RoleBadge role={u.role} /></td>
                    <td className="px-5 py-3 text-slate-500">
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('id-ID') : '—'}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => { setEditing(u); setEditRole(u.role); }}>
                          <Shield className="w-3.5 h-3.5" /> Ubah Peran
                        </Button>
                        {u.id !== me?.id && (
                          <Button size="sm" variant="ghost" onClick={() => removeUser(u)}>
                            <Trash2 className="w-3.5 h-3.5 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ubah peran */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Ubah Peran Pengguna" size="sm">
        {editing && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-900">{editing.full_name ?? editing.username}</p>
              <p className="text-slate-500">@{editing.username}</p>
            </div>
            <Field label="Peran Baru">
              <Select value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Batal</Button>
              <Button onClick={saveRole} loading={saving}>Simpan</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Tambah pengguna */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Tambah Pengguna" size="md">
        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Username">
              <Input
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                placeholder="username"
              />
            </Field>
            <Field label="Nama Lengkap">
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                placeholder="Nama lengkap"
              />
            </Field>
            <Field label="Email (opsional)">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="email@perusahaan.com"
              />
            </Field>
            <Field label="Peran">
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Password" hint="Minimal 6 karakter.">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Batal</Button>
            <Button
              onClick={createUser}
              loading={saving}
              disabled={!form.username || form.password.length < 6}
            >
              Tambah
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
