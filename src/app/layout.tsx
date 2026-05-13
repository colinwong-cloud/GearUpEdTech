import type { Metadata } from "next";
import { Geist, Geist_Mono, Baloo_2, Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import {
  getLoginMarketingLogoUrl,
  getShareBannerUrl,
  getSiteIconUrl,
} from "@/lib/login-marketing-assets";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Casual Traditional Chinese for login marketing / brief copy */
const notoSansTc = Noto_Sans_TC({
  variable: "--font-noto-sans-tc",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

const baloo2 = Baloo_2({
  variable: "--font-baloo2",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
});

const appleTouchIcon = getLoginMarketingLogoUrl();
const siteIcon = getSiteIconUrl();
const DEFAULT_PUBLIC_SITE_URL = "https://www.gearupquiz.com";
const metadataBase = (() => {
  const configured = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured);
    } catch {
      // fallback below
    }
  }
  return new URL(DEFAULT_PUBLIC_SITE_URL);
})();
const shareImagePath = (() => {
  const explicit = getShareBannerUrl();
  if (explicit) return explicit;
  return `${metadataBase.origin}/share/gearup-share-banner.jpg?v=20260508b`;
})();
const shareImageType = /\.png(\?|$)/i.test(shareImagePath) ? "image/png" : "image/jpeg";
const shareMessage =
  "增分寶 GearUp Quiz 是一個涵蓋中、英、數三科，並結合 AI 個人化學習與香港本地課程掛鉤的平台。";

export const metadata: Metadata = {
  metadataBase,
  title: "增分寶 GearUp Quiz",
  description: shareMessage,
  alternates: {
    canonical: metadataBase.origin,
  },
  openGraph: {
    url: metadataBase.origin,
    title: "增分寶 GearUp Quiz",
    description: shareMessage,
    type: "website",
    locale: "zh_HK",
    images: [
      {
        url: shareImagePath,
        width: 1424,
        height: 752,
        alt: "增分寶 GearUp Quiz 平台橫幅",
        type: shareImageType,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "增分寶 GearUp Quiz",
    description: shareMessage,
    images: [shareImagePath],
  },
  ...(siteIcon || appleTouchIcon
    ? {
        icons: {
          ...(siteIcon
            ? {
                icon: [
                  { url: siteIcon, type: "image/png", sizes: "any" },
                  { url: siteIcon, type: "image/png", sizes: "32x32" },
                  { url: siteIcon, type: "image/png", sizes: "192x192" },
                ],
                shortcut: [{ url: siteIcon, type: "image/png" }],
              }
            : {}),
          ...(appleTouchIcon
            ? {
                apple: [{ url: appleTouchIcon, sizes: "180x180", type: "image/png" }],
              }
            : {}),
        },
      }
    : {}),
};

const bgUrl = `${(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()}/storage/v1/object/public/question-images/Banana%20images/bk.png`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansTc.variable} ${baloo2.variable} h-full antialiased`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: `body{background-image:url(${bgUrl});}` }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
