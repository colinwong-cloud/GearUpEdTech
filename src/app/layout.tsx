import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Sans_TC } from "next/font/google";
import "./globals.css";
import { getLoginMarketingLogoUrl, getSiteIconUrl } from "@/lib/login-marketing-assets";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** Casual Traditional Chinese for login marketing copy */
const notoSansTc = Noto_Sans_TC({
  variable: "--font-noto-sans-tc",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

const appleTouchIcon = getLoginMarketingLogoUrl();
const siteIcon = getSiteIconUrl();

export const metadata: Metadata = {
  title: "GearUp Quiz",
  description: "Interactive quiz platform for students",
  ...(siteIcon || appleTouchIcon
    ? {
        icons: {
          ...(siteIcon
            ? {
                icon: [{ url: siteIcon, type: "image/png", sizes: "32x32" }],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} ${notoSansTc.variable} h-full antialiased`}
    >
      <head />
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
