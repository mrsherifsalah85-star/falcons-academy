/*
# English Language Academy Management System - Core Schema

## Overview
Creates the complete database schema for an internal academy management system
with three roles: Super Admin, Sub-Admin, and Teacher.

## New Tables
1. `profiles` - Extends auth.users with role, display_name, and granular permissions (jsonb)
2. `groups` - Classes/groups with teacher assignment and intelligence classification
3. `students` - Students belonging to groups
4. `session_reports` - Daily session logs with covered material text
5. `evaluations` - Per-student evaluations linked to session reports
6. `custom_columns` - User-defined evaluation column definitions per group
7. `exams` - Scheduled exams per group with dates for early alarm computation

## Security
- RLS enabled on all tables
- Helper functions: is_super_admin(), has_permission(), is_teacher_of_group(), can_view_all_groups()
- Auto-profile creation trigger on auth.users insert (first user = super_admin, rest = teacher)
- Granular policies per table based on role and permissions
*/

-- ============================================================
-- PROFILES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'teacher' CHECK (role IN ('super_admin', 'sub_admin', 'teacher')),
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- GROUPS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  level text NOT NULL DEFAULT '',
  intelligence text NOT NULL DEFAULT 'unclassified' CHECK (intelligence IN ('strong', 'weak', 'unclassified')),
  teacher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STUDENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_students_group_id ON public.students(group_id);

-- ============================================================
-- SESSION REPORTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.session_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  content text NOT NULL DEFAULT '',
  pace text NOT NULL DEFAULT 'on_time' CHECK (pace IN ('on_time', 'delayed', 'faster')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.session_reports ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_session_reports_group_id ON public.session_reports(group_id);
CREATE INDEX IF NOT EXISTS idx_session_reports_report_date ON public.session_reports(report_date);

-- ============================================================
-- EVALUATIONS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_report_id uuid NOT NULL REFERENCES public.session_reports(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  quiz_score integer,
  dictation text CHECK (dictation IS NULL OR dictation IN ('Super', 'Some Mistakes', 'Not Studied')),
  reading text CHECK (reading IS NULL OR reading IN ('Good', 'Needs Practice', 'Needs Study More')),
  homework text CHECK (homework IS NULL OR homework IN ('Done Well', 'Careless', 'Not Done')),
  behavior text NOT NULL DEFAULT 'Committed' CHECK (behavior IN ('Committed', 'Disruptive')),
  custom_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_report_id, student_id)
);

