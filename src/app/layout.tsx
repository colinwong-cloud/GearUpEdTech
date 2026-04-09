import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GearUp Quiz",
  description: "Interactive quiz platform for students",
};

const bgUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/question-images/Banana%20images/bkground.png`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body
        className="min-h-full flex flex-col"
        style={{ backgroundImage: `url(${bgUrl})` }}
      >
        {children}
      </body>
    </html>
  );
}
