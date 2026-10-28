import { prisma } from "@/lib/prisma";
import {
  computeReactivationWindow,
  isWithinReactivationWindow,
  isReactivationWhatsAppRateLimited,
  REACTIVATION_WHATSAPP_MIN_INTERVAL_MS,
  resolveInstagramDmLink,
  buildInstagramProfileLink,
  buildReactivationWhatsAppLink,
  type ReactivationWindow,
  type SendReactivationWhatsAppResult,
} from "@/lib/reactivation";
import { sendWhatsappMessage, validateBrazilianPhone, formatDateTimeLabel } from "@/lib/whatsapp";
import { ensureLeadFirstNameFromInstagram } from "@/lib/instagram";
import { renderMessageTemplate, normalizeFirstNameForTemplate } from "@/lib/message-template";

// Card "Faltou" — item 2 do pedido. Para um lead que agendou e foi marcado
// "Não compareceu" (ver setAppointmentAttendance, appointments.ts) sem ter
// respondido nem remarcado desde então, aparece um card no D3 e outro no
// D10 após a falta.
//
// Reaproveita a MESMA sequência já existente (FollowUpLog trigger NO_SHOW,
// ver triggerFollowUp/cancelPendingFollowUp em follow-up.ts) pra decidir
// elegibilidade — NÃO cria nenhum rastreamento novo de "respondeu/
// remarcou": um log com respondedAt=null É exatamente "sem ter respondido
// nem remarcado" (cancelPendingFollowUp fecha o log na primeira resposta
// do lead, de qualquer teor, e também quando ele agenda de novo — ver
// conversation-pipeline.ts). A sequência automática de mensagens
// (dispatchFollowUpSteps) continua funcionando exatamente como antes,
// completamente em paralelo — este módulo só LÊ o mesmo estado, nunca
// escreve nele.
//
// Ancorado em FollowUpLog.triggeredAt (o momento do CLIQUE em "Não
// compareceu", não o horário agendado da consulta — mesmo motivo de
// sempre: o lead pode ter avisado que ia atrasar/remarcar por fora, ver
// comentário grande em triggerFollowUp) — reaproveita
// computeReactivationWindow/isWithinReactivationWindow (reactivation.ts),
// mesma janela de 5 dias úteis.

export const NO_SHOW_CARD_STEPS = [
  { step: 1, offsetDays: 3 },
  { step: 2, offsetDays: 10 },
] as const;

export const DEFAULT_NO_SHOW_CARD_MESSAGES: readonly [string, string] = [
  "Oi, {{primeiro_nome}}! Notamos que você não pôde vir na sua avaliação {{data_horario}}. Quer remarcar? Estamos à disposição.",
  "Oi! Ainda dá tempo de remarcar sua avaliação — é só nos avisar o melhor dia pra você.",
];

export type NoShowCandidate = {
  appointmentId: string;
  leadId: string;
  conversationId: string;
  scheduledAt: Date;
  noShowTriggeredAt: Date;
};

export type NoShowCardCandidate = NoShowCandidate & { step: number; window: ReactivationWindow };

// Pura — mesma forma de buildReactivationCardCandidates (reactivation.ts),
// só que cada candidato já tem os dois passos fixos (D3/D10) em vez de uma
// lista configurável de períodos.
export function buildNoShowCardCandidates(candidates: NoShowCandidate[], now: Date): NoShowCardCandidate[] {
  const result: NoShowCardCandidate[] = [];
  for (const c of candidates) {
    for (const { step, offsetDays } of NO_SHOW_CARD_STEPS) {
      const window = computeReactivationWindow(c.noShowTriggeredAt, offsetDays);
      if (isWithinReactivationWindow(window, now)) {
        result.push({ ...c, step, window });
      }
    }
  }
  return result.sort(
    (a, b) => a.window.start.getTime() - b.window.start.getTime() || a.appointmentId.localeCompare(b.appointmentId) || a.step - b.step
  );
}

export function resolveNoShowCardMessageTemplate(step: number, settings: { day3Content?: string | null; day10Content?: string | null }): string {
  const custom = step === 1 ? settings.day3Content : settings.day10Content;
  if (custom && custom.trim()) return custom.trim();
  return DEFAULT_NO_SHOW_CARD_MESSAGES[step - 1]!;
}

