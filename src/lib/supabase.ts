import { createBrowserClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

function isValidUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

// Browser client for client components (with auth cookie support)
export function createSupabaseBrowserClient() {
  if (!isValidUrl(supabaseUrl)) {
    console.warn('[Supabase] NEXT_PUBLIC_SUPABASE_URL is not configured — browser client will return empty data. Set it in .env.local');
    return createBrowserClient('https://placeholder.supabase.co', 'placeholder');
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// Lazy singleton for legacy usage
let _supabase: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (!_supabase) {
    if (!isValidUrl(supabaseUrl)) {
      console.warn('[Supabase] NEXT_PUBLIC_SUPABASE_URL is not configured — getSupabase() will return empty data. Set it in .env.local');
      _supabase = createClient('https://placeholder.supabase.co', 'placeholder');
    } else {
      _supabase = createClient(supabaseUrl, supabaseAnonKey);
    }
  }
  return _supabase;
}

// Backward-compatible export (lazy)
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    return Reflect.get(getSupabase(), prop);
  },
});

// Server-side client with service role for admin operations (bypasses RLS)
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!isValidUrl(url)) {
    console.warn('[Supabase] NEXT_PUBLIC_SUPABASE_URL is not configured — service role client will return empty data. Set it in .env.local');
    return createClient('https://placeholder.supabase.co', 'placeholder');
  }
  return createClient(url, key);
}
