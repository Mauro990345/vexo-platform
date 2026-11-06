"use client";

import { usePathname } from "next/navigation";

// Prévia isolada da paleta nova (cinza-grafite neutro + azul fosco — ver
// a classe .vx-preview em src/app/globals.css) — pedido explícito: ativada
// SÓ na página Pipeline (/crm/clinicas/[id], sem sub-rota), nunca nas
// outras telas da mesma clínica (Automações, Follow-up...), que
// continuam no visual azul padrão mesmo usando o mesmo <AppShell>.
//
// Client Component só por causa do usePathname — decide em runtime, pela
// rota atual, se aplica a classe. Envolve o <AppShell> INTEIRO (sidebar +
// conteúdo), não só o conteúdo da página: como a classe fica num
// ancestral comum aos dois, a paleta nova cascade pra ambos juntos (ver
// uso em clinicas/[id]/layout.tsx). Nenhum componente (AppShell, nav,
// Pipeline) precisou mudar — só herdam variáveis CSS diferentes.
//
// Reprovado = apagar este arquivo, o bloco .vx-preview em globals.css e o
// uso abaixo em clinicas/[id]/layout.tsx — zero rastro em qualquer tela.
export function ClinicPalettePreview({ clinicId, children }: { clinicId: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isPipeline = pathname === `/crm/clinicas/${clinicId}`;
  return <div className={isPipeline ? "vx-preview" : undefined}>{children}</div>;
}
