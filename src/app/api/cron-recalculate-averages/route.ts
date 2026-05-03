import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 300;

function getSupabaseClients() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim() ||
    "";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    "";
  if (!url || !anonKey) return null;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || anonKey;
  return {
    supabase: createClient(url, anonKey),
    supabaseAdmin: createClient(url, serviceKey),
  };
}

function missingRpcError(e: { message: string } | null | undefined): boolean {
  if (!e) return false;
  const m = String(e.message).toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("find the function") ||
    m.includes("schema cache")
  );
}

/** PostgREST can cancel the statement before the function’s SET LOCAL timeout takes effect. */
function isStatementTimeout(
  e: { message: string } | null | undefined
): boolean {
  if (!e) return false;
  return /canceling statement|statement timeout|query canceled|57014|timeout/i.test(
    String(e.message)
  );
}

type Rpc = SupabaseClient;

type RecomputeError = { message: string; isTimeout: boolean };
type RecomputeResult = { ok: true } | { ok: false; err: RecomputeError };

/**
 * Recompute all grade_averages rows for one `grade_level` (multiple RPC calls).
 * On timeout, falls back to `recalculate_grade_by_type_for_grade` only after
 * `delete_grade_averages_for_grade` when available (avoids unique violations).
 */
async function recomputeOneGrade(client: Rpc, gl: string): Promise<RecomputeResult> {
  const { error: oErr } = await client.rpc("recalculate_grade_overall_for_grade", {
    p_grade_level: gl,
  });
  if (oErr) {
    if (missingRpcError(oErr) || isStatementTimeout(oErr)) {
      const { error: fe } = await client.rpc("recalculate_grade_averages_for_grade", {
        p_grade_level: gl,
      });
      if (fe) {
        return {
          ok: false,
          err: { message: fe.message, isTimeout: isStatementTimeout(fe) },
        };
      }
      return { ok: true };
    }
    return { ok: false, err: { message: oErr.message, isTimeout: false } };
  }

  const { data: typeList, error: tListErr } = await client.rpc("get_question_types_for_grade", {
    p_grade_level: gl,
  });
  if (tListErr) {
    if (missingRpcError(tListErr) || isStatementTimeout(tListErr)) {
      const { error: tErr } = await client.rpc("recalculate_grade_by_type_for_grade", {
        p_grade_level: gl,
      });
      if (tErr) {
        return { ok: false, err: { message: tErr.message, isTimeout: isStatementTimeout(tErr) } };
      }
    } else {
      return { ok: false, err: { message: tListErr.message, isTimeout: false } };
    }
    return { ok: true };
  }

  for (const qt of (typeList as string[] | null) ?? []) {
    const { error: oneTErr } = await client.rpc("recalculate_grade_one_type_for_grade", {
      p_grade_level: gl,
      p_question_type: qt,
    });
    if (!oneTErr) continue;

    if (missingRpcError(oneTErr) || isStatementTimeout(oneTErr)) {
      const { error: dErr } = await client.rpc("delete_grade_averages_for_grade", {
        p_grade_level: gl,
      });
      if (dErr && !missingRpcError(dErr) && !isStatementTimeout(dErr)) {
        return { ok: false, err: { message: dErr.message, isTimeout: false } };
      }
      const { error: tErr } = await client.rpc("recalculate_grade_by_type_for_grade", {
        p_grade_level: gl,
      });
      if (tErr) {
        return { ok: false, err: { message: tErr.message, isTimeout: isStatementTimeout(tErr) } };
      }
      break;
    }
    return { ok: false, err: { message: oneTErr.message, isTimeout: isStatementTimeout(oneTErr) } };
  }

  return { ok: true };
}

/**
 * `part` (optional) avoids huge single-RPC work:
 * - part=rank → `recalculate_student_grade_rankings`
 * - part=grade → `clear` + per-grade recompute
 * - part=all → both (can hit DB limits; prefer two crons: rank + grade)
 */
