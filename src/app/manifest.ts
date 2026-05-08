import type { MetadataRoute } from "next";
import { getSiteIconUrl } from "@/lib/login-marketing-assets";

export default function manifest(): MetadataRoute.Manifest {
  const icon = getSiteIconUrl() || undefined;
  const description =
    "增分寶 GearUp Quiz 是一個涵蓋中、英、數三科，並結合 AI 個人化學習與香港本地課程掛鉤的平台。";
  return {
    name: "GearUp Quiz",
    short_name: "GearUp",
    description,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    icons: icon
      ? [
          {
            src: icon,
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: icon,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ]
      : [],
  };
}
