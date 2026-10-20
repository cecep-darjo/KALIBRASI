import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Wrench, ClipboardList, CheckSquare, FileText, Gauge, TrendingUp, AlertCircle, CalendarDays } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/Badges';
import { EmptyState } from '@/components/ui/EmptyState';
import type { CalibrationTask, Equipment } from '@/lib/types';
import type { LucideIcon } from 'lucide-react';

export function DashboardPage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ equipment: 0, tasks: 0, pending: 0, approved: 0 });
  const [recentTasks, setRecentTasks] = useState<CalibrationTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [eq, tasks] = await Promise.all([
        supabase.from('equipment').select('id', { count: 'exact', head: true }),
        supabase.from('calibration_tasks').select('*, equipment(*), technician(*)').order('created_at', { ascending: false }).limit(5),
      ]);
      const taskCount = tasks.count ?? 0;
      setStats({
        equipment: eq.count ?? 0,
        tasks: taskCount,
        pending: 0,
        approved: 0,
      });
      setRecentTasks((tasks.data ?? []) as CalibrationTask[]);
      setLoading(false);
    })();
  }, []);

  const cards: { label: string; value: number; icon: LucideIcon; color: string }[] = [
    { label: 'Total Alat Terdaftar', value: stats.equipment, icon: Wrench, color: 'bg-teal-50 text-teal-700' },
    { label: 'Total Tugas Kalibrasi', value: stats.tasks, icon: ClipboardList, color: 'bg-blue-50 text-blue-700' },
    { label: 'Menunggu Review', value: stats.pending, icon: AlertCircle, color: 'bg-amber-50 text-amber-700' },
    { label: 'Laporan Disetujui', value: stats.approved, icon: CheckSquare, color: 'bg-emerald-50 text-emerald-700' },
  ];

  return (
    <div>
      <PageHeader
        title={`Selamat datang, ${profile?.full_name ?? profile?.username ?? ''}`}
        subtitle="Ringkasan sistem manajemen kalibrasi alat ukur."
        icon={Gauge}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((c) => (
          <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${c.color}`}>
              <c.icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{loading ? '—' : c.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h3 className="font-semibold text-slate-900">Tugas Kalibrasi Terbaru</h3>
            <TrendingUp className="w-4 h-4 text-slate-400" />
          </div>
          {recentTasks.length === 0 && !loading ? (
            <EmptyState title="Belum ada tugas kalibrasi" subtitle="Tugas akan muncul di sini setelah ditugaskan." />
          ) : (
            <div className="divide-y divide-slate-50">
              {recentTasks.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">
                      {t.equipment?.tag_number} — {t.equipment?.nama_alat}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Jadwal: {new Date(t.scheduled_date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {t.technician && ` • Teknisi: ${t.technician.full_name ?? t.technician.username}`}
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Akses Cepat</h3>
          <div className="space-y-2">
            <QuickLink to="/reports" icon={FileText} label="Laporan Kalibrasi" />
            {profile?.role === 'Admin' && <QuickLink to="/admin/equipment" icon={Wrench} label="Kelola Data Alat" />}
            {profile?.role === 'Admin' && <QuickLink to="/admin/tasks" icon={ClipboardList} label="Tugaskan Kalibrasi" />}
            {profile?.role === 'Admin' && <QuickLink to="/admin/calendar" icon={CalendarDays} label="Kalender Jadwal" />}
            {profile?.role === 'Teknisi' && <QuickLink to="/teknisi/tasks" icon={Gauge} label="Input Kalibrasi" />}
            {(profile?.role === 'SPV' || profile?.role === 'Senior_SPV') && (
              <QuickLink to={profile.role === 'SPV' ? '/spv/review' : '/senior-spv/review'} icon={CheckSquare} label="Review & Approval" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: LucideIcon; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors">
      <Icon className="w-4.5 h-4.5 text-slate-500" />
      <span className="text-sm font-medium text-slate-700">{label}</span>
    </Link>
  );
}
