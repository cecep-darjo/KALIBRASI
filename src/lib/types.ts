export type UserRole = 'Admin' | 'Teknisi' | 'SPV' | 'Senior_SPV';

export type ParameterType = 'Suhu' | 'Pressure' | 'DP' | 'RPM';

export type TaskStatus =
  | 'Assigned'
  | 'In_Progress'
  | 'Submitted'
  | 'SPV_Approved'
  | 'Senior_SPV_Approved'
  | 'Rejected';

export type ApprovalStage = 'SPV' | 'Senior_SPV';
export type ApprovalDecision = 'Approved' | 'Rejected';

/* ID kini berupa integer (SQL Server IDENTITY), bukan uuid. */

export interface Profile {
  id: number;
  username: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  is_active?: boolean;
  created_at: string | null;
}

export interface Equipment {
  id: number;
  tag_number: string;
  nama_alat: string;
  merk: string | null;
  model: string | null;
  serial_number: string | null;
  parameter_type: ParameterType;
  range_min: number | null;
  range_max: number | null;
  unit: string | null;
  location: string | null;
  created_at: string | null;
}

export interface CalibrationTask {
  id: number;
  equipment_id: number;
  technician_id: number | null;
  status: TaskStatus;
  scheduled_date: string;
  completed_at: string | null;
  created_at: string | null;
  equipment?: Equipment | null;
  technician?: Profile | null;
  result?: CalibrationResult | null;
}

/** Satu baris pengukuran pada tabel as-found / as-left. */
export interface CalibrationPoint {
  standard: string;
  reading: string;
  error: string;
}

/** Isi kolom JSON `as_found_data` / `as_left_data`. */
export interface CalibrationData {
  points: CalibrationPoint[];
  unit?: string;
  parameter?: ParameterType;
  lkk_notes?: string;
}

export interface CalibrationResult {
  id: number;
  task_id: number;
  as_found_data: CalibrationData | null;
  as_left_data: CalibrationData | null;
  environment_temp: number | null;
  humidity: number | null;
  created_at: string | null;
}

export interface Approval {
  id: number;
  task_id: number;
  approver_id: number;
  stage: ApprovalStage;
  decision: ApprovalDecision;
  notes: string | null;
  created_at: string | null;
  approver?: Profile;
}

/** Ringkasan untuk halaman Dashboard. */
export interface DashboardStats {
  equipment: number;
  tasks: number;
  pending: number;
  pending_spv: number;
  pending_senior: number;
  approved: number;
  rejected: number;
  active: number;
  recent_tasks: CalibrationTask[];
}

/** Beban tugas per teknisi (untuk fitur penugasan otomatis). */
export interface TechnicianWorkload {
  id: number;
  username: string;
  full_name: string | null;
  role: UserRole;
  load_count: number;
}
