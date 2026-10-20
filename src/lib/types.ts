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

export interface Profile {
  id: string;
  username: string;
  full_name: string | null;
  role: UserRole;
  created_at: string;
}

export interface Equipment {
  id: string;
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
  created_at: string;
}

export interface CalibrationTask {
  id: string;
  equipment_id: string;
  technician_id: string | null;
  status: TaskStatus;
  scheduled_date: string;
  completed_at: string | null;
  created_at: string;
  equipment?: Equipment;
  technician?: Profile;
  result?: CalibrationResult | null;
}

export interface CalibrationResult {
  id: string;
  task_id: string;
  as_found_data: Record<string, unknown> | null;
  as_left_data: Record<string, unknown> | null;
  environment_temp: number | null;
  humidity: number | null;
  created_at: string;
}

export interface Approval {
  id: string;
  task_id: string;
  approver_id: string;
  stage: ApprovalStage;
  decision: ApprovalDecision;
  notes: string | null;
  created_at: string;
  approver?: Profile;
}
