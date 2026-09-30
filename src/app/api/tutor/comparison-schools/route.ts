import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireTutorSession } from "@/lib/server/tutor-session";

export const dynamic = "force-dynamic";

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

export async function GET(req: NextRequest) {
  const sessionRes = await requireTutorSession(req, { requirePasswordChanged: true });
  if (sessionRes.response || !sessionRes.profile) {
    return sessionRes.response ?? NextResponse.json({ error: "未登入導師帳戶" }, { status: 401 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "系統未配置 Supabase 管理金鑰。" }, { status: 503 });
  }
  const schoolRes = await admin
    .from("schools")
    .select("id,area,district,name_zh,name_en")
    .order("area", { ascending: true })
    .order("district", { ascending: true })
    .order("name_zh", { ascending: true })
    .limit(5000);
  if (schoolRes.error) {
    return NextResponse.json({ error: schoolRes.error.message || "無法讀取學校。" }, { status: 500 });
  }
  const schools = (schoolRes.data ?? []).map((row) => ({
    id: String(row.id ?? ""),
    area: String(row.area ?? "").trim(),
    district: String(row.district ?? "").trim(),
    name: String(row.name_zh ?? "").trim() || String(row.name_en ?? "").trim(),
  }));
  return NextResponse.json({ data: { schools } });
}
