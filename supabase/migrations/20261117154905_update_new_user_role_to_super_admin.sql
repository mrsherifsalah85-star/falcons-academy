/*
# Update auto-profile creation trigger — all new users become super_admin

## Changes
- Replaces the handle_new_user() trigger function so every newly registered user
  is assigned the 'super_admin' role (previously only the first user got it).
- Ensures the admin dashboard and staff management are fully accessible to all
  signed-up users.

## Security
- No structural schema changes; only the trigger function body is replaced.
- RLS policies remain unchanged.
*/

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
    'super_admin'
  );
  RETURN NEW;
END;
$$;
