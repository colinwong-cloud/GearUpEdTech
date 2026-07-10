import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  usage_limit: number;
  current_uses: number;
  is_active: boolean;
};

type ConsumedReferralUsage = {
  codeId: string;
  mobile: string;
};

type Database = {
  public: {
    Tables: {
      parents: {
        Row: { id: string; mobile_number: string | null; email: string | null };
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
        Relationships: [];
      };
      students: {
        Row: {
          id: string;
          parent_id: string;
          student_name: string;
          avatar_style: string;
          grade_level: string;
          created_at: string;
          gender: string | null;
        };
        Insert: Record<string, unknown>;
        Update: { gender?: "M" | "F" | null };
        Relationships: [];
      };
      tutor_referral_codes: {
        Row: {
          id: string;
          code: string;
          tutor_name: string;
          usage_limit: number;
          current_uses: number;
          is_active: boolean;
          updated_at: string;
        };
        Insert: Record<string, unknown>;
        Update: {
          current_uses?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      tutor_referral_usages: {
        Row: {
          code_id: string;
          mobile_number: string;
          parent_id: string | null;
        };
        Insert: {
          code_id: string;
          code: string;
          tutor_name: string;
          mobile_number: string;
          used_at: string;
        };
        Update: { parent_id?: string | null };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      register_student: {
        Args: {
          p_mobile_number: string;
          p_student_name: string;
          p_pin_code: string;
          p_avatar_style: string;
          p_grade_level: string;
          p_email: string;
          p_school_id: string | null;
        };
        Returns: RegisteredStudent;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

type AdminClient = SupabaseClient<Database>;

const REFERRAL_CODE_RE = /^\d{6}$/;
const REFERRAL_INVALID_ERROR = "錯誤編號";
const REFERRAL_LIMIT_ERROR = "編號被限，請負責老師聯絡管理員更新編號。";
const REFERRAL_TABLE_HINT =
  "缺少教師編號資料表，請先在 Supabase 執行 supabase_tutor_referral_codes.sql。";

function genderFromAvatarStyle(avatarStyle: string): "M" | "F" | null {
  const normalized = avatarStyle.trim().toLowerCase();
  if (normalized === "boy") return "M";
  if (normalized === "girl") return "F";
  return null;
}

function getSupabaseAdmin(): AdminClient | null {
  const url =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient<Database>(url, serviceRole);
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

function isMissingReferralTableError(message: string): boolean {
  return /tutor_referral_codes|tutor_referral_usages|42P01|does not exist/i.test(message);
}

function isMissingGenderColumnError(message: string): boolean {
  return /column .*gender.* does not exist|42703/i.test(message);
}

function asReferralCodeRow(value: unknown): ReferralCodeRow | null {
  const row = value as Partial<ReferralCodeRow> | null;
  if (!row?.id || !row.code) return null;
  return {
    id: String(row.id),
    code: String(row.code),
    tutor_name: String(row.tutor_name ?? ""),
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
  const usageCountRes = await admin
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
  const { error: syncErr } = await admin
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
  const { error: deleteUsageErr } = await admin
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
  const codeRes = await admin
    .from("tutor_referral_codes")
    .select("id,code,tutor_name,usage_limit,current_uses,is_active")
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
    const reserveRes = await admin
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

    const retryRes = await admin
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

  const usageInsertRes = await admin.from("tutor_referral_usages").insert({
    code_id: referralCode.id,
    code: referralCode.code,
    tutor_name: referralCode.tutor_name,
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
      const message = consumeErr instanceof Error ? consumeErr.message : "註冊失敗，請重試。";
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
        // Best-effort rollback; preserve original registration error.
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
        // Best-effort rollback; preserve original error.
      }
    }
    return NextResponse.json({ error: "註冊回應無效，請重試。" }, { status: 500 });
  }

  const { error: updateError } = await admin.from("students").update({ gender }).eq("id", student.id);
  if (updateError && !isMissingGenderColumnError(updateError.message || "")) {
    if (consumedReferral) {
      try {
        await rollbackConsumedReferral({ admin, consumed: consumedReferral });
      } catch {
        // Best-effort rollback; preserve original error.
      }
    }
    return NextResponse.json(
      { error: `註冊成功但性別儲存失敗：${updateError.message}` },
      { status: 500 }
    );
  }

  if (consumedReferral) {
    const { error: linkUsageErr } = await admin
      .from("tutor_referral_usages")
      .update({
        parent_id: student.parent_id,
      })
      .eq("code_id", consumedReferral.codeId)
      .eq("mobile_number", mobile);
    if (linkUsageErr && !isMissingReferralTableError(linkUsageErr.message || "")) {
      // Registration succeeded; referral linkage is best effort.
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
