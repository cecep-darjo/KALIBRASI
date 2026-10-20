import { type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, Wrench, ClipboardList, Gauge, CheckSquare,
  FileText, LogOut, Menu, X, ShieldCheck, CalendarDays,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { RoleBadge } from '@/components/ui/Badges';
import type { UserRole } from '@/lib/types';

interface NavItem {
  label: string;
  path: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, roles: ['Admin', 'Teknisi', 'SPV', 'Senior_SPV'] },
  { label: 'User Management', path: '/admin/users', icon: Users, roles: ['Admin'] },
  { label: 'Data Alat', path: '/admin/equipment', icon: Wrench, roles: ['Admin'] },
  { label: 'Penugasan Kalibrasi', path: '/admin/tasks', icon: ClipboardList, roles: ['Admin'] },
  { label: 'Kalender Jadwal', path: '/admin/calendar', icon: CalendarDays, roles: ['Admin'] },
  { label: 'Input Kalibrasi', path: '/teknisi/tasks', icon: Gauge, roles: ['Teknisi'] },
  { label: 'Review SPV', path: '/spv/review', icon: CheckSquare, roles: ['SPV'] },
  { label: 'Review Senior SPV', path: '/senior-spv/review', icon: ShieldCheck, roles: ['Senior_SPV'] },
  { label: 'Laporan Kalibrasi', path: '/reports', icon: FileText, roles: ['Admin', 'SPV', 'Senior_SPV'] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const items = navItems.filter((i) => profile && i.roles.includes(profile.role));

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 flex-col bg-white border-r border-slate-200 fixed inset-y-0 left-0 z-30">
        <SidebarContent items={items} currentPath={location.pathname} onNavigate={(p) => navigate(p)} profileName={profile?.full_name ?? profile?.username ?? ''} profileRole={profile?.role ?? 'Teknisi'} onSignOut={handleSignOut} />
      </aside>

      {/* Mobile drawer */}
      <MobileDrawer items={items} currentPath={location.pathname} onNavigate={(p) => navigate(p)} profileName={profile?.full_name ?? profile?.username ?? ''} profileRole={profile?.role ?? 'Teknisi'} onSignOut={handleSignOut} />

      {/* Main */}
      <div className="flex-1 md:ml-64 flex flex-col min-w-0">
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarContent({ items, currentPath, onNavigate, profileName, profileRole, onSignOut }: {
  items: NavItem[];
  currentPath: string;
  onNavigate: (p: string) => void;
  profileName: string;
  profileRole: UserRole;
  onSignOut: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-100">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
          <Gauge className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-slate-900 leading-tight">KalibrasiMS</p>
          <p className="text-[10px] text-slate-400 leading-tight">Calibration Management</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const active = currentPath === item.path || currentPath.startsWith(item.path + '/');
          const Icon = item.icon;
          return (
            <button
              key={item.path}
              onClick={() => onNavigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4.5 h-4.5 flex-shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-slate-100">
        <div className="flex items-center gap-2.5 px-3 py-2 mb-2">
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600">
            {profileName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800 truncate">{profileName}</p>
            <div className="mt-0.5"><RoleBadge role={profileRole} /></div>
          </div>
        </div>
        <button onClick={onSignOut} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors">
          <LogOut className="w-4 h-4" /> Keluar
        </button>
      </div>
    </>
  );
}

function MobileDrawer({ items, currentPath, onNavigate, profileName, profileRole, onSignOut }: {
  items: NavItem[];
  currentPath: string;
  onNavigate: (p: string) => void;
  profileName: string;
  profileRole: UserRole;
  onSignOut: () => void;
}) {
  return (
    <details className="md:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-slate-200">
      <summary className="flex items-center justify-between px-4 h-16 cursor-pointer list-none">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center">
            <Gauge className="w-4.5 h-4.5 text-white" />
          </div>
          <span className="text-sm font-bold text-slate-900">KalibrasiMS</span>
        </div>
        <Menu className="w-5 h-5 text-slate-600" />
      </summary>
      <div className="px-4 pb-4">
        <nav className="space-y-1">
          {items.map((item) => {
            const active = currentPath === item.path || currentPath.startsWith(item.path + '/');
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => { onNavigate(item.path); (document.querySelector('details') as HTMLDetailsElement)?.removeAttribute('open'); }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4.5 h-4.5" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-sm font-semibold text-slate-600">
              {profileName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-slate-800">{profileName}</p>
              <RoleBadge role={profileRole} />
            </div>
          </div>
          <button onClick={onSignOut} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </details>
  );
}
