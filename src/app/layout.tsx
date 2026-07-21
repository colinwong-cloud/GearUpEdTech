import type { Metadata } from "next";
import { Geist, Geist_Mono, Baloo_2, Noto_Sans_TC } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import {
  getLoginMarketingLogoUrl,
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
  const configured =
    process.env.NEXT_PUBLIC_SHARE_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
  if (configured) {
    try {
      return new URL(configured);
    } catch {
      // fallback below
    }
  }
  return new URL(DEFAULT_PUBLIC_SITE_URL);
})();
const primaryShareImagePath = `${DEFAULT_PUBLIC_SITE_URL}/share/gearup-share-banner.jpg?v=20260508b`;
const shareMessage =
  "免費中英數練習平台，AI 精準補漏，貼合香港課程。";
const GTM_CONTAINER_ID =
  process.env.NEXT_PUBLIC_GTM_ID?.trim() || "GTM-KQNKGM4B";

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
        url: primaryShareImagePath,
        width: 1424,
        height: 752,
        alt: "增分寶 GearUp Quiz 平台橫幅",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "增分寶 GearUp Quiz",
    description: shareMessage,
    images: [primaryShareImagePath],
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
        <Script
          id="gtm-loader"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_CONTAINER_ID}');`,
          }}
        />
        <style dangerouslySetInnerHTML={{ __html: `body{background-image:url(${bgUrl});}` }} />
      </head>
      <body className="min-h-full flex flex-col">
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${GTM_CONTAINER_ID}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
            title="Google Tag Manager"
          />
        </noscript>
        {children}
      </body>
    </html>
  );
}
