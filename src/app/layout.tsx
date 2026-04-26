import type { Metadata } from "next";
import { Geist, Geist_Mono, Baloo_2 } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const baloo2 = Baloo_2({
  variable: "--font-baloo2",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "GearUp Quiz",
  description: "Interactive quiz platform for students",
};

const bgUrl = `${(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim()}/storage/v1/object/public/question-images/Banana%20images/bk.png`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${baloo2.variable} h-full antialiased`}
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
