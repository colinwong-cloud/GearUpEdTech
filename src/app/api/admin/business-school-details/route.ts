import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminSession } from "@/lib/server/admin-session";

export const maxDuration = 120;

type SchoolDetailsRequest = {
  district?: string;
  school_id?: string | null;
};

function normalizeSchoolId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function POST(req: NextRequest) {
  if (!requireAdminSession(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { error: "Set SUPABASE_SERVICE_ROLE_KEY in Vercel" },
      { status: 503 }
    );
  }

  let body: SchoolDetailsRequest;
  try {
    body = (await req.json()) as SchoolDetailsRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const district = body.district?.trim() || "";
  const schoolId = normalizeSchoolId(body.school_id);
  if (!district) {
    return NextResponse.json({ error: "Missing district" }, { status: 400 });
  }

  const admin = createClient(url, key);
  const { data, error } = await admin.rpc("admin_business_school_details", {
    p_district: district,
    p_school_id: schoolId,
  });
  if (error) {
    if (/admin_business_school_details/i.test(error.message)) {
      return NextResponse.json(
        {
          error:
            "Missing SQL function admin_business_school_details. Please run supabase_admin_business_kpi_filter_first.sql in Supabase.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ data });
}
