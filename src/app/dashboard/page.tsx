import { requireClientSession } from "@/lib/session";
import { ClientPanelView } from "@/components/ClientPanelView";

export const dynamic = "force-dynamic";

// Painel do cliente — página única, sem sidebar/menu: a clínica só vê
// números informativos + a lista de agendamentos com o botão de
// não-comparecimento. Nada de Pipeline/Kanban (fica só no CRM interno) e
// nada de gerenciar conexões (WhatsApp/Instagram/Google Calendar são
// responsabilidade da equipe VEXO, não da clínica) — por isso não tem mais
// sidebar nenhuma: não sobrou mais de uma página pra navegar entre.
//
// O corpo da tela mora em ClientPanelView (@/components/ClientPanelView),
// reaproveitado também pela visão interna "Ver painel de [clínica]"
// (/crm/painel-cliente/[id]) — aqui o clinicId vem da sessão do próprio
// cliente; lá vem do parâmetro de rota, direto de dentro do CRM.
//
// requireClientSession (não requireClientFilaSession) de propósito: quem
// só tem o segundo link de acesso (scope="fila") nunca chega até aqui —
// já foi redirecionado pro /dashboard/fila antes (ver session.ts/
// middleware.ts). Então "abordagemHref" abaixo (aba "Abordagem", ao lado
// de "Painel"/"Bônus Full Face" — ver ClientPanelTabs.tsx; era um botão
// solto no header antes, pedido explícito pra virar aba no mesmo
// lugar/estilo) só aparece pra quem TEM o painel completo — o inverso
// pedido explicitamente: quem já está no painel também consegue abrir a
// Fila a partir dele, sem precisar do segundo link.
export default async function ClientDashboardPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const session = await requireClientSession();
  const clinicId = session.user.clinicId as string;

  return (
    <ClientPanelView
      clinicId={clinicId}
      week={searchParams.week}
      base="/dashboard"
      bonusHref="/dashboard/bonus"
      abordagemHref="/dashboard/fila"
    />
  );
}
