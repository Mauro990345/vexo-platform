import { notFound } from "next/navigation";
import { requireInternalSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { FullFaceBonusGuide } from "@/components/FullFaceBonusGuide";

export const dynamic = "force-dynamic";

// Item "Bônus" do menu lateral da clínica — o mesmo guia que a cliente vê
// em /dashboard/bonus (mesmo componente e mesmo conteúdo, só leitura),
// aberto dentro do AppShell do admin. Abre SEMPRE, com o interruptor da
// conta (Clinic.fullFaceBonusEnabled) ligado ou desligado — o interruptor
// só controla a aba no Painel da cliente.
export default async function ClinicBonusPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    select: { id: true, fullFaceBonusEnabled: true },
  });
  if (!clinic) notFound();

  return (
    <FullFaceBonusGuide
      storageKey={`vexo:bonus-full-face:v1:${clinic.id}`}
      header={
        <>
          <h1 className="text-[18px] font-semibold tracking-tight sm:text-base">Bônus Full Face</h1>
          <p className="mt-0.5 text-[16px] text-vexo-muted sm:text-xs">
            {clinic.fullFaceBonusEnabled
              ? "Liberado para esta clínica: a cliente vê a aba no Painel dela."
              : "Não liberado para a cliente. Para liberar, use o interruptor em Automações › Configuração."}
          </p>
        </>
      }
    />
  );
}
