import { defineConfig } from "@playwright/test";

const CI_ADMIN_USER = process.env.ADMIN_CONSOLE_USER || "ci-admin";
const CI_ADMIN_PASS = process.env.ADMIN_CONSOLE_PASS || "ci-pass";
const CI_ADMIN_SECRET =
  process.env.ADMIN_SESSION_SECRET || "ci-admin-session-secret-for-smoke-tests";

export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: {
    timeout: 8_000,
  },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
    url: "http://127.0.0.1:3000",
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      PORT: "3000",
      ADMIN_CONSOLE_USER: CI_ADMIN_USER,
      ADMIN_CONSOLE_PASS: CI_ADMIN_PASS,
      ADMIN_SESSION_SECRET: CI_ADMIN_SECRET,
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "smoke-test-anon-key",
      SUPABASE_URL: process.env.SUPABASE_URL || "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY:
        process.env.SUPABASE_SERVICE_ROLE_KEY || "smoke-test-service-role-key",
    },
  },
});
