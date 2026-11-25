import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import type { Profile, Role } from '@/types';

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

    const loadProfile = async (userId: string, userEmail?: string) => {
      if (!userEmail) {
        alert('Auth debug: no email on session');
        await supabase.auth.signOut();
        if (mounted) {
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      const normalizedEmail = userEmail.trim().toLowerCase();
      const { data: allowed, error: allowedError } = await supabase
        .from('authorized_users')
        .select('role, name, is_active')
        .eq('email', normalizedEmail)
        .maybeSingle();

      if (!mounted) return;

      if (allowedError || !allowed || !allowed.is_active) {
        alert(
          `Auth check failed for ${normalizedEmail}: ` +
            (allowedError ? allowedError.message : !allowed ? 'row not found in authorized_users' : 'is_active is false')
        );
        await supabase.auth.signOut();
        setProfile(null);
        setLoading(false);
        return;
      }

      const role = (allowed.role as Role) || 'super_admin';
      const displayName = allowed.name || normalizedEmail.split('@')[0];

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
            display_name: allowed.name || (data as Profile).display_name || displayName,
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
