import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { getApproachBoardForClinicAction } from "@/app/crm/(global)/abordagem/actions";
import { ClinicFilaView } from "./ClinicFilaView";

export const dynamic = "force-dynamic";

// Fila por clínica (pedido explícito: operar várias clínicas ao mesmo
// tempo, um perfil do Chrome por clínica — cada aba sempre presa na
// mesma conta) — rota irmã da Fila global (/crm/abordagem/fila), que
// continua existindo exatamente como está. Mostra só o card desta
// clínica, independente do toggle "ativa na fila" da Preparação (ver
// comentário grande em getApproachBoardForClinicAction, actions.ts).
// Não entra em clinic-nav.tsx de propósito — alcançada só por este link
// direto, pra abrir num perfil/aba dedicada, mesmo padrão já usado por
// relatorio-preview/page.tsx (admin-only, fora da sidebar).
export default async function ClinicFilaPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({ where: { id: params.id }, select: { id: true, name: true } });
  if (!clinic) notFound();

  const board = await getApproachBoardForClinicAction(clinic.id);

  return <ClinicFilaView clinicId={clinic.id} clinicName={clinic.name} initialAccount={board.account} initialWindow={board.window} />;
}
