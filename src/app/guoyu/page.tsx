"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { GuoyuComposeScreen } from "@/components/guoyu/GuoyuComposeScreen";
import {
  readGuoyuStudentResume,
  saveGuoyuStudentResume,
} from "@/lib/guoyu/student-resume";
import { saveGuoyuResultPayload } from "@/lib/guoyu/result-payload";

export default function GuoyuComposePage() {
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
    <GuoyuComposeScreen
      studentId={student.id}
      initialText={resume.guoyuDraftText ?? ""}
      onBack={() => {
        saveGuoyuStudentResume({
          ...resume,
          returnScreen: "subject_select",
          guoyuDraftText: undefined,
        });
        router.push("/");
      }}
      onUpgrade={() => {
        saveGuoyuStudentResume({ ...resume, returnScreen: "payment" });
        router.push("/");
      }}
      onGenerated={(payload) => {
        saveGuoyuResultPayload(payload);
        saveGuoyuStudentResume({
          ...resume,
          returnScreen: "guoyu_compose",
          guoyuDraftText: payload.sourceText,
        });
        router.push("/guoyu/result");
      }}
    />
  );
}
