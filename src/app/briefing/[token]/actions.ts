"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { BriefingRevenueRange, BriefingVexoGoal } from "@prisma/client";

// Página pública (/briefing/[token]) — SEM requireInternalSession, de
// propósito: quem preenche é o cliente final, sem login nenhum (mesmo
// espírito de /conectar/[token] e /acesso/[token]). A validação de acesso
// aqui é o próprio token: só grava se existir um BriefingLink com esse
// token, apontando pra uma clínica ativa — nunca confia em nada vindo do
// cliente além do texto das respostas em si.
export type BriefingFormInput = {
  flagshipService: string;
  currentlyAdvertises: boolean;
  advertisingMonthlySpend: string;
  revenueRange: BriefingRevenueRange;
  whatTried: string;
  hasSecretary: boolean;
  aiPersonaName: string;
  competitorInstagram1: string;
  competitorInstagram2: string;
  vexoGoal: BriefingVexoGoal;
  vexoGoalOther: string;
  averageTicket: string;
};

// Upsert por clinicId (não por token/BriefingLink) — reenvio do mesmo
// link SOBRESCREVE a resposta anterior, sem histórico (ver comentário no
// schema, model Briefing): só a última importa.
export async function submitBriefing(
  token: string,
  input: BriefingFormInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const link = await prisma.briefingLink.findUnique({
    where: { token },
    select: { clinicId: true, clinic: { select: { active: true } } },
  });
  if (!link || !link.clinic.active) {
    return { ok: false, error: "Este link não é mais válido. Peça um link novo." };
  }

  const flagshipService = input.flagshipService.trim();
  const whatTried = input.whatTried.trim();
  const aiPersonaName = input.aiPersonaName.trim();
  const averageTicket = input.averageTicket.trim();
  if (!flagshipService || !whatTried || !aiPersonaName || !averageTicket) {
    return { ok: false, error: "Preencha todas as perguntas obrigatórias antes de enviar." };
  }
  if (input.vexoGoal === "OTHER" && !input.vexoGoalOther.trim()) {
    return { ok: false, error: "Descreva qual é o objetivo principal com a VEXO." };
  }

  const data = {
    flagshipService,
    currentlyAdvertises: input.currentlyAdvertises,
    advertisingMonthlySpend: input.currentlyAdvertises ? input.advertisingMonthlySpend.trim() || null : null,
    revenueRange: input.revenueRange,
    whatTried,
    hasSecretary: input.hasSecretary,
    aiPersonaName,
    competitorInstagram1: input.competitorInstagram1.trim() || null,
    competitorInstagram2: input.competitorInstagram2.trim() || null,
    vexoGoal: input.vexoGoal,
    vexoGoalOther: input.vexoGoal === "OTHER" ? input.vexoGoalOther.trim() || null : null,
    averageTicket,
  };

  await prisma.briefing.upsert({
    where: { clinicId: link.clinicId },
    create: { clinicId: link.clinicId, ...data },
    update: data,
  });

  revalidatePath(`/crm/clinicas/${link.clinicId}/briefing`);
  return { ok: true };
}
