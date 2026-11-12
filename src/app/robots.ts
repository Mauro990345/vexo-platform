import type { MetadataRoute } from "next";
import { LEGAL_INFO } from "@/lib/legal-info";

// Indexação liberada pra página pública e páginas legais; área logada, APIs
// e links privados (relatório, acesso, briefing) ficam fora.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/privacidade", "/termos", "/exclusao-de-dados"],
        disallow: ["/crm", "/dashboard", "/api", "/relatorio", "/acesso", "/briefing", "/conectar", "/setup", "/entrar", "/c/"],
      },
    ],
    sitemap: `${LEGAL_INFO.siteUrl}/sitemap.xml`,
  };
}
