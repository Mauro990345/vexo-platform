import { requireClientSession } from "@/lib/session";
import { ClientPanelView } from "@/components/ClientPanelView";

export const dynamic = "force-dynamic";

// Painel do cliente — página única, sem sidebar/menu: a clínica só vê
// números informativos + a lista de agendamentos com o botão de
// não-comparecimento. Nada de Pipeline/Kanban (fica só no CRM interno) e
// nada de gerenciar conexões (WhatsApp/Instagram/Google Calendar são
// responsabilidade da M8 Growth, não da clínica) — por isso não tem mais
// sidebar nenhuma: não sobrou mais de uma página pra navegar entre.
//
// O corpo da tela mora em ClientPanelView (@/components/ClientPanelView),
// reaproveitado também pela visão interna "Ver painel de [clínica]"
// (/crm/painel-cliente/[id]) — aqui o clinicId vem da sessão do próprio
// cliente; lá vem do parâmetro de rota, direto de dentro do CRM.
export default async function ClientDashboardPage({
  searchParams,
}: {
  searchParams: { week?: string };
}) {
  const session = await requireClientSession();
  const clinicId = session.user.clinicId as string;

  return <ClientPanelView clinicId={clinicId} week={searchParams.week} base="/dashboard" />;
}
