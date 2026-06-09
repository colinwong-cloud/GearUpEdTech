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
    return NextResponse.json(
      { error: registerError.message || "註冊失敗，請重試。" },
      { status: 400 }
    );
  }

  const student = data as RegisteredStudent;
  if (!student?.id) {
    return NextResponse.json({ error: "註冊回應無效，請重試。" }, { status: 500 });
  }

  const { error: updateError } = await admin
    .from("students")
    .update({ gender })
    .eq("id", student.id);
  if (updateError) {
    return NextResponse.json(
      { error: `註冊成功但性別儲存失敗：${updateError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    student: {
      ...student,
      gender,
    },
  });
}
