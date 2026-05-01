import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** True when both URL and anon key are present in the client bundle (after next.config env bridge). */
export const isSupabaseBrowserConfigured = Boolean(supabaseUrl.trim() && supabaseAnonKey.trim());

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
