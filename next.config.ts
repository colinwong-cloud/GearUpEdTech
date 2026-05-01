import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Ensure client bundles resolve Storage URLs when only SUPABASE_URL is set on Vercel */
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      process.env.SUPABASE_URL?.replace(/\/$/, "").trim() ||
      "",
  },
};

export default nextConfig;
