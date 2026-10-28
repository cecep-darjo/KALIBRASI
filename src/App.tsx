import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { UserManagementPage } from '@/pages/admin/UserManagementPage';
import { EquipmentPage } from '@/pages/admin/EquipmentPage';
import { StandardInstrumentsPage } from '@/pages/admin/StandardInstrumentsPage';
import { TaskAssignmentPage } from '@/pages/admin/TaskAssignmentPage';
import { CalendarPage } from '@/pages/admin/CalendarPage';
import { TeknisiTasksPage } from '@/pages/teknisi/TeknisiTasksPage';
import { ReviewPage } from '@/pages/review/ReviewPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { AppShell } from '@/components/AppShell';
import type { UserRole } from '@/lib/types';
import { Gauge } from 'lucide-react';

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center animate-pulse">
          <Gauge className="w-6 h-6 text-white" />
        </div>
        <p className="text-sm text-slate-400">Memuat...</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ roles, children }: { roles: UserRole[]; children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingScreen />;
  if (!profile) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!roles.includes(profile.role)) return <Navigate to="/dashboard" replace />;
  return <AppShell>{children}</AppShell>;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (profile) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

      <Route path="/dashboard" element={<ProtectedRoute roles={['Admin', 'Teknisi', 'SPV', 'Senior_SPV']}><DashboardPage /></ProtectedRoute>} />

      <Route path="/admin/users" element={<ProtectedRoute roles={['Admin']}><UserManagementPage /></ProtectedRoute>} />
      <Route path="/admin/equipment" element={<ProtectedRoute roles={['Admin']}><EquipmentPage /></ProtectedRoute>} />
      <Route path="/admin/standards" element={<ProtectedRoute roles={['Admin']}><StandardInstrumentsPage /></ProtectedRoute>} />
      <Route path="/admin/tasks" element={<ProtectedRoute roles={['Admin']}><TaskAssignmentPage /></ProtectedRoute>} />
      <Route path="/admin/calendar" element={<ProtectedRoute roles={['Admin']}><CalendarPage /></ProtectedRoute>} />

      <Route path="/teknisi/tasks" element={<ProtectedRoute roles={['Teknisi']}><TeknisiTasksPage /></ProtectedRoute>} />

      <Route path="/spv/review" element={<ProtectedRoute roles={['SPV']}><ReviewPage stage="SPV" incomingStatus="Submitted" title="Review Supervisor" subtitle="Review data kalibrasi dari teknisi sebelum diteruskan ke Senior SPV." /></ProtectedRoute>} />

      <Route path="/senior-spv/review" element={<ProtectedRoute roles={['Senior_SPV']}><ReviewPage stage="Senior_SPV" incomingStatus="SPV_Approved" title="Review Senior Supervisor" subtitle="Review akhir dan otorisasi terbitnya laporan kalibrasi." /></ProtectedRoute>} />

      <Route path="/reports" element={<ProtectedRoute roles={['Admin', 'SPV', 'Senior_SPV']}><ReportsPage /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
