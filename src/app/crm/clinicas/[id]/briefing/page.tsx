import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { BriefingLinkSection } from "@/components/BriefingLinkSection";
import type { BriefingRevenueRange, BriefingVexoGoal } from "@prisma/client";

export const dynamic = "force-dynamic";

const REVENUE_RANGE_LABELS: Record<BriefingRevenueRange, string> = {
  UNDER_20K: "Até R$ 20 mil",
  FROM_20K_TO_50K: "R$ 20 mil – R$ 50 mil",
  FROM_50K_TO_100K: "R$ 50 mil – R$ 100 mil",
  OVER_100K: "Acima de R$ 100 mil",
};

const VEXO_GOAL_LABELS: Record<BriefingVexoGoal, string> = {
  SCHEDULE_MORE_EVALUATIONS: "Agendar mais avaliações",
  REDUCE_NO_SHOW: "Reduzir falta em consulta",
  STOP_DEPENDING_ON_PAID_ADS: "Parar de depender de anúncio pago",
  OTHER: "Outro",
};

function AnswerRow({ question, answer }: { question: string; answer: string }) {
  return (
    <div className="border-b border-vexo-border pb-2.5 last:border-0 last:pb-0">
      <p className="text-xs font-medium text-vexo-muted">{question}</p>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-vexo-fg">{answer}</p>
    </div>
  );
}

// Aba "Briefing" de uma clínica — mesmo padrão de Painel/Pipeline/Conexões
// (ver clinic-nav.tsx): link/token de onboarding sem login (ver
// BriefingLink no schema e /briefing/[token]/page.tsx) + as respostas já
// enviadas, se existirem. defaultClinicDisplayName pré-preenche o segundo
// campo do formulário de criação do link com o nome interno da clínica
// (Clinic.name) — só um ponto de partida editável, não o valor final:
// BriefingLink.clinicDisplayName é um texto independente, digitado pelo
// Mauro nesse momento.
export default async function ClinicBriefingPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    select: {
      name: true,
      briefingLink: { select: { token: true, clientDisplayName: true, clinicDisplayName: true } },
      briefing: true,
    },
  });
  if (!clinic) notFound();

  const initialLink = clinic.briefingLink
    ? {
        token: clinic.briefingLink.token,
        url: `${process.env.APP_URL ?? ""}/briefing/${clinic.briefingLink.token}`,
        clientDisplayName: clinic.briefingLink.clientDisplayName,
        clinicDisplayName: clinic.briefingLink.clinicDisplayName,
      }
    : null;

  const briefing = clinic.briefing;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Briefing de onboarding</h1>
        <p className="mt-0.5 text-xs text-vexo-muted">
          Link público (sem login) com 7 perguntas rápidas pra preparar a IA e o atendimento desta
          clínica. Não cobre Instagram/Google Calendar — isso continua pelo link de conexão, em
          &quot;Conexões&quot;.
        </p>
      </div>

      <div className="rounded-xl border border-vexo-border bg-vexo-surface p-3.5">
        <BriefingLinkSection clinicId={params.id} initialLink={initialLink} defaultClinicDisplayName={clinic.name} />
      </div>

      <div className="rounded-xl border border-vexo-border bg-vexo-surface p-3.5">
        <h2 className="mb-3 text-sm font-semibold">Respostas</h2>
        {!briefing ? (
          <p className="text-xs text-vexo-muted">Ainda não respondido.</p>
        ) : (
          <div className="space-y-3">
            <AnswerRow question="Carro-chefe (procedimento/serviço principal)" answer={briefing.flagshipService} />
            <AnswerRow
              question="Investe em publicidade?"
              answer={
                briefing.currentlyAdvertises
                  ? `Sim${briefing.advertisingMonthlySpend ? ` — ${briefing.advertisingMonthlySpend}` : ""}`
                  : "Não"
              }
            />
            <AnswerRow question="Faixa de faturamento atual" answer={REVENUE_RANGE_LABELS[briefing.revenueRange]} />
            <AnswerRow question="O que já tentou que não deu certo" answer={briefing.whatTried} />
            <AnswerRow question="Tem secretária?" answer={briefing.hasSecretary ? "Sim" : "Não"} />
            <AnswerRow question="Nome que a IA deve usar" answer={briefing.aiPersonaName} />
            <AnswerRow
              question="Concorrentes no Instagram"
              answer={
                [briefing.competitorInstagram1, briefing.competitorInstagram2].filter(Boolean).join(" · ") ||
                "Não informado"
              }
            />
            <AnswerRow
              question="Objetivo principal com a VEXO"
              answer={
                briefing.vexoGoal === "OTHER" && briefing.vexoGoalOther
                  ? briefing.vexoGoalOther
                  : VEXO_GOAL_LABELS[briefing.vexoGoal]
              }
            />
            <AnswerRow question="Ticket médio dos procedimentos" answer={briefing.averageTicket} />
            <p className="pt-1 text-[11px] text-vexo-muted">
              Enviado em {briefing.submittedAt.toLocaleString("pt-BR")}
              {briefing.updatedAt > briefing.submittedAt && ` · atualizado em ${briefing.updatedAt.toLocaleString("pt-BR")}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
