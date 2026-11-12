import Link from "next/link";
import { VexoLogo } from "@/components/public/VexoLogo";
import { LEGAL_INFO, formatCompanyLine } from "@/lib/legal-info";

// Rodapé da página pública e das páginas legais. Razão social/CNPJ só
// aparecem quando estiverem preenchidos em legal-info.ts.
const COLUMNS: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
  {
    title: "Produto",
    links: [
      { href: "/#como-funciona", label: "Como funciona" },
      { href: "/#resultados", label: "Resultados" },
      { href: "/#seguranca", label: "Segurança" },
      { href: "/entrar", label: "Entrar" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacidade", label: "Política de privacidade" },
      { href: "/termos", label: "Termos de uso" },
      { href: "/exclusao-de-dados", label: "Exclusão de dados" },
    ],
  },
  {
    title: "Contato",
    links: [LEGAL_INFO.emails.contact, LEGAL_INFO.emails.support, LEGAL_INFO.emails.privacy].map((e) => ({ href: `mailto:${e}`, label: e })),
  },
];

export function PublicFooter() {
  const companyLine = formatCompanyLine();
  return (
    <footer className="border-t border-vexo-pubEdge/[0.08] px-4 pb-8 pt-10 sm:px-6">
      <div className="mx-auto max-w-[1040px]">
        <div className="grid gap-8 md:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div>
            <VexoLogo />
            <p className="mt-3 max-w-xs text-sm text-vexo-pubMuted">Social selling para clínicas de saúde.</p>
            {companyLine && <p className="mt-2 text-xs text-vexo-pubMuted">{companyLine}</p>}
          </div>
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-xs font-medium uppercase tracking-[0.12em] text-vexo-pubMuted">{col.title}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    {l.href.startsWith("mailto:") || l.href.startsWith("/#") ? (
                      <a href={l.href} className="break-all text-vexo-pubFg2 motion-safe:transition-colors hover:text-vexo-pubFg">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="text-vexo-pubFg2 motion-safe:transition-colors hover:text-vexo-pubFg">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p className="mt-10 border-t border-vexo-pubEdge/[0.08] pt-5 text-xs leading-relaxed text-vexo-pubMuted">
          © 2026 VEXO IA. Todos os direitos reservados. Instagram, WhatsApp e Meta são marcas de seus respectivos proprietários. O
          VEXO IA não é afiliado, patrocinado nem endossado pela Meta.
        </p>
      </div>
    </footer>
  );
}
