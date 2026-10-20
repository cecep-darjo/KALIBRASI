import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gauge, Mail, Lock, User, UserCircle, Shield } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import type { UserRole } from '@/lib/types';

export function LoginPage() {
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('Teknisi');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) { setError(error); setLoading(false); }
      else { navigate('/dashboard'); }
    } else {
      const { error } = await signUp(email, password, username, fullName, role);
      if (error) { setError(error); setLoading(false); }
      else { navigate('/dashboard'); }
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-800 via-slate-900 to-teal-950 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, white 1px, transparent 1px), radial-gradient(circle at 70% 60%, white 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
              <Gauge className="w-6 h-6" />
            </div>
            <div>
              <p className="text-lg font-bold">KalibrasiMS</p>
              <p className="text-xs text-slate-300">Sistem Manajemen Kalibrasi Alat Ukur</p>
            </div>
          </div>
          <div className="space-y-6">
            <h1 className="text-3xl font-bold leading-tight">
              Kelola kalibrasi alat ukur Anda dengan alur kerja yang terstandar.
            </h1>
            <p className="text-slate-300 leading-relaxed">
              Manajemen alat, penugasan teknisi, input data kalibrasi untuk Suhu, Pressure,
              Differential Pressure, dan RPM — lengkap dengan alur approval dua tingkat dan
              laporan PDF dengan QR verifikasi.
            </p>
            <div className="grid grid-cols-2 gap-4 pt-4">
              {[
                { icon: User, label: '4 Peran Pengguna' },
                { icon: Gauge, label: '4 Parameter Kalibrasi' },
                { icon: Shield, label: 'Approval Dua Tingkat' },
                { icon: UserCircle, label: 'Laporan PDF + QR' },
              ].map((f) => (
                <div key={f.label} className="flex items-center gap-2.5 text-sm text-slate-200">
                  <f.icon className="w-5 h-5 text-teal-400" />
                  {f.label}
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-400">© 2026 KalibrasiMS. Sistem kalibrasi terstandar.</p>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
              <Gauge className="w-5 h-5 text-white" />
            </div>
            <p className="text-lg font-bold text-slate-900">KalibrasiMS</p>
          </div>

          <h2 className="text-2xl font-bold text-slate-900">
            {mode === 'login' ? 'Masuk ke akun Anda' : 'Buat akun baru'}
          </h2>
          <p className="text-sm text-slate-500 mt-1 mb-6">
            {mode === 'login' ? 'Selamat datang kembali.' : 'Daftar untuk mulai mengelola kalibrasi.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <>
                <Field label="Nama Lengkap">
                  <div className="relative">
                    <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                    <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nama lengkap" required className="pl-10" />
                  </div>
                </Field>
                <Field label="Username">
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" required />
                </Field>
                <Field label="Peran (Role)">
                  <Select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
                    <option value="Admin">Admin</option>
                    <option value="Teknisi">Teknisi</option>
                    <option value="SPV">Supervisor (SPV)</option>
                    <option value="Senior_SPV">Senior Supervisor</option>
                  </Select>
                </Field>
              </>
            )}
            <Field label="Email">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@perusahaan.com" required className="pl-10" />
              </div>
            </Field>
            <Field label="Password">
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-400" />
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={6} className="pl-10" />
              </div>
            </Field>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" loading={loading} size="lg" className="w-full">
              {mode === 'login' ? 'Masuk' : 'Daftar'}
            </Button>
          </form>

          <p className="text-sm text-center text-slate-500 mt-6">
            {mode === 'login' ? 'Belum punya akun?' : 'Sudah punya akun?'}{' '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null); }}
              className="font-medium text-teal-600 hover:text-teal-700"
            >
              {mode === 'login' ? 'Daftar di sini' : 'Masuk di sini'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
