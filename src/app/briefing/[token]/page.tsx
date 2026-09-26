import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { BriefingForm } from "@/components/BriefingForm";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-xl bg-vexo-accent" />
          <h1 className="text-2xl font-semibold tracking-tight">VEXO</h1>
          <p className="mt-1 text-sm text-vexo-muted">M8 Growth</p>
        </div>
        <div className="rounded-2xl border border-vexo-border bg-vexo-surface p-6 shadow-xl">{children}</div>
      </div>
    </main>
  );
}

// Página pública de briefing de onboarding — mesmo espírito de
// /conectar/[token] e /acesso/[token]: SEM sessão/login do CRM (fora da
// árvore /crm, que é protegida inteira por requireInternalSession), o
// token (de um BriefingLink, nunca o id real da clínica) é o único jeito
// de chegar aqui. clientDisplayName/clinicDisplayName vêm do próprio
// BriefingLink (digitados pelo Mauro ao criar o link, ver
// getOrCreateBriefingLink em crm/clinicas/actions.ts) — nunca de
// Clinic.name, que pode ser diferente (nome interno/slug vs. nome que o
// Mauro quer mostrar pro cliente nesse cabeçalho).
export default async function BriefingPage({ params }: { params: { token: string } }) {
  const link = await prisma.briefingLink.findUnique({
    where: { token: params.token },
    select: {
      clinicId: true,
      clientDisplayName: true,
      clinicDisplayName: true,
      clinic: { select: { active: true } },
    },
  });

  if (!link || !link.clinic.active) {
    return (
      <Shell>
        <div className="text-center">
          <h2 className="text-base font-semibold">Link inválido ou expirado</h2>
          <p className="mt-2 text-sm text-vexo-muted">Peça um novo link de briefing ao M8 Growth.</p>
        </div>
      </Shell>
    );
  }

  // Reabrir o mesmo link depois de já ter respondido pré-preenche o
  // formulário com a última resposta enviada — reenviar sobrescreve, sem
  // criar um histórico novo (ver comentário no schema, model Briefing).
  const existingRow = await prisma.briefing.findUnique({ where: { clinicId: link.clinicId } });
  const existing = existingRow
    ? {
        flagshipService: existingRow.flagshipService,
        currentlyAdvertises: existingRow.currentlyAdvertises,
        advertisingMonthlySpend: existingRow.advertisingMonthlySpend ?? "",
        revenueRange: existingRow.revenueRange,
        whatTried: existingRow.whatTried,
        hasSecretary: existingRow.hasSecretary,
        aiPersonaName: existingRow.aiPersonaName,
        competitorInstagram1: existingRow.competitorInstagram1 ?? "",
        competitorInstagram2: existingRow.competitorInstagram2 ?? "",
        vexoGoal: existingRow.vexoGoal,
        vexoGoalOther: existingRow.vexoGoalOther ?? "",
        averageTicket: existingRow.averageTicket,
      }
    : null;

  return (
    <Shell>
      <div className="mb-5 text-center">
        <p className="text-sm text-vexo-muted">
          Olá, <span className="text-vexo-fg">{link.clientDisplayName}</span>
        </p>
        <h2 className="mt-1 text-base font-semibold">Briefing de onboarding — {link.clinicDisplayName}</h2>
        <p className="mt-2 text-sm text-vexo-muted">
          Estas informações nos ajudam a configurar o atendimento da sua clínica com precisão. Leva
          cerca de 2 minutos.
        </p>
      </div>

      <BriefingForm token={params.token} initial={existing} />
    </Shell>
  );
}