export async function GET(req: NextRequest) {
  const clients = getSupabaseClients();
  if (!clients) {
    return NextResponse.json(
      { error: "Supabase env not configured" },
      { status: 503 }
    );
  }
  const { supabase, supabaseAdmin } = clients;

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const part = (req.nextUrl.searchParams.get("part") || "all").toLowerCase();
  const doRank = part === "all" || part === "rank";
  const doGrade = part === "all" || part === "grade";
  if (part !== "all" && part !== "rank" && part !== "grade") {
    return NextResponse.json(
      { error: "Invalid part. Use rank, grade, or all" },
      { status: 400 }
    );
  }

  const useService = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const client: Rpc = useService ? supabaseAdmin : supabase;
  if (!useService) {
    console.warn(
      "cron: SUPABASE_SERVICE_ROLE_KEY not set; using anon key. Add service role in Vercel for more reliable long RPCs."
    );
  }

  try {
    if (doRank) {
      const { error: rankErr } = await client.rpc("recalculate_student_grade_rankings");
      if (rankErr) {
        if (isStatementTimeout(rankErr)) {
          return NextResponse.json(
            {
              part: "rank",
              error: rankErr.message,
              hint: "Set SUPABASE_SERVICE_ROLE_KEY in Vercel, or run recalculate_student_grade_rankings() in Supabase SQL. Ensure supabase_optimize_ranking_batch_performance.sql is applied.",
            },
            { status: 503 }
          );
        }
        console.error("recalculate_student_grade_rankings:", rankErr);
        return NextResponse.json({ part: "rank", error: rankErr.message }, { status: 500 });
      }
    }

    if (doGrade) {
      const { error: clearE } = await client.rpc("clear_grade_averages");
      if (clearE) {
        if (missingRpcError(clearE) || isStatementTimeout(clearE)) {
          const { error: monolith } = await client.rpc("recalculate_grade_averages");
          if (monolith) {
            return NextResponse.json(
              {
                part: "grade",
                error: monolith.message,
                hint: useService
                  ? "Run recalculate_grade_averages() in Supabase SQL, or apply the grade script chain in README (split, two_step, by_question_type_fine, v2, delete_and_grants)."
                  : "Set SUPABASE_SERVICE_ROLE_KEY in Vercel and re-run, or run recalculate_grade_averages() in SQL.",
              },
              { status: isStatementTimeout({ message: monolith.message }) ? 503 : 500 }
            );
          }
        } else {
          return NextResponse.json({ part: "grade", error: clearE.message }, { status: 500 });
        }
      } else {
        const { data: gradeLevels, error: gErr } = await client.rpc("get_distinct_grade_levels");
        if (gErr) {
          if (missingRpcError(gErr) || isStatementTimeout(gErr)) {
            const { error: monolith } = await client.rpc("recalculate_grade_averages");
            if (monolith) {
              return NextResponse.json(
                { part: "grade", error: monolith.message },
                { status: 500 }
              );
            }
          } else {
            return NextResponse.json({ part: "grade", error: gErr.message }, { status: 500 });
          }
        } else {
          for (const gl of (gradeLevels as string[] | null) ?? []) {
            const gRes = await recomputeOneGrade(client, gl);
            if (gRes.ok) continue;
            return NextResponse.json(
              {
                part: "grade",
                error: gRes.err.message,
                grade_level: gl,
                hint: gRes.err.isTimeout
                  ? "PostgREST/statement timeout. Set SUPABASE_SERVICE_ROLE_KEY, run supabase_grade_cron_v2_query_plans.sql and supabase_grade_cron_delete_and_grants.sql, or run recalculate_grade_averages() in Supabase SQL."
                  : undefined,
              },
              { status: gRes.err.isTimeout ? 503 : 500 }
            );
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      part,
      use_service_role: useService,
      calculated_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
