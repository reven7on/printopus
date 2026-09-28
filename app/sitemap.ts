import type { MetadataRoute } from "next";
import { getSiteUrl } from "./site-config";

export const dynamic = "force-dynamic";

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  return [
    {
      url: siteUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/configurator`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
