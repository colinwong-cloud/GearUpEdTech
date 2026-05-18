import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { genderFromAvatarStyle } from "@/lib/student-gender";

type AddStudentBody = {
  mobile?: string;
  pinCode?: string;
  studentName?: string;
  avatarStyle?: string;
  gradeLevel?: string;
  schoolId?: string | null;
};

type AddedStudent = {
  id: string;
  parent_id: string;
  student_name: string;
  avatar_style: string;
  grade_level: string;
  created_at: string;
  gender?: string | null;
  error?: string;
};

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (!url || !serviceRole) return null;
  return createClient(url, serviceRole);
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

  let body: AddStudentBody;
  try {
    body = (await req.json()) as AddStudentBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mobile = body.mobile?.trim() ?? "";
  const pinCode = body.pinCode?.trim() ?? "";
  const studentName = body.studentName?.trim() ?? "";
  const avatarStyle = body.avatarStyle?.trim() ?? "";
  const gradeLevel = body.gradeLevel?.trim() ?? "";
  const schoolId = body.schoolId ?? null;
  const gender = genderFromAvatarStyle(avatarStyle);

  if (!mobile) {
    return NextResponse.json({ error: "缺少家長電話號碼。" }, { status: 400 });
  }
  if (!isValidPin(pinCode)) {
    return NextResponse.json({ error: "登入狀態已失效，請重新登入後再試。" }, { status: 400 });
  }
  if (!studentName) {
    return NextResponse.json({ error: "請輸入學生姓名。" }, { status: 400 });
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

  const { data, error: rpcErr } = await admin.rpc("add_student_to_parent", {
    p_mobile_number: mobile,
    p_student_name: studentName,
    p_pin_code: pinCode,
    p_avatar_style: avatarStyle,
    p_grade_level: gradeLevel,
    p_school_id: schoolId,
  });
  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message || "新增學生失敗，請重試。" }, { status: 400 });
  }

  const student = data as AddedStudent;
  if (student?.error) {
    return NextResponse.json({ error: student.error }, { status: 400 });
  }
  if (!student?.id) {
    return NextResponse.json({ error: "新增學生回應無效，請重試。" }, { status: 500 });
  }

  const { error: updateErr } = await admin
    .from("students")
    .update({ gender })
    .eq("id", student.id);
  if (updateErr) {
    return NextResponse.json(
      { error: `新增學生成功但性別儲存失敗：${updateErr.message}` },
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
