import type { Metadata } from "next";
import Link from "next/link";
import { ChengFenshiVisibilityGuideContent } from "@/components/chengfenshi-visibility-guide-content";
import {
  CHENGFENSHI_GUIDE_DESCRIPTION,
  CHENGFENSHI_GUIDE_TITLE,
} from "@/lib/chengfenshi-visibility-guide-meta";

export const metadata: Metadata = {
  title: CHENGFENSHI_GUIDE_TITLE,
  description: CHENGFENSHI_GUIDE_DESCRIPTION,
  alternates: {
    canonical: "https://www.gearupquiz.com/guides/xianggang-xiaoxue-chengfenshi-lianxi",
  },
};

export default function ChengFenshiGuidePage() {
  return (
    <div
      className="min-h-screen bg-gradient-to-b from-amber-50/40 via-white to-sky-50/30 px-4 py-10"
      style={{ fontFamily: "var(--font-baloo2), var(--font-noto-sans-tc), system-ui, sans-serif" }}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">GearUp Quiz · 增分寶</p>
          <p className="mt-2 text-sm text-gray-600">
            <Link href="/" className="text-sky-700 underline decoration-sky-300 underline-offset-2">
              主頁
            </Link>
            {" · "}
            <Link href="/tutor" className="text-sky-700 underline decoration-sky-300 underline-offset-2">
              練習入口
            </Link>
          </p>
        </header>
        <div className="rounded-3xl border border-amber-100 bg-white/90 p-6 shadow-lg shadow-amber-100/40">
          <ChengFenshiVisibilityGuideContent />
        </div>
      </div>
    </div>
  );
}
