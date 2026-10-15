import type { MetadataRoute } from "next";
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
  ];
}
