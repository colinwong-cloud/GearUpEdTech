"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { ZhongwenXiezuoScreen } from "@/components/zhongwen-xiezuo/ZhongwenXiezuoScreen";
import {
  readGuoyuStudentResume,
  saveGuoyuStudentResume,
} from "@/lib/guoyu/student-resume";

export default function ZhongwenXiezuoPage() {
  const router = useRouter();
  const resume = useMemo(() => readGuoyuStudentResume(), []);

  useEffect(() => {
    if (!resume?.selectedStudentId) {
      router.replace("/");
    }
  }, [resume, router]);

  const student = useMemo(() => {
    if (!resume) return null;
    return resume.students.find((s) => s.id === resume.selectedStudentId) ?? null;
  }, [resume]);

  if (!resume || !student) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        載入中…
      </div>
    );
  }

  return (
    <ZhongwenXiezuoScreen
      studentId={student.id}
      initialText={resume.zhongwenXiezuoDraftText ?? ""}
      onBack={() => {
        saveGuoyuStudentResume({
          ...resume,
          returnScreen: "subject_select",
          zhongwenXiezuoDraftText: undefined,
        });
        router.push("/");
      }}
      onUpgrade={() => {
        saveGuoyuStudentResume({ ...resume, returnScreen: "payment" });
        router.push("/");
      }}
    />
  );
}
