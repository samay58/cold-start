import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";

// Licensed evidence face (arillatype.studio), self-hosted as a variable webfont.
const textual = localFont({
  src: [
    { path: "../../public/fonts/AtTextualVAR.woff2", weight: "100 900", style: "normal" },
    { path: "../../public/fonts/AtTextualItalicVAR.woff2", weight: "100 900", style: "italic" }
  ],
  variable: "--font-textual-next",
  display: "swap"
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans-next",
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
    <html lang="en" className={`${plexSans.variable} ${textual.variable}`} suppressHydrationWarning>
      <body>
        <a className="cs-skip-link" href="#main-content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
