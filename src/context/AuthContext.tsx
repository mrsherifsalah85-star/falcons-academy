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

    const blockUnauthorized = async (userId?: string) => {
      await supabase.auth.signOut();
      if (mounted) {
        setProfile(null);
        setLoading(false);
      }
    };

    // The role always comes from authorized_users (matched case-insensitively),
    // never from the profiles row, so the allowlist is the single source of truth.
    const loadProfile = async (userId: string, userEmail?: string) => {
      let role: Role = 'teacher';
      let name = '';

      if (!userEmail) {
        await blockUnauthorized(userId);
        return;
      }

      const { data: allowed } = await supabase
        .from('authorized_users')
        .select('role, name, is_active')
        .eq('email', userEmail.toLowerCase())
        .maybeSingle();

      if (!allowed || !allowed.is_active) {
        await blockUnauthorized(userId);
        return;
      }
      role = allowed.role as Role;
      name = allowed.name || '';

      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!mounted) return;
      if (error || !data) {
        setLoading(false);
        return;
      }
      setProfile({
        ...(data as Profile),
        role: role,
        display_name: name || (data as Profile).display_name,
      });
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session) {
        loadProfile(session.user.id, session.user.email ?? undefined);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        if (session) {
          await loadProfile(session.user.id, session.user.email ?? undefined);
        } else {
          if (mounted) setProfile(null);
          setLoading(false);
        }
      })();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const hasPermission = (perm: string): boolean => {
    if (!profile) return false;
    if (profile.role === 'super_admin') return true;
    if (profile.role === 'sub_admin') return !!profile.permissions[perm];
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
