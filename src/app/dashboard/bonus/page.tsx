import { redirect } from "next/navigation";
import { requireClientSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canViewFullFaceBonus } from "@/lib/full-face-bonus-content";
import { FullFaceBonusPage } from "@/components/FullFaceBonusPage";

export const dynamic = "force-dynamic";

// "Bônus Full Face" do cliente. Proteção no servidor: com o interruptor da
// conta desligado (Clinic.fullFaceBonusEnabled, Automações > Configuração),
// quem digitar a URL volta pra /dashboard. Equipe interna não tem clinicId
// na sessão — requireClientSession já manda pra /crm; o admin abre o guia
// por /crm/painel-cliente/[id]/bonus.
export default async function ClientBonusPage() {
  const session = await requireClientSession();
  const clinicId = session.user.clinicId as string;

  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, fullFaceBonusEnabled: true },
  });
  if (!clinic || !canViewFullFaceBonus({ internal: false, enabled: clinic.fullFaceBonusEnabled })) {
    redirect("/dashboard");
  }

  return <FullFaceBonusPage clinicId={clinic.id} panelHref="/dashboard" bonusHref="/dashboard/bonus" />;
}