ALTER TABLE public.evaluations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_evaluations_session_report_id ON public.evaluations(session_report_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_student_id ON public.evaluations(student_id);

-- ============================================================
-- CUSTOM COLUMNS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.custom_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  column_type text NOT NULL DEFAULT 'text' CHECK (column_type IN ('text', 'number', 'dropdown')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_columns ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_custom_columns_group_id ON public.custom_columns(group_id);

-- ============================================================
-- EXAMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.exams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title text NOT NULL,
  exam_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_exams_group_id ON public.exams(group_id);
CREATE INDEX IF NOT EXISTS idx_exams_exam_date ON public.exams(exam_date);

-- ============================================================
-- HELPER FUNCTIONS (SECURITY DEFINER)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'super_admin' FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(perm text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role = 'super_admin'
     OR (role = 'sub_admin' AND COALESCE((permissions ->> perm)::boolean, false))
     FROM public.profiles WHERE id = auth.uid()),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_teacher_of_group(g uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.groups
    WHERE id = g AND teacher_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_all_groups()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT public.is_super_admin()
  OR public.has_permission('view_dashboard')
  OR public.has_permission('view_all_groups')
  OR public.has_permission('view_teacher_workspace');
$$;

-- Revoke execute from public/anon for helper functions
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_teacher_of_group(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_view_all_groups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher_of_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_all_groups() TO authenticated;

-- ============================================================
-- AUTO-PROFILE CREATION TRIGGER
-- First user becomes super_admin; subsequent users become teacher
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
    CASE
      WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'super_admin') THEN 'super_admin'
      ELSE 'teacher'
    END
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- GRANTS
-- ============================================================
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.evaluations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_columns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exams TO authenticated;

-- ============================================================
-- RLS POLICIES: PROFILES
-- ============================================================
DROP POLICY IF EXISTS "select_profiles" ON public.profiles;
CREATE POLICY "select_profiles" ON public.profiles FOR SELECT
  TO authenticated USING (
    public.is_super_admin()
    OR id = auth.uid()
    OR public.has_permission('manage_staff')
  );

DROP POLICY IF EXISTS "update_profiles" ON public.profiles;
CREATE POLICY "update_profiles" ON public.profiles FOR UPDATE
  TO authenticated USING (
    public.is_super_admin()
    OR public.has_permission('manage_staff')
    OR id = auth.uid()
  ) WITH CHECK (
    public.is_super_admin()
    OR public.has_permission('manage_staff')
    OR id = auth.uid()
  );

-- ============================================================
-- RLS POLICIES: GROUPS
-- ============================================================
DROP POLICY IF EXISTS "select_groups" ON public.groups;
CREATE POLICY "select_groups" ON public.groups FOR SELECT
  TO authenticated USING (
    public.can_view_all_groups()
    OR teacher_id = auth.uid()
  );

DROP POLICY IF EXISTS "insert_groups" ON public.groups;
CREATE POLICY "insert_groups" ON public.groups FOR INSERT
  TO authenticated WITH CHECK (public.has_permission('manage_groups'));

DROP POLICY IF EXISTS "update_groups" ON public.groups;
CREATE POLICY "update_groups" ON public.groups FOR UPDATE
  TO authenticated USING (public.has_permission('manage_groups'))
  WITH CHECK (public.has_permission('manage_groups'));

DROP POLICY IF EXISTS "delete_groups" ON public.groups;
CREATE POLICY "delete_groups" ON public.groups FOR DELETE
  TO authenticated USING (public.has_permission('manage_groups'));

-- ============================================================
-- RLS POLICIES: STUDENTS
-- ============================================================
DROP POLICY IF EXISTS "select_students" ON public.students;
CREATE POLICY "select_students" ON public.students FOR SELECT
  TO authenticated USING (
    public.can_view_all_groups()
    OR public.is_teacher_of_group(group_id)
  );

DROP POLICY IF EXISTS "insert_students" ON public.students;
CREATE POLICY "insert_students" ON public.students FOR INSERT
  TO authenticated WITH CHECK (
    public.has_permission('manage_students')
    OR public.is_teacher_of_group(group_id)
  );

DROP POLICY IF EXISTS "update_students" ON public.students;
CREATE POLICY "update_students" ON public.students FOR UPDATE
  TO authenticated USING (
    public.has_permission('manage_students')
    OR public.is_teacher_of_group(group_id)
  ) WITH CHECK (
    public.has_permission('manage_students')
    OR public.is_teacher_of_group(group_id)
  );

DROP POLICY IF EXISTS "delete_students" ON public.students;
CREATE POLICY "delete_students" ON public.students FOR DELETE
  TO authenticated USING (
    public.has_permission('manage_students')
    OR public.is_teacher_of_group(group_id)
  );

-- ============================================================
-- RLS POLICIES: SESSION REPORTS
-- ============================================================
DROP POLICY IF EXISTS "select_session_reports" ON public.session_reports;
CREATE POLICY "select_session_reports" ON public.session_reports FOR SELECT
  TO authenticated USING (
    public.can_view_all_groups()
    OR public.is_teacher_of_group(group_id)
  );

DROP POLICY IF EXISTS "insert_session_reports" ON public.session_reports;
CREATE POLICY "insert_session_reports" ON public.session_reports FOR INSERT
  TO authenticated WITH CHECK (
    public.is_teacher_of_group(group_id)
    OR public.has_permission('view_teacher_workspace')
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "update_session_reports" ON public.session_reports;
CREATE POLICY "update_session_reports" ON public.session_reports FOR UPDATE
  TO authenticated USING (
    public.is_teacher_of_group(group_id)
    OR public.has_permission('view_teacher_workspace')
    OR public.is_super_admin()
  ) WITH CHECK (
    public.is_teacher_of_group(group_id)
    OR public.has_permission('view_teacher_workspace')
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "delete_session_reports" ON public.session_reports;
CREATE POLICY "delete_session_reports" ON public.session_reports FOR DELETE
  TO authenticated USING (
    public.is_teacher_of_group(group_id)
    OR public.has_permission('view_teacher_workspace')
    OR public.is_super_admin()
  );

-- ============================================================
-- RLS POLICIES: EVALUATIONS
-- ============================================================
DROP POLICY IF EXISTS "select_evaluations" ON public.evaluations;
CREATE POLICY "select_evaluations" ON public.evaluations FOR SELECT
  TO authenticated USING (
    public.can_view_all_groups()
    OR EXISTS (
      SELECT 1 FROM public.session_reports sr
      WHERE sr.id = public.evaluations.session_report_id
      AND public.is_teacher_of_group(sr.group_id)
    )
  );

DROP POLICY IF EXISTS "insert_evaluations" ON public.evaluations;
CREATE POLICY "insert_evaluations" ON public.evaluations FOR INSERT
  TO authenticated WITH CHECK (
    public.is_super_admin()
    OR public.has_permission('view_teacher_workspace')
    OR EXISTS (
      SELECT 1 FROM public.session_reports sr
      WHERE sr.id = public.evaluations.session_report_id
      AND public.is_teacher_of_group(sr.group_id)
    )
  );

DROP POLICY IF EXISTS "update_evaluations" ON public.evaluations;
CREATE POLICY "update_evaluations" ON public.evaluations FOR UPDATE
  TO authenticated USING (
    public.is_super_admin()
    OR public.has_permission('view_teacher_workspace')
    OR EXISTS (
      SELECT 1 FROM public.session_reports sr
      WHERE sr.id = public.evaluations.session_report_id
      AND public.is_teacher_of_group(sr.group_id)
    )
  ) WITH CHECK (
    public.is_super_admin()
    OR public.has_permission('view_teacher_workspace')
    OR EXISTS (
      SELECT 1 FROM public.session_reports sr
      WHERE sr.id = public.evaluations.session_report_id
      AND public.is_teacher_of_group(sr.group_id)
    )
  );

DROP POLICY IF EXISTS "delete_evaluations" ON public.evaluations;
CREATE POLICY "delete_evaluations" ON public.evaluations FOR DELETE
  TO authenticated USING (
    public.is_super_admin()
    OR public.has_permission('view_teacher_workspace')
    OR EXISTS (
      SELECT 1 FROM public.session_reports sr
      WHERE sr.id = public.evaluations.session_report_id
      AND public.is_teacher_of_group(sr.group_id)
    )
  );

-- ============================================================
-- RLS POLICIES: CUSTOM COLUMNS
-- ============================================================
DROP POLICY IF EXISTS "select_custom_columns" ON public.custom_columns;
CREATE POLICY "select_custom_columns" ON public.custom_columns FOR SELECT
  TO authenticated USING (
    public.can_view_all_groups()
    OR public.is_teacher_of_group(group_id)
  );

DROP POLICY IF EXISTS "insert_custom_columns" ON public.custom_columns;
CREATE POLICY "insert_custom_columns" ON public.custom_columns FOR INSERT
  TO authenticated WITH CHECK (
    public.has_permission('manage_groups')
    OR public.is_teacher_of_group(group_id)
  );

DROP POLICY IF EXISTS "update_custom_columns" ON public.custom_columns;
CREATE POLICY "update_custom_columns" ON public.custom_columns FOR UPDATE
  TO authenticated USING (
    public.has_permission('manage_groups')
    OR public.is_teacher_of_group(group_id)
  ) WITH CHECK (
    public.has_permission('manage_groups')
    OR public.is_teacher_of_group(group_id)
  );

DROP POLICY IF EXISTS "delete_custom_columns" ON public.custom_columns;
CREATE POLICY "delete_custom_columns" ON public.custom_columns FOR DELETE
  TO authenticated USING (
    public.has_permission('manage_groups')
    OR public.is_teacher_of_group(group_id)
  );

-- ============================================================
-- RLS POLICIES: EXAMS
-- ============================================================
DROP POLICY IF EXISTS "select_exams" ON public.exams;
CREATE POLICY "select_exams" ON public.exams FOR SELECT
  TO authenticated USING (
    public.can_view_all_groups()
    OR public.is_teacher_of_group(group_id)
  );

DROP POLICY IF EXISTS "insert_exams" ON public.exams;
CREATE POLICY "insert_exams" ON public.exams FOR INSERT
  TO authenticated WITH CHECK (public.has_permission('manage_exams'));

DROP POLICY IF EXISTS "update_exams" ON public.exams;
CREATE POLICY "update_exams" ON public.exams FOR UPDATE
  TO authenticated USING (public.has_permission('manage_exams'))
  WITH CHECK (public.has_permission('manage_exams'));

DROP POLICY IF EXISTS "delete_exams" ON public.exams;
CREATE POLICY "delete_exams" ON public.exams FOR DELETE
  TO authenticated USING (public.has_permission('manage_exams'));