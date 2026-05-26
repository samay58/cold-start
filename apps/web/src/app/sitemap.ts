import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_WEB_ORIGIN?.trim() || "https://cold-start.semitechie.vc";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date()
    },
    {
      url: `${siteUrl}/privacy`,
      lastModified: new Date()
    }
  ];
}
