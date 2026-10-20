import type { TaskStatus, UserRole, ParameterType } from '@/lib/types';

const statusStyles: Record<TaskStatus, string> = {
  Assigned: 'bg-slate-100 text-slate-700',
  In_Progress: 'bg-amber-100 text-amber-800',
  Submitted: 'bg-blue-100 text-blue-800',
  SPV_Approved: 'bg-cyan-100 text-cyan-800',
  Senior_SPV_Approved: 'bg-teal-100 text-teal-800',
  Rejected: 'bg-red-100 text-red-700',
};

const statusLabels: Record<TaskStatus, string> = {
  Assigned: 'Ditugaskan',
  In_Progress: 'Berjalan',
  Submitted: 'Dikirim',
  SPV_Approved: 'Disetujui SPV',
  Senior_SPV_Approved: 'Disetujui Sr. SPV',
  Rejected: 'Ditolak',
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

const roleStyles: Record<UserRole, string> = {
  Admin: 'bg-slate-800 text-white',
  Teknisi: 'bg-teal-100 text-teal-800',
  SPV: 'bg-indigo-100 text-indigo-800',
  Senior_SPV: 'bg-cyan-100 text-cyan-800',
};

const roleLabels: Record<UserRole, string> = {
  Admin: 'Admin',
  Teknisi: 'Teknisi',
  SPV: 'Supervisor',
  Senior_SPV: 'Sr. Supervisor',
};

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${roleStyles[role]}`}>
      {roleLabels[role]}
    </span>
  );
}

const paramLabels: Record<ParameterType, string> = {
  Suhu: 'Suhu',
  Pressure: 'Pressure',
  DP: 'Diff. Pressure',
  RPM: 'RPM',
};

export function ParamBadge({ type }: { type: ParameterType }) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
      {paramLabels[type]}
    </span>
  );
}
