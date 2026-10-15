import type { MetadataRoute } from "next";
import { TUTOR_SHARE_ORIGIN } from "@/lib/tutor-share-link";

/** Paths that are app internals, auth, or dashboards — not public marketing. */
const DISALLOW_PATHS = [
  "/admin",
  "/api/",
  "/mer",
  "/tutor/student/",
  "/reset-password",
  "/payment-airwallex",
  "/payment-callback",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: DISALLOW_PATHS,
    },
    sitemap: `${TUTOR_SHARE_ORIGIN}/sitemap.xml`,
  };
}
