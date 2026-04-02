import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "evaluating-ireland-headlines-sunny.trycloudflare.com",
    "*.trycloudflare.com",
  ],
};

export default nextConfig;
