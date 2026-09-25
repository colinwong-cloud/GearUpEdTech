import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/mer/invoices/[id]/pdf": ["./src/lib/server/assets/gearup-stamp.png"],
    "/api/mer/invoices/[id]/send": ["./src/lib/server/assets/gearup-stamp.png"],
  },
  /*
   * Expose Supabase URL + anon key to the browser bundle when only server-prefixed
   * vars exist on Vercel (SUPABASE_URL / SUPABASE_ANON_KEY).
   * Never map service_role keys here — client must use anon key only.
   */
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      process.env.SUPABASE_URL?.replace(/\/$/, "").trim() ||
      "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
      process.env.SUPABASE_ANON_KEY?.trim() ||
      "",
  },
};

export default nextConfig;
