import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClientFilaSession } from "@/lib/session";
import {
  getApproachBoardForClinicClientAction,
  confirmApproachSendClientAction,
  undoApproachSendClientAction,
  skipApproachItemClientAction,
  setApproachPausedClientAction,
} from "./actions";
import { ClinicFilaView } from "@/app/crm/clinicas/[id]/abordagem/fila/ClinicFilaView";

export const dynamic = "force-dynamic";

// Fila de abordagem do CLIENTE — pedido explícito: um segundo link de
// acesso, independente do link do painel (ClientPanelLink/
// /acesso/[token]), que dê acesso SÓ a esta tela (sem sidebar, sem
// qualquer outro dado). Mesma tela/mesmo visual/mesmas regras de negócio
// (tempos de espera, pausa de lote, cards empilhados) da versão interna
// (crm/clinicas/[id]/abordagem/fila/page.tsx) — reaproveita o MESMO
// componente (ClinicFilaView), só trocando a camada de autenticação:
// requireClientFilaSession (session.ts) em vez de requireInternalSession,
// e as 5 actions de dashboard/fila/actions.ts (gated por CLIENT) em vez
// das internas.
//
// Sem :id na rota — ao contrário da versão interna, aqui o clinicId
// SEMPRE vem da sessão (session.user.clinicId), nunca de input do
// cliente: o cliente só vê a própria clínica, sem exceção.
//
// Sem layout próprio (não existe dashboard/fila/layout.tsx) — igual
// /dashboard e /dashboard/bonus, nasce sem sidebar de graça. O wrapper
// abaixo (min-h-screen/px/max-w-6xl) é o MESMO que ClientPanelView usa
// quando standalone=true (ver ClientPanelView.tsx), pra ficar com a
// mesma "moldura" de página que o resto do painel do cliente.
export default async function ClientFilaPage() {
  const session = await requireClientFilaSession();
  const clinicId = session.user.clinicId as string;

  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { id: true, name: true } });
  if (!clinic) notFound();

  const board = await getApproachBoardForClinicClientAction(clinic.id);

  return (
    <div className="min-h-screen bg-vexo-bg px-4 pt-4 pb-6 sm:px-8 sm:pt-6 sm:pb-8">
      <div className="mx-auto max-w-6xl">
        <ClinicFilaView
          clinicId={clinic.id}
          clinicName={clinic.name}
          initialAccount={board.account}
          initialWindow={board.window}
          showGlobalFilaLink={false}
          getBoardAction={getApproachBoardForClinicClientAction}
          confirmSendAction={confirmApproachSendClientAction}
          undoSendAction={undoApproachSendClientAction}
          skipItemAction={skipApproachItemClientAction}
          setPausedAction={setApproachPausedClientAction}
        />
      </div>
    </div>
  );
}
