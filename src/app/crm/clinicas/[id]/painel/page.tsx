import Link from "next/link";
import { ClientPanelView } from "@/components/ClientPanelView";
import { setAppointmentAttendanceAction } from "@/app/crm/clinicas/actions";

export const dynamic = "force-dynamic";

// "Painel" de dentro do contexto de uma clínica — mesma métrica/gráfico/
// lista de agendamentos que o cliente vê em /dashboard e que o admin vê em
// /crm/painel-cliente/[id] (aberto em nova aba, sem sidebar), só que aqui
// dentro da árvore /crm/clinicas/[id]/*, então herda a sidebar da própria
// clínica (Conexões, Pipeline, Agenda...) em vez de trocar de contexto
// pra visão geral de todas as clínicas. standalone={false} porque o
// AppShell (via clinicas/[id]/layout.tsx) já fornece min-h-screen/padding/
// max-w-6xl — sem isso o conteúdo ficaria com o wrapper de página duplicado.
export default async function ClinicPainelPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { week?: string };
}) {
  return (
    <div className="space-y-3">
      <Link href="/crm/painel" className="inline-block text-xs text-vexo-muted hover:text-vexo-accent">
        Ver painel de todas as clínicas →
      </Link>

      <ClientPanelView
        clinicId={params.id}
        week={searchParams.week}
        base={`/crm/clinicas/${params.id}/painel`}
        noShowAction={setAppointmentAttendanceAction}
        standalone={false}
      />
    </div>
  );
}
