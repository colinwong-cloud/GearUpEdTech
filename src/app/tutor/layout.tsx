import type { Metadata } from "next";

/** Override root layout homepage canonical so /tutor is indexed as its own URL. */
export const metadata: Metadata = {
  alternates: {
    canonical: "/tutor",
  },
};

export default function TutorLayout({ children }: { children: React.ReactNode }) {
  return <div className="tutor-portal-root">{children}</div>;
}