// "Faltou há 3 dias · mensagem 1 de 2" (exemplo do pedido) — dias contados
// a partir do clique em "Não compareceu" (noShowTriggeredAt), não do
// horário agendado perdido.
export function buildNoShowCardReason(noShowTriggeredAt: Date, now: Date, step: number): string {
  const days = Math.max(0, Math.floor((now.getTime() - noShowTriggeredAt.getTime()) / (24 * 60 * 60 * 1000)));
  const dayLabel = days === 1 ? "1 dia" : `${days} dias`;
  return `Faltou há ${dayLabel} · mensagem ${step} de 2`;
}

export type NoShowCard = {
  appointmentId: string;
  step: number;
  leadId: string;
  name: string;
  igUsername: string | null;
  profilePictureUrl: string | null;
  message: string;
  channel: "WHATSAPP" | "INSTAGRAM";
  whatsappLink: string | null;
  instagramDmLink: string | null;
  instagramProfileLink: string | null;
  reason: string;
  noShowTriggeredAt: Date;
  sentAt: Date | null;
};

export async function getNoShowCards(clinicId: string, now: Date = new Date()): Promise<NoShowCard[]> {
  const appointments = await prisma.appointment.findMany({
    where: {
      clinicId,
      status: "NO_SHOW",
      leadId: { not: null },
      conversationId: { not: null },
      // "sem ter respondido nem remarcado" — log NO_SHOW ainda aberto
      // nesta conversa (ver comentário grande no topo do arquivo).
      conversation: { followUps: { some: { trigger: "NO_SHOW", respondedAt: null } } },
    },
    select: {
      id: true,
      leadId: true,
      conversationId: true,
      scheduledAt: true,
      conversation: {
        select: {
          followUps: {
            where: { trigger: "NO_SHOW", respondedAt: null },
            orderBy: { triggeredAt: "desc" },
            take: 1,
            select: { triggeredAt: true },
          },
        },
      },
    },
  });

  const candidates: NoShowCandidate[] = appointments
    .filter((a) => a.conversation?.followUps[0])
    .map((a) => ({
      appointmentId: a.id,
      leadId: a.leadId!,
      conversationId: a.conversationId!,
      scheduledAt: a.scheduledAt,
      noShowTriggeredAt: a.conversation!.followUps[0]!.triggeredAt,
    }));

  const cardCandidates = buildNoShowCardCandidates(candidates, now);
  if (cardCandidates.length === 0) return [];

  const [settings, leads, instagramAccount, existingSlotRows] = await Promise.all([
    prisma.noShowCardSettings.findUnique({ where: { id: "singleton" } }),
    prisma.lead.findMany({
      where: { id: { in: cardCandidates.map((c) => c.leadId) } },
      select: { id: true, name: true, igUsername: true, igScopedId: true, nameLookupAttempted: true, profilePictureUrl: true, phone: true },
    }),
    prisma.instagramAccount.findUnique({ where: { clinicId }, select: { accessTokenEnc: true } }),
    prisma.noShowCardSlot.findMany({ where: { appointmentId: { in: cardCandidates.map((c) => c.appointmentId) } } }),
  ]);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const sentAtByKey = new Map(existingSlotRows.map((s) => [`${s.appointmentId}:${s.step}`, s.sentAt]));

  // Nome ao vivo (Instagram) — uma vez por lead distinto, igual
  // getReactivationCards (reactivation.ts).
  const uniqueLeads = [...leadById.values()];
  const rawNameByLeadId = new Map<string, string | null>();
  if (instagramAccount) {
    await Promise.all(
      uniqueLeads.map(async (lead) => {
        rawNameByLeadId.set(lead.id, await ensureLeadFirstNameFromInstagram(lead, instagramAccount.accessTokenEnc));
      })
    );
  } else {
    for (const lead of uniqueLeads) rawNameByLeadId.set(lead.id, lead.name);
  }

  return cardCandidates.map((c) => {
    const lead = leadById.get(c.leadId);
    const rawTemplate = resolveNoShowCardMessageTemplate(c.step, settings ?? {});
    const message = renderMessageTemplate(rawTemplate, {
      primeiro_nome: normalizeFirstNameForTemplate(rawNameByLeadId.get(c.leadId) ?? null),
      data_horario: formatDateTimeLabel(c.scheduledAt, now),
    });

    const phone = lead?.phone ?? null;
    const igUsername = lead?.igUsername ?? null;
    // Item 2: sem telefone, o card usa o botão do Instagram (mesmo
    // visual "Faltou", só troca o canal de ação).
    const channel: "WHATSAPP" | "INSTAGRAM" = phone ? "WHATSAPP" : "INSTAGRAM";

    return {
      appointmentId: c.appointmentId,
      step: c.step,
      leadId: c.leadId,
      name: lead?.name ?? lead?.igUsername ?? "Paciente",
      igUsername,
      profilePictureUrl: lead?.profilePictureUrl ?? null,
      message,
      channel,
      // Envio é direto pelo VEXO (ver sendNoShowCardWhatsAppMessage), mas o
      // link continua populado como FALLBACK pro mesmo caso que a
      // Reativação já trata (clínica desconectada no meio do fluxo — ver
      // ReactivationRail.tsx, useManualFallback).
      whatsappLink: channel === "WHATSAPP" && phone ? buildReactivationWhatsAppLink(phone, message) : null,
      instagramDmLink: channel === "INSTAGRAM" ? resolveInstagramDmLink(igUsername) : null,
      instagramProfileLink: igUsername ? buildInstagramProfileLink(igUsername) : null,
      reason: buildNoShowCardReason(c.noShowTriggeredAt, now, c.step),
      noShowTriggeredAt: c.noShowTriggeredAt,
      sentAt: sentAtByKey.get(`${c.appointmentId}:${c.step}`) ?? null,
    };
  });
}

