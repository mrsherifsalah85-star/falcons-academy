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

    const blockUnauthorized = async (_userId?: string) => {
      await supabase.auth.signOut();
      if (mounted) {
        setProfile(null);
        setLoading(false);
      }
    };

    const loadProfile = async (userId: string, userEmail?: string) => {
      let role: Role = 'teacher';
      let name = '';

      if (!userEmail) {
        await blockUnauthorized(userId);
        return;
      }

      const { data: allowed, error: allowedError } = await supabase
        .from('authorized_users')
        .select('role, name, is_active')
        .eq('email', userEmail.toLowerCase())
        .maybeSingle();

      if (allowedError || !allowed || !allowed.is_active) {
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

      // Fallback profile if `profiles` table API is disabled or returns no row
      const fallbackProfile: Profile = {
        id: userId,
        email: userEmail,
        role,
        display_name: name || userEmail.split('@')[0],
        permissions: {},
      } as Profile;

      if (error || !data) {
        setProfile(fallbackProfile);
        setLoading(false);
        return;
      }

      setProfile({
        ...fallbackProfile,
        ...(data as Profile),
        role,
        display_name: name || (data as Profile).display_name || fallbackProfile.display_name,
        permissions: (data as Profile).permissions || {},
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
