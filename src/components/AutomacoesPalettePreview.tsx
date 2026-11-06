"use client";

import { usePathname } from "next/navigation";

// Prévia isolada da paleta nova (cinza-azulado escuro em camadas + azul
// fosco — ver a classe .vxa-preview em src/app/globals.css) — pedido
// explícito (2ª rodada, corrigida): ativada SÓ na aba Automações
// (/crm/clinicas/[id]/automacoes), nunca na Pipeline nem nas outras telas
// da mesma clínica, que continuam no visual azul padrão mesmo usando o
// mesmo <AppShell>.
//
// Client Component só por causa do usePathname — decide em runtime, pela
// rota atual, se aplica a classe. Envolve o <AppShell> INTEIRO (sidebar +
// conteúdo), não só o conteúdo da página: como a classe fica num
// ancestral comum aos dois, a paleta nova cascateia pra ambos juntos (ver
// uso em clinicas/[id]/layout.tsx). AppShell e os componentes
// compartilhados (Tabs, TemplateMessageField, ReactivationConfigForms)
// não precisaram mudar — só herdam variáveis CSS diferentes; só
// automacoes/page.tsx (que não é compartilhada com mais nenhuma tela)
// ganhou algumas classes novas.
//
// Reprovado = apagar este arquivo, o bloco .vxa-preview em globals.css, o
// uso abaixo em clinicas/[id]/layout.tsx e as classes extras em
// automacoes/page.tsx — zero rastro em qualquer outra tela.
export function AutomacoesPalettePreview({ clinicId, children }: { clinicId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isAutomacoes = pathname === `/crm/clinicas/${clinicId}/automacoes`;
  return <div className={isAutomacoes ? "vxa-preview" : undefined}>{children}</div>;
}
