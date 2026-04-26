import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  serviceKey
);

function missingRpcError(e: { message: string } | null): boolean {
  if (!e) return false;
  const m = String(e.message).toLowerCase();
  return (
    m.includes("does not exist") ||
    m.includes("find the function") ||
    m.includes("schema cache")
  );
}

/**
 * `part` (optional) avoids PostgREST request timeout by running one heavy RPC per HTTP request:
 * - part=rank → student grade rankings
 * - part=grade → grade_averages (charts)
 * - part=all (default) → both; may time out on large DBs — use two Vercel crons with rank + grade
 */
export async function GET(req: NextRequest) {
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

  const client = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? supabaseAdmin
    : supabase;

  try {
    if (doRank) {
      const { error: rankErr } = await client.rpc("recalculate_student_grade_rankings");
      if (rankErr) {
        console.error("recalculate_student_grade_rankings error:", rankErr);
        return NextResponse.json({ error: rankErr.message, part: "rank" }, { status: 500 });
      }
    }
    if (doGrade) {
      const { error: clearE } = await client.rpc("clear_grade_averages");
      if (clearE && !missingRpcError(clearE)) {
        return NextResponse.json(
          { error: clearE.message, part: "grade" },
          { status: 500 }
        );
      }
      if (clearE) {
        const { error: monolith } = await client.rpc("recalculate_grade_averages");
        if (monolith) {
          return NextResponse.json(
            { error: monolith.message, part: "grade" },
            { status: 500 }
          );
        }
      } else {
        const { data: gradeLevels, error: gErr } = await client.rpc(
          "get_distinct_grade_levels"
        );
        if (gErr && !missingRpcError(gErr)) {
          return NextResponse.json(
            { error: gErr.message, part: "grade" },
            { status: 500 }
          );
        }
        if (gErr) {
          const { error: monolith } = await client.rpc("recalculate_grade_averages");
          if (monolith) {
            return NextResponse.json(
              { error: monolith.message, part: "grade" },
              { status: 500 }
            );
          }
        } else {
          for (const gl of (gradeLevels as string[] | null) ?? []) {
            const { error: oErr } = await client.rpc(
              "recalculate_grade_overall_for_grade",
              { p_grade_level: gl }
            );
            if (oErr) {
              if (missingRpcError(oErr)) {
                const { error: oneErr } = await client.rpc(
                  "recalculate_grade_averages_for_grade",
                  { p_grade_level: gl }
                );
                if (oneErr) {
                  return NextResponse.json(
                    { error: oneErr.message, part: "grade" },
                    { status: 500 }
                  );
                }
                continue;
              }
              return NextResponse.json(
                { error: oErr.message, part: "grade" },
                { status: 500 }
              );
            }
            const { data: typeList, error: tListErr } = await client.rpc(
              "get_question_types_for_grade",
              { p_grade_level: gl }
            );
            if (!tListErr) {
              for (const qt of (typeList as string[] | null) ?? []) {
                const { error: oneTErr } = await client.rpc(
                  "recalculate_grade_one_type_for_grade",
                  {
                    p_grade_level: gl,
                    p_question_type: qt,
                  }
                );
                if (oneTErr) {
                  if (missingRpcError(oneTErr)) {
                    const { error: tErr } = await client.rpc(
                      "recalculate_grade_by_type_for_grade",
                      { p_grade_level: gl }
                    );
                    if (tErr) {
                      return NextResponse.json(
                        { error: tErr.message, part: "grade" },
                        { status: 500 }
                      );
                    }
                    break;
                  }
                  return NextResponse.json(
                    { error: oneTErr.message, part: "grade" },
                    { status: 500 }
                  );
                }
              }
            } else {
              if (!missingRpcError(tListErr)) {
                return NextResponse.json(
                  { error: tListErr.message, part: "grade" },
                  { status: 500 }
                );
              }
              const { error: tErr } = await client.rpc(
                "recalculate_grade_by_type_for_grade",
                { p_grade_level: gl }
              );
              if (tErr) {
                if (missingRpcError(tErr)) {
                  return NextResponse.json(
                    {
                      part: "grade",
                      error:
                        "Run supabase_grade_by_question_type_fine.sql (or recalculate_grade_by_type still times out).",
                    },
                    { status: 500 }
                  );
                }
                return NextResponse.json(
                  { error: tErr.message, part: "grade" },
                  { status: 500 }
                );
              }
            }
          }
        }
      }
    }
    return NextResponse.json({
      success: true,
      part: part,
      calculated_at: new Date().toISOString(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
