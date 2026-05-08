import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_WEB_ORIGIN?.trim() || "https://coldstart.semitechie.vc";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/c/", "/c/*/opengraph-image"],
      disallow: ["/api/extension/"]
    },
    sitemap: `${siteUrl}/sitemap.xml`
  };
}
