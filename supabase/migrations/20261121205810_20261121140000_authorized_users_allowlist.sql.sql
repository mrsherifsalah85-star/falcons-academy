/*
# Restricted access: authorized_users allowlist + first-time password setup

## Overview
Locks down registration so only pre-approved academy emails can create an
account, replaces the open "any signup becomes Super Admin" trigger, and adds
an allowlist table the Super Admin manages from the dashboard.

## New Tables
- `authorized_users`
  - `email` (text, primary key, stored lowercase)
  - `name` (text, not null, default '')
  - `role` (text, not null, 'super_admin' or 'teacher')
  - `is_active` (boolean, not null, default true)
  - `created_at` (timestamp)

## Modified Tables
- `profiles` — new `is_active` boolean column (default true); deactivating a
  staff member blocks their sign-in without deleting their data.

## Security Changes
1. `handle_new_user()` trigger rewritten: on signup, the new user's email MUST
   exist in `authorized_users` with `is_active = true`, otherwise the signup
   transaction is aborted. The profile is created with the role from the
   allowlist (super_admin or teacher).
2. New `is_email_authorized(email)` SECURITY DEFINER function: callable by
   `anon`, returns only whether the email is allowed — used by the login screen
   to check the allowlist before offering first-time password setup. It exposes
   no other data.
3. RLS enabled on `authorized_users`:
   - SELECT: authenticated staff (super admins / manage_staff permission need
     the list; regular teachers may read it as a harmless roster).
   - INSERT / UPDATE / DELETE: super admins (or manage_staff permission) only.
4. Profile UPDATE policy now prevents any user from flipping their own
   `is_active` flag (or their role) — deactivation cannot be self-undone.
5. Grants: SELECT/INSERT/UPDATE/DELETE on `authorized_users` to `authenticated`.

## Notes
- Existing profiles keep their roles. `mrsherifsalah85@gmail.com` is seeded as
  an active super_admin in the allowlist.
- Disabling open signups also requires turning off "Allow new users to sign up"
  is NOT needed: signup is still used for first-time password setup, but the
  trigger aborts any signup whose email is not on the allowlist.
*/

-- ============================================================
-- AUTHORIZED USERS ALLOWLIST
-- ============================================================
CREATE TABLE IF NOT EXISTS public.authorized_users (
  email text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'teacher' CHECK (role IN ('super_admin', 'teacher')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT authorized_users_email_lower CHECK (email = lower(email))
);

ALTER TABLE public.authorized_users ENABLE ROW LEVEL SECURITY;

-- Seed the academy super admin
INSERT INTO public.authorized_users (email, name, role, is_active)
VALUES ('mrsherifsalah85@gmail.com', 'Mr. Sherif Salah', 'super_admin', true)
ON CONFLICT (email) DO UPDATE
  SET role = 'super_admin', is_active = true;

-- ============================================================
-- PROFILES: is_active flag
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- ============================================================
-- ALLOWLIST CHECK FUNCTION (used by the login screen pre-check)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_email_authorized(check_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.authorized_users
    WHERE email = lower(check_email) AND is_active = true
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_email_authorized(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_email_authorized(text) TO anon, authenticated;

-- ============================================================
-- SIGNUP TRIGGER: only allowlisted + active emails may register
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_role text;
BEGIN
  SELECT role INTO allowed_role
  FROM public.authorized_users
  WHERE email = lower(NEW.email) AND is_active = true;

  IF allowed_role IS NULL THEN
    RAISE EXCEPTION 'This email is not authorized. Please contact the academy administrator.';
  END IF;

  INSERT INTO public.profiles (id, email, display_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)),
    allowed_role,
    true
  );
  RETURN NEW;
END;
$$;

-- ============================================================
-- GRANTS: AUTHORIZED USERS
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authorized_users TO authenticated;

-- ============================================================
-- RLS POLICIES: AUTHORIZED USERS
-- ============================================================
DROP POLICY IF EXISTS "select_authorized_users" ON public.authorized_users;
CREATE POLICY "select_authorized_users" ON public.authorized_users FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "insert_authorized_users" ON public.authorized_users;
CREATE POLICY "insert_authorized_users" ON public.authorized_users FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin() OR public.has_permission('manage_staff'));

DROP POLICY IF EXISTS "update_authorized_users" ON public.authorized_users;
CREATE POLICY "update_authorized_users" ON public.authorized_users FOR UPDATE
  TO authenticated
  USING (public.is_super_admin() OR public.has_permission('manage_staff'))
  WITH CHECK (public.is_super_admin() OR public.has_permission('manage_staff'));

DROP POLICY IF EXISTS "delete_authorized_users" ON public.authorized_users;
CREATE POLICY "delete_authorized_users" ON public.authorized_users FOR DELETE
  TO authenticated
  USING (public.is_super_admin() OR public.has_permission('manage_staff'));

-- ============================================================
-- PROFILES POLICY: block self-deactivation / self role change
-- ============================================================
DROP POLICY IF EXISTS "update_profiles" ON public.profiles;
CREATE POLICY "update_profiles" ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.has_permission('manage_staff')
    OR id = auth.uid()
  )
  WITH CHECK (
    -- Editors (super admin / manage_staff) may change anything.
    (public.is_super_admin() OR public.has_permission('manage_staff'))
    OR (
      -- Self-edits may not change role or is_active.
      id = auth.uid()
      AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
      AND is_active = (SELECT p.is_active FROM public.profiles p WHERE p.id = auth.uid())
    )
  );

-- ============================================================
-- GRANTS: PROFILES is_active column covered by existing table grants
-- ============================================================
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
