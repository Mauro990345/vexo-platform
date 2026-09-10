import { prisma } from "@/lib/prisma";
import { ClientPanelView } from "@/components/ClientPanelView";
import { CreateClientLoginForm } from "@/components/CreateClientLoginForm";
import { setAppointmentAttendanceAction, removeClientLogin } from "@/app/crm/clinicas/actions";

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
// "Acesso do cliente ao painel dele" (criar/remover login) fica aqui TAMBÉM
// — não só na visão geral (/crm/painel, que lista de todas as clínicas de
// uma vez) — pra gerenciar o login de UMA clínica sem precisar sair do
// contexto dela. Mesmo formulário/ação da visão geral (CreateClientLoginForm
// / removeClientLogin), só filtrando os usuários CLIENT desta clínica.
// Fica dentro de <details> (recolhido por padrão) bem no topo, antes do
// título "Painel" da ClientPanelView — compacto o bastante pra não recriar
// o vão vazio que o link removido deixava.
export default async function ClinicPainelPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { week?: string };
}) {
  const clinic = await prisma.clinic.findUniqueOrThrow({
    where: { id: params.id },
    select: { users: { where: { role: "CLIENT" } } },
  });

  return (
    <div className="space-y-4">
      <details className="rounded-xl border border-vexo-border bg-vexo-surface p-3.5">
        <summary className="cursor-pointer list-none text-xs font-medium text-vexo-muted">
          Acesso do cliente ao painel dele ({clinic.users.length})
        </summary>

        <div className="mt-2.5 space-y-2.5">
          <p className="text-card text-vexo-muted">
            Login do painel do cliente — permanente, sem expiração. Revogado removendo o acesso
            abaixo.
          </p>

          {clinic.users.length > 0 && (
            <ul className="divide-y divide-vexo-border rounded-lg border border-vexo-border">
              {clinic.users.map((u) => (
                <li key={u.id} className="flex items-center justify-between px-2.5 py-1.5 text-xs">
                  <div>
                    <p>{u.name}</p>
                    <p className="text-card text-vexo-muted">{u.email}</p>
                  </div>
                  <form action={removeClientLogin.bind(null, params.id, u.id)}>
                    <button className="rounded-md border border-vexo-border px-1.5 py-1 text-card text-vexo-error hover:border-vexo-error/40">
                      Remover acesso
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          <CreateClientLoginForm clinicId={params.id} />
        </div>
      </details>

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
