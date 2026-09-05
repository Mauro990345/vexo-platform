import { notFound } from "next/navigation";
import { requireInternalSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ClientPanelView } from "@/components/ClientPanelView";
import { setAppointmentAttendanceAction } from "@/app/crm/clinicas/actions";

export const dynamic = "force-dynamic";

// "Ver painel de [clínica]" — a mesma tela que o cliente vê em /dashboard,
// só que aberta por um admin/staff de dentro do CRM (link em
// /crm/painel), sem precisar de sessão CLIENT nenhuma: o clinicId vem
// direto do parâmetro de rota, não da sessão.
//
// Fica fora da árvore /crm/clinicas/[id]/* de propósito — aquele layout
// (src/app/crm/clinicas/[id]/layout.tsx) embrulha tudo no AppShell com a
// sidebar da clínica, e aqui o pedido é a tela exata do cliente, sem
// nenhum menu/chrome do CRM em volta. O layout de /crm (src/app/crm/layout.tsx)
// só garante a sessão interna e repassa os children direto, então este
// arquivo é a página inteira.
export default async function ClientPanelPreviewPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { week?: string };
}) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!clinic) notFound();

  return (
    <ClientPanelView
      clinicId={clinic.id}
      week={searchParams.week}
      base={`/crm/painel-cliente/${clinic.id}`}
      noShowAction={setAppointmentAttendanceAction}
    />
  );
}
