import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { KeyRound, Loader2, LogIn, ShieldAlert, UserPlus } from 'lucide-react';

const NOT_AUTHORIZED_MSG = 'This email is not authorized. Please contact the academy administrator.';

type Mode = 'signin' | 'setup';

export function Login() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setPassword('');
    setConfirmPassword('');
  };

  const checkAuthorized = async (): Promise<boolean> => {
    const { data, error } = await supabase.rpc('is_email_authorized', { check_email: email.trim() });
    if (error) {
      setError('Could not verify this email. Please try again.');
      return false;
    }
    if (!data) {
      setError(NOT_AUTHORIZED_MSG);
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim().toLowerCase();

    if (mode === 'setup' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (signInError) {
          setError(signInError.message === 'Invalid login credentials'
            ? 'Incorrect email or password.'
            : signInError.message);
          return;
        }
      } else {
        if (!(await checkAuthorized())) return;

        // First-time setup: sign the user up with their chosen password.
        // Supabase only creates the account if the email is on the allowlist
        // (enforced again by the database trigger), and confirmations are off,
        // so the user is signed in immediately.
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (signUpError) {
          if (signUpError.message.includes('already registered')) {
            setError('This email already has a password. Use Sign In instead.');
          } else {
            setError(signUpError.message);
          }
          return;
        }
        if (!signUpData.session) {
          setError(NOT_AUTHORIZED_MSG);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-28 h-28 rounded-2xl bg-white mb-4 shadow-lg shadow-black/20 overflow-hidden">
            <img src="/IMG-20261118-WA0043.jpg" alt="Falcons Academy logo" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-white">Falcons Academy</h1>
          <p className="text-slate-400 mt-2">Management System</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="flex gap-1 mb-6 bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => switchMode('signin')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                mode === 'signin' ? 'bg-white shadow text-slate-900' : 'text-slate-500'
              }`}
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
            <button
              onClick={() => switchMode('setup')}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
                mode === 'setup' ? 'bg-white shadow text-slate-900' : 'text-slate-500'
              }`}
            >
              <KeyRound className="w-4 h-4" />
              First-Time Setup
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                placeholder="you@academy.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {mode === 'setup' ? 'Create Password' : 'Password'}
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
            {mode === 'setup' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Confirm Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                  placeholder="••••••••"
                />
              </div>
            )}

            {error && (
              <div className="text-sm text-red-600 bg-red-50 rounded-lg p-3 border border-red-200 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all disabled:opacity-60 flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'signin' ? <LogIn className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {mode === 'signin' ? 'Sign In' : 'Set My Password'}
            </button>
          </form>

          <p className="text-xs text-slate-400 text-center mt-6">
            {mode === 'signin'
              ? 'Access is limited to authorized academy staff.'
              : 'Only emails pre-approved by the academy administrator can set a password.'}
          </p>
        </div>
      </div>
    </div>
  );
}
