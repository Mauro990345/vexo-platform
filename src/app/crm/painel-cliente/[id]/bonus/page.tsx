import { notFound } from "next/navigation";
import { requireInternalSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { FullFaceBonusPage } from "@/components/FullFaceBonusPage";

export const dynamic = "force-dynamic";

// "Bônus Full Face" visto pelo admin/staff — abre SEMPRE, com o interruptor
// da conta ligado ou não (pra revisar/gravar antes de liberar). A aba no
// topo de "Ver painel de [clínica]" só aparece com o interruptor ligado,
// igual ao que a cliente vê; com ele desligado, o admin chega aqui pela URL.
export default async function ClientBonusPreviewPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({ where: { id: params.id }, select: { id: true } });
  if (!clinic) notFound();

  const base = `/crm/painel-cliente/${clinic.id}`;
  return <FullFaceBonusPage clinicId={clinic.id} panelHref={base} bonusHref={`${base}/bonus`} />;
}
