import type { Metadata } from "next";
import { TUTOR_SHARE_ORIGIN } from "@/lib/tutor-share-link";

const TUTOR_PORTAL_OG_URL = `${TUTOR_SHARE_ORIGIN.replace(/\/$/, "")}/tutor`;

/** Override root layout homepage canonical so /tutor is indexed as its own URL. */
export const metadata: Metadata = {
  alternates: {
    canonical: TUTOR_PORTAL_OG_URL,
  },
  openGraph: {
    url: TUTOR_PORTAL_OG_URL,
  },
};

export default function TutorLayout({ children }: { children: React.ReactNode }) {
  return <div className="tutor-portal-root">{children}</div>;
}
