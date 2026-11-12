import type { MetadataRoute } from "next";
import { LEGAL_INFO, PUBLIC_ROUTES } from "@/lib/legal-info";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path) => ({
    url: `${LEGAL_INFO.siteUrl}${path === "/" ? "" : path}`,
    changeFrequency: path === "/" ? "monthly" : "yearly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
