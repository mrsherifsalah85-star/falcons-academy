import { createClient } from '@supabase/supabase-js';

// This app connects EXCLUSIVELY to the academy's own Supabase project.
// These values are the single connection target; env vars only override them.
const SUPABASE_URL = 'https://ybzzitagygjsocgxmhut.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_P7wq9dWH3gibZTPn42LpwA_JM0f0bOY';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and publishable key are required.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
