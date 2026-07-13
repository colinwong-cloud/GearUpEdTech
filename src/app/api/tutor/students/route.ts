import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTutorSession } from "@/lib/server/tutor-session";
import { computeTutorStudentHash, getTutorHashSecret } from "@/lib/server/tutor-student-hash";

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

function chunkArray<T>(values: T[], size: number): T[][] {
  if (!Number.isFinite(size) || size <= 0) return [values];
  const result: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    result.push(values.slice(i, i + size));
  }
  return result;
}

export async function GET(req: NextRequest) {
  const sessionRes = await requireTutorSession(req, { requirePasswordChanged: true });
  if (sessionRes.response || !sessionRes.profile) {
    return sessionRes.response ?? NextResponse.json({ error: "未登入導師帳戶" }, { status: 401 });
  }
  const profile = sessionRes.profile;

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "系統未配置 Supabase 管理金鑰。" }, { status: 503 });
  }

  const keyword = (req.nextUrl.searchParams.get("q") || "").trim();

  const usageRes = await admin
    .from("tutor_referral_usages")
    .select("mobile_number,used_at")
    .eq("code_id", profile.codeId)
    .order("used_at", { ascending: false })
    .limit(10000);
  if (usageRes.error) {
    return NextResponse.json({ error: usageRes.error.message || "無法載入學生清單。" }, { status: 500 });
  }

  const linkedAtByMobile = new Map<string, string>();
  for (const row of usageRes.data ?? []) {
    const mobile = String(row.mobile_number ?? "").trim();
    if (!mobile) continue;
    if (!linkedAtByMobile.has(mobile)) {
      linkedAtByMobile.set(mobile, row.used_at ? String(row.used_at) : "");
    }
  }

  const linkedMobiles = Array.from(linkedAtByMobile.keys())
    .filter((mobile) => (keyword ? mobile.includes(keyword) : true))
    .sort((a, b) => a.localeCompare(b));

  if (linkedMobiles.length === 0) {
    return NextResponse.json({ data: [] });
  }

  const parentIdByMobile = new Map<string, string>();
  const mobileByParentId = new Map<string, string>();
  for (const chunk of chunkArray(linkedMobiles, 500)) {
    const parentRes = await admin
      .from("parents")
      .select("id,mobile_number")
      .in("mobile_number", chunk)
      .limit(5000);
    if (parentRes.error) {
      return NextResponse.json(
        { error: parentRes.error.message || "無法讀取家長資料。" },
        { status: 500 }
      );
    }
    for (const parentRow of parentRes.data ?? []) {
      const parentId = String(parentRow.id ?? "").trim();
      const mobile = String(parentRow.mobile_number ?? "").trim();
      if (!parentId || !mobile) continue;
      parentIdByMobile.set(mobile, parentId);
      mobileByParentId.set(parentId, mobile);
    }
  }

  const parentIds = Array.from(mobileByParentId.keys());
  const studentIds: string[] = [];
  const parentIdByStudentId = new Map<string, string>();
  for (const chunk of chunkArray(parentIds, 500)) {
    const studentRes = await admin
      .from("students")
      .select("id,parent_id")
      .in("parent_id", chunk)
      .limit(10000);
    if (studentRes.error) {
      return NextResponse.json(
        { error: studentRes.error.message || "無法讀取學生資料。" },
        { status: 500 }
      );
    }
    for (const studentRow of studentRes.data ?? []) {
      const studentId = String(studentRow.id ?? "").trim();
      const parentId = String(studentRow.parent_id ?? "").trim();
      if (!studentId || !parentId) continue;
      studentIds.push(studentId);
      parentIdByStudentId.set(studentId, parentId);
    }
  }

  const lastPracticeByMobile = new Map<string, string>();
  for (const chunk of chunkArray(studentIds, 500)) {
    const sessionRes = await admin
      .from("quiz_sessions")
      .select("student_id,created_at")
      .in("student_id", chunk)
      .order("created_at", { ascending: false })
      .limit(20000);
    if (sessionRes.error) {
      return NextResponse.json(
        { error: sessionRes.error.message || "無法讀取練習紀錄。" },
        { status: 500 }
      );
    }
    for (const sessionRow of sessionRes.data ?? []) {
      const studentId = String(sessionRow.student_id ?? "").trim();
      const createdAt = String(sessionRow.created_at ?? "").trim();
      if (!studentId || !createdAt) continue;
      const parentId = parentIdByStudentId.get(studentId);
      if (!parentId) continue;
      const mobile = mobileByParentId.get(parentId);
      if (!mobile) continue;
      const existing = lastPracticeByMobile.get(mobile);
      if (!existing || new Date(createdAt).getTime() > new Date(existing).getTime()) {
        lastPracticeByMobile.set(mobile, createdAt);
      }
    }
  }

  const hashSecret = getTutorHashSecret();
  const rows = linkedMobiles.map((mobile) => ({
    registered_mobile: mobile,
    hash: computeTutorStudentHash(mobile, hashSecret),
    linked_at: linkedAtByMobile.get(mobile) || "",
    last_practice_at: lastPracticeByMobile.get(mobile) || null,
  }));

  return NextResponse.json({ data: rows });
}
