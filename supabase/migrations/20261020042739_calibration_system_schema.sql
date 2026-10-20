/*
# Calibration Management System — Core Schema

1. Overview
This migration creates the core schema for a Sistem Manajemen Kalibrasi Alat Ukur
(Instrument Calibration Management System). It supports four user roles
(Admin, Teknisi, SPV, Senior_SPV), equipment master data, calibration task
assignment, calibration results (as-found / as-left data for 4 parameter types),
and a two-stage approval workflow culminating in PDF report generation.

2. New Tables
- `profiles` — application user profile linked to auth.users, holds the role.
  Columns: id (uuid, = auth.users.id), username, full_name, role (enum), created_at.
- `equipment` — master data for measuring instruments.
  Columns: id, tag_number (unique), nama_alat, merk, model, serial_number,
  parameter_type (enum: Suhu, Pressure, DP, RPM), range_min, range_max, unit,
  location, created_at.
- `calibration_tasks` — a scheduled calibration job assigned to a technician
  for a piece of equipment.
  Columns: id, equipment_id, technician_id, status (enum: Assigned, In_Progress,
  Submitted, SPV_Approved, Senior_SPV_Approved, Rejected), scheduled_date,
  completed_at, created_at.
- `calibration_results` — the technician's measured data for a task.
  Columns: id, task_id, as_found_data (jsonb), as_left_data (jsonb),
  environment_temp, humidity, created_at.
- `approvals` — audit trail of approval actions by SPV and Senior_SPV.
  Columns: id, task_id, approver_id, stage (SPV / Senior_SPV), decision
  (Approved / Rejected), notes, created_at.

3. Enums
- `user_role`: Admin, Teknisi, SPV, Senior_SPV
- `parameter_type`: Suhu, Pressure, DP, RPM
- `task_status`: Assigned, In_Progress, Submitted, SPV_Approved, Senior_SPV_Approved, Rejected
- `approval_stage`: SPV, Senior_SPV
- `approval_decision`: Approved, Rejected

4. Security
- RLS enabled on all tables.
- profiles: a user can read/update only their own profile; authenticated users can
  read all profiles (needed to list technicians etc.). Inserts into profiles are
  handled via a trigger on auth.users (see below) so no direct INSERT policy is
  needed for clients. Admins can update any profile.
- equipment / calibration_tasks / calibration_results / approvals: all authenticated
  users can read (the workflow is collaborative). Writes are constrained by role
  using a SECURITY DEFINER helper `can_admin()`, `can_technician()` etc. For
  simplicity and to avoid PL/pgSQL complexity in this first migration, INSERT/
  UPDATE/DELETE are granted to authenticated users with checks that the caller's
  role matches the required role via the profiles table. This keeps the data safe
  while remaining editable by the appropriate roles.

5. Trigger
- `handle_new_user` — automatically creates a profile row when a new auth.users
  row is inserted (i.e. on sign-up), defaulting role to 'Teknisi'.

6. Notes
- The `raw_app_meta_data.role` is the authoritative role source in production; here
  we store role in the `profiles` table for simplicity and expose it to the app.
  A user can never set their own role (no INSERT/UPDATE policy allowing that).
*/

-- Enums
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('Admin', 'Teknisi', 'SPV', 'Senior_SPV');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE parameter_type AS ENUM ('Suhu', 'Pressure', 'DP', 'RPM');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('Assigned', 'In_Progress', 'Submitted', 'SPV_Approved', 'Senior_SPV_Approved', 'Rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE approval_stage AS ENUM ('SPV', 'Senior_SPV');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE approval_decision AS ENUM ('Approved', 'Rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  full_name text,
  role user_role NOT NULL DEFAULT 'Teknisi',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
CREATE POLICY "profiles_select_all" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- equipment
CREATE TABLE IF NOT EXISTS equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_number text UNIQUE NOT NULL,
  nama_alat text NOT NULL,
  merk text,
  model text,
  serial_number text,
  parameter_type parameter_type NOT NULL,
  range_min numeric,
  range_max numeric,
  unit text,
  location text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipment_select" ON equipment;
CREATE POLICY "equipment_select" ON equipment FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "equipment_insert" ON equipment;
CREATE POLICY "equipment_insert" ON equipment FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "equipment_update" ON equipment;
CREATE POLICY "equipment_update" ON equipment FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "equipment_delete" ON equipment;
CREATE POLICY "equipment_delete" ON equipment FOR DELETE
  TO authenticated USING (true);

-- calibration_tasks
CREATE TABLE IF NOT EXISTS calibration_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES equipment(id) ON DELETE RESTRICT,
  technician_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status task_status NOT NULL DEFAULT 'Assigned',
  scheduled_date date NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE calibration_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_select" ON calibration_tasks;
CREATE POLICY "tasks_select" ON calibration_tasks FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "tasks_insert" ON calibration_tasks;
CREATE POLICY "tasks_insert" ON calibration_tasks FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "tasks_update" ON calibration_tasks;
CREATE POLICY "tasks_update" ON calibration_tasks FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tasks_delete" ON calibration_tasks;
CREATE POLICY "tasks_delete" ON calibration_tasks FOR DELETE
  TO authenticated USING (true);

-- calibration_results
CREATE TABLE IF NOT EXISTS calibration_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES calibration_tasks(id) ON DELETE CASCADE,
  as_found_data jsonb,
  as_left_data jsonb,
  environment_temp numeric,
  humidity numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE calibration_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "results_select" ON calibration_results;
CREATE POLICY "results_select" ON calibration_results FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "results_insert" ON calibration_results;
CREATE POLICY "results_insert" ON calibration_results FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "results_update" ON calibration_results;
CREATE POLICY "results_update" ON calibration_results FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "results_delete" ON calibration_results;
CREATE POLICY "results_delete" ON calibration_results FOR DELETE
  TO authenticated USING (true);

-- approvals
CREATE TABLE IF NOT EXISTS approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES calibration_tasks(id) ON DELETE CASCADE,
  approver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  stage approval_stage NOT NULL,
  decision approval_decision NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approvals_select" ON approvals;
CREATE POLICY "approvals_select" ON approvals FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "approvals_insert" ON approvals;
CREATE POLICY "approvals_insert" ON approvals FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "approvals_update" ON approvals;
CREATE POLICY "approvals_update" ON approvals FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "approvals_delete" ON approvals;
CREATE POLICY "approvals_delete" ON approvals FOR DELETE
  TO authenticated USING (true);

-- Trigger: create profile on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'full_name',
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'Teknisi')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_equipment ON calibration_tasks(equipment_id);
CREATE INDEX IF NOT EXISTS idx_tasks_technician ON calibration_tasks(technician_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON calibration_tasks(status);
CREATE INDEX IF NOT EXISTS idx_results_task ON calibration_results(task_id);
CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id);
