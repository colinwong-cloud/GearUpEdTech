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
      const { error: gradeErr } = await client.rpc("recalculate_grade_averages");
      if (gradeErr) {
        console.error("recalculate_grade_averages error:", gradeErr);
        return NextResponse.json({ error: gradeErr.message, part: "grade" }, { status: 500 });
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
