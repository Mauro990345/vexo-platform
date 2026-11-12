import type { ReactNode } from "react";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";

// Casca comum da página pública e das páginas legais: fundo #070a11 com os
// dois brilhos nos cantos superiores, cabeçalho flutuante e rodapé.
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="pub-backdrop min-h-screen text-vexo-pubFg antialiased">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-full focus:bg-vexo-pubButton focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Pular para o conteúdo
      </a>
      <PublicHeader />
      <main id="conteudo">{children}</main>
      <PublicFooter />
    </div>
  );
}
