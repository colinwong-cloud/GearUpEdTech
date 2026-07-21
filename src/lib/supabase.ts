import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const FALLBACK_SUPABASE_URL = "https://placeholder.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "placeholder-anon-key";

/** True when both URL and anon key are present in the client bundle (after next.config env bridge). */
export const isSupabaseBrowserConfigured = Boolean(supabaseUrl.trim() && supabaseAnonKey.trim());

// Keep build-time module evaluation safe in CI environments where Supabase env vars are absent.
// Runtime calls still rely on real env configuration to work correctly.
export const supabase = createClient(
  supabaseUrl.trim() || FALLBACK_SUPABASE_URL,
  supabaseAnonKey.trim() || FALLBACK_SUPABASE_ANON_KEY
);
