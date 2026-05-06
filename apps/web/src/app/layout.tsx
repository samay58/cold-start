import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_WEB_ORIGIN ?? "https://coldstart.semitechie.vc"),
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
