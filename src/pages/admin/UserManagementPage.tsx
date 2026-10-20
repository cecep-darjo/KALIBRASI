import { useEffect, useState } from 'react';
import { Users, Plus, Trash2, Shield } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Field, Select } from '@/components/ui/Field';
import { RoleBadge } from '@/components/ui/Badges';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Profile, UserRole } from '@/lib/types';

export function UserManagementPage() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('Teknisi');

  useEffect(() => { load(); }, []);

  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    setUsers((data ?? []) as Profile[]);
    setLoading(false);
  }

  async function saveRole() {
    if (!editing) return;
    await supabase.from('profiles').update({ role: editRole }).eq('id', editing.id);
    setEditing(null);
    load();
  }

  return (
    <div>
      <PageHeader title="Manajemen User" subtitle="Kelola pengguna dan peran dalam sistem." icon={Users} />
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
                    <td className="px-5 py-3 text-slate-500">{new Date(u.created_at).toLocaleDateString('id-ID')}</td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => { setEditing(u); setEditRole(u.role); }}>
                        <Shield className="w-3.5 h-3.5" /> Ubah Peran
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Ubah Peran Pengguna" size="sm">
        {editing && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-900">{editing.full_name ?? editing.username}</p>
              <p className="text-slate-500">@{editing.username}</p>
            </div>
            <Field label="Peran Baru">
              <Select value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)}>
                <option value="Admin">Admin</option>
                <option value="Teknisi">Teknisi</option>
                <option value="SPV">Supervisor (SPV)</option>
                <option value="Senior_SPV">Senior Supervisor</option>
              </Select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Batal</Button>
              <Button onClick={saveRole}>Simpan</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
