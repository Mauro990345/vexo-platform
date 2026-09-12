import { prisma } from "@/lib/prisma";
import { ClientPanelView } from "@/components/ClientPanelView";
import { ClientAccessModal } from "@/components/ClientAccessModal";
import { setAppointmentAttendanceAction } from "@/app/crm/clinicas/actions";

export const dynamic = "force-dynamic";

// "Painel" de dentro do contexto de uma clínica — mesma métrica/gráfico/
// lista de agendamentos que o cliente vê em /dashboard e que o admin vê em
// /crm/painel-cliente/[id] (aberto em nova aba, sem sidebar), só que aqui
// dentro da árvore /crm/clinicas/[id]/*, então herda a sidebar da própria
// clínica (Conexões, Pipeline...) em vez de trocar de contexto
// pra visão geral de todas as clínicas. standalone={false} porque o
// AppShell (via clinicas/[id]/layout.tsx) já fornece min-h-screen/padding/
// max-w-6xl — sem isso o conteúdo ficaria com o wrapper de página duplicado.
//
// Sem link "Ver painel de todas as clínicas" no topo — era redundante com
// "Contas" no menu lateral, que já leva pra lista de todas as clínicas.
//
// "Acesso do cliente ao painel dele" (criar/remover login) não fica mais
// fixo no topo da página (ocupava espaço e desalinhava a primeira dobra) —
// agora abre por baixo do botão "Criar painel" (ver ClientAccessModal,
// mesmo padrão visual do "Criar conta" em Contas), passado como
// headerAction pra ClientPanelView renderizar ao lado do título "Painel".
export default async function ClinicPainelPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { week?: string };
}) {
  // select explícito nos campos do usuário (não só no filtro role: CLIENT)
  // é essencial aqui, não só estilo — sem ele o Prisma traz TODOS os
  // campos escalares do User, incluindo passwordHash, e esse objeto vai
  // direto como prop pro ClientAccessModal ("use client"): qualquer campo
  // que passe pela fronteira server->client component é serializado no
  // payload RSC enviado pro navegador. Com o select restrito, o hash nunca
  // sai do server.
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: params.id },
    select: { users: { where: { role: "CLIENT" }, select: { id: true, name: true, email: true } } },
  });

  return (
    <ClientPanelView
      clinicId={params.id}
      week={searchParams.week}
      base={`/crm/clinicas/${params.id}/painel`}
      noShowAction={setAppointmentAttendanceAction}
      standalone={false}
      headerAction={<ClientAccessModal clinicId={params.id} users={clinic.users} />}
    />
  );
}
