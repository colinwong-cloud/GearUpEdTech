import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { genderFromAvatarStyle } from "@/lib/student-gender";

type RegisterBody = {
  mobile?: string;
  studentName?: string;
  pinCode?: string;
  avatarStyle?: string;
  gradeLevel?: string;
  email?: string;
  schoolId?: string | null;
  referralCode?: string | null;
};

type RegisteredStudent = {
  id: string;
  parent_id: string;
  student_name: string;
  avatar_style: string;
  grade_level: string;
  created_at: string;
  gender?: string | null;
};

type ReferralCodeRow = {
  id: string;
  code: string;
  tutor_name: string;
  tutor_mobile: string | null;
  tutor_email: string | null;
  usage_limit: number;
  current_uses: number;
  is_active: boolean;
};

type ConsumedReferralUsage = {
  codeId: string;
  mobile: string;
};

type ReferralDb = {
  public: {
    Tables: {
      tutor_referral_codes: {
        Row: {
          id: string;
          code: string;
          tutor_name: string;
          tutor_mobile: string | null;
          tutor_email: string | null;
          usage_limit: number;
          current_uses: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          tutor_name: string;
          tutor_mobile?: string | null;
          tutor_email?: string | null;
          usage_limit?: number;
          current_uses?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          code?: string;
          tutor_name?: string;
          tutor_mobile?: string | null;
          tutor_email?: string | null;
          usage_limit?: number;
          current_uses?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tutor_referral_usages: {
        Row: {
          id: string;
          code_id: string;
          code: string;
          tutor_name: string;
          tutor_mobile: string | null;
          tutor_email: string | null;
          mobile_number: string;
          parent_id: string | null;
          used_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          code_id: string;
          code: string;
          tutor_name: string;
          tutor_mobile?: string | null;
          tutor_email?: string | null;
          mobile_number: string;
          parent_id?: string | null;
          used_at?: string;
          created_at?: string;
        };
        Update: {
          code_id?: string;
          code?: string;
          tutor_name?: string;
          tutor_mobile?: string | null;
          tutor_email?: string | null;
          mobile_number?: string;
          parent_id?: string | null;
          used_at?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type ReferralAdminClient = ReturnType<typeof createClient<ReferralDb>>;
type AdminClient = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

const REFERRAL_CODE_RE = /^\d{6}$/;
const REFERRAL_INVALID_ERROR = "錯誤編號";
const REFERRAL_LIMIT_ERROR = "編號被限，請負責老師聯絡管理員更新編號。";
const REFERRAL_TABLE_HINT =
  "缺少教師編號資料欄位，請先在 Supabase 執行 supabase_tutor_referral_contact_fields.sql（或最新版 supabase_tutor_referral_codes.sql）。";

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
}

function isValidMobile(mobile: string): boolean {
  return /^\d{8}$/.test(mobile) && !mobile.startsWith("999");
}

function isValidPin(pinCode: string): boolean {
  return /^[A-Za-z0-9]{6}$/.test(pinCode);
}

function isValidGrade(gradeLevel: string): boolean {
  return ["P1", "P2", "P3", "P4", "P5", "P6"].includes(gradeLevel);
}

function asReferralAdminClient(admin: AdminClient): ReferralAdminClient {
  return admin as unknown as ReferralAdminClient;
}

function isMissingReferralTableError(message: string): boolean {
  return /tutor_referral_codes|tutor_referral_usages|tutor_mobile|tutor_email|42P01|42703|does not exist/i.test(
    message
  );
}

function asReferralCodeRow(value: unknown): ReferralCodeRow | null {
  const row = value as Partial<ReferralCodeRow> | null;
  if (!row?.id || !row.code) return null;
  return {
    id: String(row.id),
    code: String(row.code),
    tutor_name: String(row.tutor_name ?? ""),
    tutor_mobile: row.tutor_mobile == null ? null : String(row.tutor_mobile),
    tutor_email: row.tutor_email == null ? null : String(row.tutor_email),
    usage_limit: Number(row.usage_limit ?? 50),
    current_uses: Number(row.current_uses ?? 0),
    is_active: Boolean(row.is_active),
  };
}

async function syncReferralUsageCount({
  admin,
  codeId,
}: {
  admin: AdminClient;
  codeId: string;
}): Promise<void> {
  const referralAdmin = asReferralAdminClient(admin);
  const usageCountRes = await referralAdmin
    .from("tutor_referral_usages")
    .select("id", { count: "exact", head: true })
    .eq("code_id", codeId);
  if (usageCountRes.error) {
    if (isMissingReferralTableError(usageCountRes.error.message || "")) {
      throw new Error(REFERRAL_TABLE_HINT);
    }
    throw usageCountRes.error;
  }

  const usageCount = Number(usageCountRes.count ?? 0);
  const { error: syncErr } = await referralAdmin
    .from("tutor_referral_codes")
    .update({
      current_uses: usageCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", codeId);
  if (syncErr) {
    if (isMissingReferralTableError(syncErr.message || "")) {
      throw new Error(REFERRAL_TABLE_HINT);
    }
    throw syncErr;
  }
}

async function rollbackConsumedReferral({
  admin,
  consumed,
}: {
  admin: AdminClient;
  consumed: ConsumedReferralUsage;
}) {
  const referralAdmin = asReferralAdminClient(admin);
  const { error: deleteUsageErr } = await referralAdmin
    .from("tutor_referral_usages")
    .delete()
    .eq("code_id", consumed.codeId)
    .eq("mobile_number", consumed.mobile);
  if (deleteUsageErr && !isMissingReferralTableError(deleteUsageErr.message || "")) {
    throw deleteUsageErr;
  }
  await syncReferralUsageCount({ admin, codeId: consumed.codeId });
}

async function consumeReferralUsage({
  admin,
  code,
  mobile,
}: {
  admin: AdminClient;
  code: string;
  mobile: string;
}): Promise<{ consumed: ConsumedReferralUsage | null; error: string | null }> {
  const referralAdmin = asReferralAdminClient(admin);
  const codeRes = await referralAdmin
    .from("tutor_referral_codes")
    .select("id,code,tutor_name,tutor_mobile,tutor_email,usage_limit,current_uses,is_active")
    .eq("code", code)
    .maybeSingle();
  if (codeRes.error) {
    if (isMissingReferralTableError(codeRes.error.message || "")) {
      return { consumed: null, error: REFERRAL_TABLE_HINT };
    }
    throw codeRes.error;
  }

  const referralCode = asReferralCodeRow(codeRes.data);
  if (!referralCode || !referralCode.is_active) {
    return { consumed: null, error: REFERRAL_INVALID_ERROR };
  }
  if (referralCode.current_uses >= referralCode.usage_limit) {
    return { consumed: null, error: REFERRAL_LIMIT_ERROR };
  }

  let current = referralCode.current_uses;
  let reserved = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const nextUses = current + 1;
    const reserveRes = await referralAdmin
      .from("tutor_referral_codes")
      .update({
        current_uses: nextUses,
        updated_at: new Date().toISOString(),
      })
      .eq("id", referralCode.id)
      .eq("current_uses", current)
      .lt("current_uses", referralCode.usage_limit)
      .select("id,current_uses")
      .limit(1);
    if (reserveRes.error) {
      if (isMissingReferralTableError(reserveRes.error.message || "")) {
        return { consumed: null, error: REFERRAL_TABLE_HINT };
      }
      throw reserveRes.error;
    }
    if ((reserveRes.data ?? []).length > 0) {
      reserved = true;
      break;
    }

    const retryRes = await referralAdmin
      .from("tutor_referral_codes")
      .select("id,current_uses,usage_limit,is_active")
      .eq("id", referralCode.id)
      .maybeSingle();
    if (retryRes.error) {
      if (isMissingReferralTableError(retryRes.error.message || "")) {
        return { consumed: null, error: REFERRAL_TABLE_HINT };
      }
      throw retryRes.error;
    }
    const retryRow = retryRes.data as {
      current_uses?: number;
      usage_limit?: number;
      is_active?: boolean;
    } | null;
    if (!retryRow || !retryRow.is_active) {
      return { consumed: null, error: REFERRAL_INVALID_ERROR };
    }
    current = Number(retryRow.current_uses ?? current);
    const usageLimit = Number(retryRow.usage_limit ?? referralCode.usage_limit);
    if (current >= usageLimit) {
      return { consumed: null, error: REFERRAL_LIMIT_ERROR };
    }
  }
  if (!reserved) {
    return { consumed: null, error: REFERRAL_LIMIT_ERROR };
  }

  const usageInsertRes = await referralAdmin.from("tutor_referral_usages").insert({
    code_id: referralCode.id,
    code: referralCode.code,
    tutor_name: referralCode.tutor_name,
    tutor_mobile: referralCode.tutor_mobile,
    tutor_email: referralCode.tutor_email,
    mobile_number: mobile,
    used_at: new Date().toISOString(),
  });
  if (usageInsertRes.error) {
    await syncReferralUsageCount({ admin, codeId: referralCode.id });
    const insertErr = usageInsertRes.error.message || "";
    if (/duplicate key|unique/i.test(insertErr)) {
      return { consumed: null, error: "此電話已使用教師編號。" };
    }
    if (isMissingReferralTableError(insertErr)) {
      return { consumed: null, error: REFERRAL_TABLE_HINT };
    }
    throw usageInsertRes.error;
  }

  return {
    consumed: {
      codeId: referralCode.id,
      mobile,
    },
    error: null,
  };
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: "Set SUPABASE_SERVICE_ROLE_KEY in Vercel" },
      { status: 503 }
    );
  }

  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mobile = body.mobile?.trim() ?? "";
  const studentName = body.studentName?.trim() ?? "";
  const pinCode = body.pinCode?.trim() ?? "";
  const avatarStyle = body.avatarStyle?.trim() ?? "";
  const gradeLevel = body.gradeLevel?.trim() ?? "";
  const email = body.email?.trim() ?? "";
  const schoolId = body.schoolId ?? null;
  const referralCodeInput = body.referralCode?.trim() ?? "";
  const gender = genderFromAvatarStyle(avatarStyle);

  if (!isValidMobile(mobile)) {
    return NextResponse.json({ error: "請輸入有效的8位香港手提電話號碼。" }, { status: 400 });
  }
  if (!studentName) {
    return NextResponse.json({ error: "請輸入學生姓名。" }, { status: 400 });
  }
  if (!isValidPin(pinCode)) {
    return NextResponse.json({ error: "請輸入6位英文字母或數字密碼。" }, { status: 400 });
  }
  if (!gender) {
    return NextResponse.json({ error: "請選擇學生性別（男生或女生）。" }, { status: 400 });
  }
  if (!isValidGrade(gradeLevel)) {
    return NextResponse.json({ error: "請選擇學生年級。" }, { status: 400 });
  }
  if (!schoolId) {
    return NextResponse.json({ error: "請選擇學校。" }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json({ error: "請輸入電郵地址。" }, { status: 400 });
  }
  if (referralCodeInput && !REFERRAL_CODE_RE.test(referralCodeInput)) {
    return NextResponse.json({ error: REFERRAL_INVALID_ERROR }, { status: 400 });
  }

  const normalizedReferralCode = referralCodeInput || null;
  const existingParentRes = await admin
    .from("parents")
    .select("id")
    .eq("mobile_number", mobile)
    .maybeSingle();
  if (existingParentRes.error) {
    return NextResponse.json(
      { error: existingParentRes.error.message || "註冊失敗，請重試。" },
      { status: 500 }
    );
  }
  const parentAlreadyExists = Boolean(existingParentRes.data?.id);
  let consumedReferral: ConsumedReferralUsage | null = null;

  if (normalizedReferralCode && !parentAlreadyExists) {
    try {
      const consumeResult = await consumeReferralUsage({
        admin,
        code: normalizedReferralCode,
        mobile,
      });
      if (consumeResult.error) {
        const status = consumeResult.error === REFERRAL_TABLE_HINT ? 500 : 400;
        return NextResponse.json({ error: consumeResult.error }, { status });
      }
      consumedReferral = consumeResult.consumed;
    } catch (consumeErr) {
      const message =
        consumeErr instanceof Error ? consumeErr.message : "註冊失敗，請重試。";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const { data, error: registerError } = await admin.rpc("register_student", {
    p_mobile_number: mobile,
    p_student_name: studentName,
    p_pin_code: pinCode,
    p_avatar_style: avatarStyle,
    p_grade_level: gradeLevel,
    p_email: email,
    p_school_id: schoolId,
  });
  if (registerError) {
    if (consumedReferral) {
      try {
        await rollbackConsumedReferral({ admin, consumed: consumedReferral });
      } catch {
        // best-effort rollback; keep original registration error for end user.
      }
    }
    return NextResponse.json(
      { error: registerError.message || "註冊失敗，請重試。" },
      { status: 400 }
    );
  }

  const student = data as RegisteredStudent;
  if (!student?.id) {
    if (consumedReferral) {
      try {
        await rollbackConsumedReferral({ admin, consumed: consumedReferral });
      } catch {
        // best-effort rollback; keep original error for end user.
      }
    }
    return NextResponse.json({ error: "註冊回應無效，請重試。" }, { status: 500 });
  }

  const { error: updateError } = await admin
    .from("students")
    .update({ gender })
    .eq("id", student.id);
  if (updateError) {
    if (consumedReferral) {
      try {
        await rollbackConsumedReferral({ admin, consumed: consumedReferral });
      } catch {
        // best-effort rollback; keep original error for end user.
      }
    }
    return NextResponse.json(
      { error: `註冊成功但性別儲存失敗：${updateError.message}` },
      { status: 500 }
    );
  }

  if (consumedReferral) {
    const referralAdmin = asReferralAdminClient(admin);
    const { error: linkUsageErr } = await referralAdmin
      .from("tutor_referral_usages")
      .update({
        parent_id: student.parent_id,
      })
      .eq("code_id", consumedReferral.codeId)
      .eq("mobile_number", mobile);
    if (linkUsageErr && !isMissingReferralTableError(linkUsageErr.message || "")) {
      // Registration succeeded; usage-parent linkage is best effort.
      console.error("Failed to link referral usage to parent:", linkUsageErr.message);
    }
  }

  return NextResponse.json({
    student: {
      ...student,
      gender,
    },
  });
}
