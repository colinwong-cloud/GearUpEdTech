import type { MetadataRoute } from "next";
import { CHENGFENSHI_GUIDE_PATH } from "@/lib/chengfenshi-visibility-guide-meta";
import { TUTOR_SHARE_ORIGIN } from "@/lib/tutor-share-link";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = TUTOR_SHARE_ORIGIN.endsWith("/")
    ? TUTOR_SHARE_ORIGIN.slice(0, -1)
    : TUTOR_SHARE_ORIGIN;

  return [
    {
      url: `${base}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/tutor`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${base}${CHENGFENSHI_GUIDE_PATH}`,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
