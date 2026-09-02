import { requireInternalSession } from "@/lib/session";

// Só garante a sessão pra toda a árvore /crm/* — a sidebar em si não é
// definida aqui, porque muda de conteúdo dependendo do contexto: visão
// global (ver crm/(global)/layout.tsx) ou dentro de uma clínica específica
// (ver crm/clinicas/[id]/layout.tsx), cada uma com seu próprio AppShell.
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  await requireInternalSession();
  return children;
}
