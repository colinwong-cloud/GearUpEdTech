"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { GuoyuResultScreen } from "@/components/guoyu/GuoyuResultScreen";
import {
  readGuoyuResultPayload,
} from "@/lib/guoyu/result-payload";
import { readGuoyuStudentResume, saveGuoyuStudentResume } from "@/lib/guoyu/student-resume";

export default function GuoyuResultPage() {
  const router = useRouter();
  const payload = useMemo(() => readGuoyuResultPayload(), []);
  const resume = useMemo(() => readGuoyuStudentResume(), []);

  useEffect(() => {
    if (!payload?.sourceText) {
      router.replace("/guoyu");
    }
  }, [payload, router]);

  if (!payload?.sourceText) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">
        載入中…
      </div>
    );
  }

  return (
    <GuoyuResultScreen
      studentId={resume?.selectedStudentId ?? ""}
      sourceText={payload.sourceText}
      rows={payload.rows}
      onBack={() => {
        if (resume) {
          saveGuoyuStudentResume({
            ...resume,
            returnScreen: "guoyu_compose",
            guoyuDraftText: payload.sourceText,
          });
        }
        router.push("/guoyu");
      }}
      onUpgrade={() => {
        if (resume) {
          saveGuoyuStudentResume({ ...resume, returnScreen: "payment" });
        }
        router.push("/");
      }}
    />
  );
}