export async function toggleNoShowCardSent(
  appointmentId: string,
  step: number,
  now: Date = new Date()
): Promise<{ clinicId: string; sentAt: Date | null } | null> {
  const existing = await prisma.noShowCardSlot.findUnique({
    where: { appointmentId_step: { appointmentId, step } },
    include: { appointment: { select: { clinicId: true } } },
  });

  if (existing) {
    const sentAt = existing.sentAt ? null : now;
    await prisma.noShowCardSlot.update({ where: { id: existing.id }, data: { sentAt } });
    return { clinicId: existing.appointment.clinicId, sentAt };
  }

  // Primeiro clique deste card — ainda sem linha (nunca precisou de
  // upsert antes de alguém marcar enviado, diferente da Reativação, que
  // sempre upserta assim que o card entra na faixa, pra fixar a VARIAÇÃO
  // atribuída; aqui não há variação pra fixar, step já é fixo).
  const appointment = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { clinicId: true } });
  if (!appointment) return null;

  await prisma.noShowCardSlot.create({ data: { appointmentId, step, sentAt: now } });
  return { clinicId: appointment.clinicId, sentAt: now };
}

// Envio direto do WhatsApp — "o mesmo mecanismo da Reativação" (pedido
// explícito): mesma reserva atômica anti duplo clique, mesmo limite de
// ~10s entre envios de WhatsApp da MESMA clínica (compartilhado com a
// Reativação — ver comentário abaixo, consulta as duas tabelas).
export async function sendNoShowCardWhatsAppMessage(
  appointmentId: string,
  step: number,
  now: Date = new Date()
): Promise<SendReactivationWhatsAppResult & { clinicId?: string }> {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: {
      clinicId: true,
      scheduledAt: true,
      status: true,
      lead: { select: { id: true, name: true, igScopedId: true, nameLookupAttempted: true, phone: true } },
      clinic: { select: { whatsappInstanceName: true, instagramAccount: { select: { accessTokenEnc: true } } } },
      conversation: {
        select: { followUps: { where: { trigger: "NO_SHOW", respondedAt: null }, orderBy: { triggeredAt: "desc" }, take: 1, select: { triggeredAt: true } } },
      },
    },
  });
  if (!appointment) return { ok: false, reason: "not_found" };

  const clinicId = appointment.clinicId;

  // Defesa em profundidade — reconfere aqui o que getNoShowCards já exige
  // pra sequer mostrar o card: ainda NO_SHOW e ainda com o log aberto (sem
  // resposta/remarcação desde então) — cobre a corrida "entre o card
  // aparecer e o clique" (pedido explícito, item 4).
  const openNoShowLog = appointment.conversation?.followUps[0];
  if (appointment.status !== "NO_SHOW" || !openNoShowLog) {
    return { ok: false, reason: "no_longer_eligible", clinicId };
  }

  const existing = await prisma.noShowCardSlot.findUnique({ where: { appointmentId_step: { appointmentId, step } } });
  if (existing?.sentAt) return { ok: true, alreadySent: true, clinicId };

  const [recentReactivationSent, recentNoShowSent] = await Promise.all([
    prisma.reactivationCardSlot.findFirst({ where: { sentAt: { not: null }, appointment: { clinicId } }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
    prisma.noShowCardSlot.findFirst({ where: { sentAt: { not: null }, appointment: { clinicId } }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
  ]);
  const mostRecentWhatsappSentAt = [recentReactivationSent?.sentAt, recentNoShowSent?.sentAt]
    .filter((d): d is Date => Boolean(d))
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  if (isReactivationWhatsAppRateLimited(mostRecentWhatsappSentAt, now)) {
    return { ok: false, reason: "rate_limited", clinicId };
  }

  // Reserva atômica — cria a linha já com sentAt=now (count 0 = outra
  // chamada concorrente ganhou, mesmo padrão de claimMessage/
  // sendReactivationWhatsAppMessage).
  let claimed = true;
  try {
    await prisma.noShowCardSlot.create({ data: { appointmentId, step, sentAt: now } });
  } catch {
    // @@unique([appointmentId, step]) violado — a linha já existe (criada
    // por esta chamada concorrente ou por um toggle anterior sem envio).
    const claim = await prisma.noShowCardSlot.updateMany({ where: { appointmentId, step, sentAt: null }, data: { sentAt: now } });
    claimed = claim.count === 1;
  }
  if (!claimed) return { ok: true, alreadySent: true, clinicId };

  async function releaseClaim() {
    await prisma.noShowCardSlot.update({ where: { appointmentId_step: { appointmentId, step } }, data: { sentAt: null } });
  }

  const phone = appointment.lead?.phone ?? null;
  const phoneCheck = phone ? validateBrazilianPhone(phone) : { valid: false as const, reason: "Lead sem telefone cadastrado." };
  if (!phoneCheck.valid) {
    await releaseClaim();
    console.error(`[vexo:no-show-card] Telefone inválido pra envio de WhatsApp (appointmentId=${appointmentId}): ${phoneCheck.reason}`);
    return { ok: false, reason: "invalid_phone", clinicId };
  }

  const instanceName = appointment.clinic.whatsappInstanceName;
  if (!instanceName) {
    await releaseClaim();
    return { ok: false, reason: "disconnected", clinicId };
  }

  const settings = await prisma.noShowCardSettings.findUnique({ where: { id: "singleton" } });
  const rawTemplate = resolveNoShowCardMessageTemplate(step, settings ?? {});

  const lead = appointment.lead;
  const instagramAccount = appointment.clinic.instagramAccount;
  const rawName = lead && instagramAccount ? await ensureLeadFirstNameFromInstagram(lead, instagramAccount.accessTokenEnc) : (lead?.name ?? null);
  const text = renderMessageTemplate(rawTemplate, {
    primeiro_nome: normalizeFirstNameForTemplate(rawName),
    data_horario: formatDateTimeLabel(appointment.scheduledAt, now),
  });

  try {
    await sendWhatsappMessage(instanceName, phoneCheck.e164, text);
  } catch (err) {
    await releaseClaim();
    console.error(`[vexo:no-show-card] Falha ao enviar WhatsApp do card "Faltou" (appointmentId=${appointmentId}, step=${step}):`, err);
    return { ok: false, reason: "send_failed", clinicId };
  }

  return { ok: true, alreadySent: false, clinicId };
}

export { REACTIVATION_WHATSAPP_MIN_INTERVAL_MS };
