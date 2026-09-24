import { createClient } from "@supabase/supabase-js";
import {
  isMissingCronRunTableError,
  shouldStartMitSweep,
} from "@/lib/server/recurring-mit-cron";

function cronHost(): string {
  return (process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "")
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

export async function triggerDueMitSweep(source: string): Promise<{
  started: boolean;
  reason: string;
}> {
  const secret = process.env.CRON_SECRET?.trim() || "";
  const host = cronHost();
  if (!secret || !host) {
    return { started: false, reason: "missing-cron-env" };
  }

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (supabaseUrl && serviceRole) {
    const supabase = createClient(supabaseUrl, serviceRole);
    const { data, error } = await supabase
      .from("recurring_cron_runs")
      .select("started_at")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error && !isMissingCronRunTableError(error.message || "")) {
      console.error(
        "[anti-missing][payment][mit-cron] sweep-throttle-failed",
        JSON.stringify({ source, message: error.message })
      );
    } else if (!error && !shouldStartMitSweep(data?.started_at)) {
      return { started: false, reason: "recent-run" };
    }
  }

  console.info(
    "[anti-missing][payment][mit-cron] admin-sweep-start",
    JSON.stringify({ source })
  );
  const res = await fetch(`https://${host}/api/cron-recurring-payments`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${secret}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let processed: number | null = null;
  let paid: number | null = null;
  let failed: number | null = null;
  try {
    const json = JSON.parse(text) as {
      processed?: number;
      paid?: number;
      failed?: number;
    };
    processed = typeof json.processed === "number" ? json.processed : null;
    paid = typeof json.paid === "number" ? json.paid : null;
    failed = typeof json.failed === "number" ? json.failed : null;
  } catch {
    processed = null;
  }
  console.info(
    "[anti-missing][payment][mit-cron] admin-sweep-finished",
    JSON.stringify({ source, status: res.status, processed, paid, failed })
  );
  return { started: res.ok, reason: res.ok ? "ok" : `http-${res.status}` };
}
