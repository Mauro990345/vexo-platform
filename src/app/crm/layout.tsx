import { requireCrmAreaSession } from "@/lib/session";

// Garante a sessão pra toda a árvore /crm/* — a sidebar em si não é
// definida aqui, porque muda de conteúdo dependendo do contexto: visão
// global (ver crm/(global)/layout.tsx) ou dentro de uma clínica específica
// (ver crm/clinicas/[id]/layout.tsx), cada uma com seu próprio AppShell.
//
// requireCrmAreaSession (não requireInternalSession) de propósito: deixa
// Admin/Equipe/Revisor passarem estruturalmente pra dentro da árvore —
// CADA página embaixo decide se aquele papel específico pode ver AQUELA
// página (a maioria continua com requireInternalSession, que bloqueia o
// Revisor; só as poucas páginas da lista liberada usam
// requireInternalOrReviewerSession). Um gate único aqui que já barrasse o
// Revisor impediria ele de chegar até nas próprias páginas liberadas.
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  await requireCrmAreaSession();
  return children;
}
