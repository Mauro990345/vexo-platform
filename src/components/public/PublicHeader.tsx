import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { VexoLogo } from "@/components/public/VexoLogo";

// Cabeçalho flutuante em pílula (página pública e páginas legais). Links
// apontam pra "/#secao" pra funcionarem também a partir das páginas legais.
// No celular os links somem; ficam só o logo e "Entrar".
export const PUBLIC_NAV_LINKS = [
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#resultados", label: "Resultados" },
  { href: "/#seguranca", label: "Segurança" },
  { href: "/#duvidas", label: "Dúvidas" },
] as const;

export function PublicHeader() {
  return (
    <header className="sticky top-3 z-50 px-3 pt-3 sm:px-4">
      <div className="mx-auto flex max-w-[1040px] items-center justify-between gap-4 rounded-full border border-vexo-pubEdge/10 bg-vexo-pubHeader/[0.72] py-1.5 pl-4 pr-1.5 backdrop-blur-md">
        <Link href="/" aria-label="VEXO IA — início" className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-vexo-pubAccent">
          <VexoLogo />
        </Link>
        <nav aria-label="Seções" className="hidden md:block">
          <ul className="flex items-center gap-5 text-[13px] text-vexo-pubFg2">
            {PUBLIC_NAV_LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} className="motion-safe:transition-colors hover:text-vexo-pubFg">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <Link
          href="/entrar"
          className="inline-flex items-center gap-1.5 rounded-full border border-vexo-pubEdge/20 px-3.5 py-1.5 text-[13px] font-medium text-vexo-pubFg motion-safe:transition-colors hover:border-vexo-pubAccent/60 hover:text-white"
        >
          Entrar
          <ArrowRight size={14} strokeWidth={1.8} aria-hidden="true" />
        </Link>
      </div>
    </header>
  );
}
