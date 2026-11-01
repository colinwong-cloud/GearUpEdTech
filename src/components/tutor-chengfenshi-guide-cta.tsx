import Link from "next/link";
import {
  CHENGFENSHI_GUIDE_PATH,
  TUTOR_CHENGFENSHI_CTA_LABEL,
} from "@/lib/chengfenshi-visibility-guide-meta";

export function TutorChengfenshiGuideCta() {
  return (
    <section className="rounded-2xl border border-rose-100 bg-gradient-to-b from-rose-50/90 via-white to-white p-5 shadow-sm">
      <p className="text-sm leading-7 text-gray-700">
        <Link
          href={CHENGFENSHI_GUIDE_PATH}
          className="font-semibold text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900"
        >
          {TUTOR_CHENGFENSHI_CTA_LABEL}
        </Link>
        {" · "}
        <Link href="/" className="text-sky-700 underline decoration-sky-300 underline-offset-2 hover:text-sky-900">
          主頁
        </Link>
      </p>
    </section>
  );
}
