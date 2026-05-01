import type { MetadataRoute } from "next";
import { getLoginMarketingLogoUrl } from "@/lib/login-marketing-assets";

export default function manifest(): MetadataRoute.Manifest {
  const icon = getLoginMarketingLogoUrl() || undefined;
  return {
    name: "GearUp Quiz",
    short_name: "GearUp",
    description: "Interactive quiz platform for students",
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
