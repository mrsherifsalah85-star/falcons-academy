import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, Role } from '@/types';

const SUPER_ADMIN_EMAIL = 'mrsherifsalah85@gmail.com';

interface AuthContextType {
  profile: Profile | null;
  loading: boolean;
  hasPermission: (perm: string) => boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  profile: null,
  loading: true,
  hasPermission: () => false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const blockUnauthorized = async () => {
      await supabase.auth.signOut();
      if (mounted) {
        setProfile(null);
        setLoading(false);
      }
    };

    const loadProfile = async (userId: string, userEmail?: string) => {
      if (!userEmail) {
        await blockUnauthorized();
        return;
      }

      const normalizedEmail = userEmail.trim().toLowerCase();
      const isOwnerSuperAdmin = normalizedEmail === SUPER_ADMIN_EMAIL;

      let role: Role = isOwnerSuperAdmin ? 'super_admin' : 'teacher';
      let displayName = isOwnerSuperAdmin ? 'Sherif Salah' : normalizedEmail.split('@')[0];

      const { data: allowed, error: allowedError } = await supabase
        .from('authorized_users')
        .select('role, name, is_active')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (!mounted) return;

      if (!isOwnerSuperAdmin) {
        if (allowedError || !allowed || !allowed.is_active) {
          await blockUnauthorized();
          return;
        }
        role = (allowed.role as Role) || 'teacher';
        displayName = allowed.name || displayName;
      } else if (!allowedError && allowed) {
        if (allowed.is_active === false) {
          await blockUnauthorized();
          return;
        }
        role = (allowed.role as Role) || 'super_admin';
        displayName = allowed.name || displayName;
      }

      const fallbackProfile: Profile = {
        id: userId,
        email: normalizedEmail,
        role,
        display_name: displayName,
        permissions: {},
      } as Profile;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (!mounted) return;

        if (error || !data) {
          setProfile(fallbackProfile);
        } else {
          setProfile({
            ...fallbackProfile,
            ...(data as Profile),
            role,
            display_name: allowed?.name || (data as Profile).display_name || displayName,
            permissions: (data as Profile).permissions || {},
          });
        }
      } catch {
        if (mounted) {
          setProfile(fallbackProfile);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        loadProfile(session.user.id, session.user.email ?? undefined);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.user) {
        loadProfile(session.user.id, session.user.email ?? undefined);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const hasPermission = (perm: string): boolean => {
    if (!profile) return false;
    if (profile.role === 'super_admin') return true;
    if (profile.role === 'sub_admin') return !!profile.permissions?.[perm];
    return false;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ profile, loading, hasPermission, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export type { Role };
