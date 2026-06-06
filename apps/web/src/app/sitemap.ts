import type { MetadataRoute } from "next";
import { webOrigin } from "../lib/site-origin";

const siteUrl = webOrigin();

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
