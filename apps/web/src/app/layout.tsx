import type { Metadata } from "next";
import { Fraunces, Mona_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-fraunces-next",
  display: "swap"
});

const monaSans = Mona_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mona-sans-next",
  display: "swap"
});

const siteOrigin = process.env.NEXT_PUBLIC_WEB_ORIGIN?.trim() || "https://cold-start.semitechie.vc";

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: "Cold Start",
  description: "Sourced company context cards.",
  icons: {
    icon: [
      { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-128.png", sizes: "128x128", type: "image/png" }
    ],
    apple: [{ url: "/icons/icon-256.png", sizes: "256x256", type: "image/png" }]
  }
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" className={`${fraunces.variable} ${monaSans.variable}`} suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
