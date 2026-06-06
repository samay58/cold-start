import type { MetadataRoute } from "next";
import { webOrigin } from "../lib/site-origin";

const siteUrl = webOrigin();

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
