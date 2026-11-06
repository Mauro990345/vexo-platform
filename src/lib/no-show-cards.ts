import { prisma } from "@/lib/prisma";
import {
  computeReactivationWindow,
  isWithinReactivationWindow,
  isReactivationWhatsAppRateLimited,
  REACTIVATION_WHATSAPP_MIN_INTERVAL_MS,
  resolveInstagramDmLink,
  buildInstagramProfileLink,
  buildReactivationWhatsAppLink,
  countTodaysWhatsappSends,
  isDailyWhatsappLimitReached,
  DEFAULT_DAILY_WHATSAPP_LIMIT,
  type ReactivationWindow,
  type SendReactivationWhatsAppResult,
} from "@/lib/reactivation";
import { sendWhatsappMessage, validateBrazilianPhone, formatDateTimeLabel } from "@/lib/whatsapp";
import { ensureLeadFirstNameFromInstagram } from "@/lib/instagram";
import { renderMessageTemplate, normalizeFirstNameForTemplate } from "@/lib/message-template";

// Card "Faltou". Para um lead que agendou e foi marcado "Não compareceu"
// (ver setAppointmentAttendance, appointments.ts) sem ter remarcado desde
// então, aparece um card no D3, outro no D7 e outro no D15 após a falta.
//
// Cadência (rodada atual — AJUSTE, substitui qualquer instrução anterior
// sobre o canal do 3º passo): era D3/D10/D30, agora D3/D7/D15 — pedido
// explícito pra resgatar o lead antes de esfriar e reduzir o uso de
// WhatsApp. Os PASSOS JÁ EXISTENTES foram reaproveitados (nenhuma
// migration, nenhum dado apagado): o `step` gravado em NoShowCardSlot e
// os nomes das colunas de texto em NoShowCardSettings (day10Content,
// day30Content) continuam os MESMOS de antes — só o `offsetDays` de cada
// step mudou (ver NO_SHOW_CARD_STEPS abaixo). O passo 2 (coluna
// day10Content, textos/histórico de envio já gravados) passa a valer pro
// D7; o passo 3 (coluna day30Content) passa a valer pro D15 — os nomes
// das colunas ficam "desalinhados" do dia de verdade de propósito, pra
// não precisar de nenhuma migration (rótulo exibido na tela vem só de
// NO_SHOW_CARD_STEPS, nunca do nome da coluna).
//
// Canal — pedido explícito desta rodada, substituindo a decisão da
// rodada anterior (PR #170): D3 e D7 (passos 1 e 2) continuam WhatsApp
// direto (com fallback Instagram sem telefone, como sempre); D15 (passo
// 3) volta a ser SEMPRE Instagram, manual — sem botão de envio por
// WhatsApp, independente de o lead ter telefone (ver getNoShowCards e a
// trava em sendNoShowCardWhatsAppMessage abaixo).
//
// Sobreposição de janelas (verificação pedida) — D3 e D7 ficam só 4 dias
// um do outro, menor que a janela de 5 dias úteis de cada um
// (computeReactivationWindow): as duas janelas SE SOBREPÕEM por alguns
// dias (confirmado numericamente, não só por inspeção). D7 e D15 (8 dias
// de distância) não se sobrepõem na prática. Resolvido com a MESMA
// solução já usada no "Não agendou" pro mesmo problema (D2/D4, ver
// chooseNeverScheduledStep em never-scheduled-cards.ts): nunca mostra
// dois passos ao mesmo tempo pro mesmo agendamento — sempre o mais cedo
// ainda pendente; se já enviado, mantém visível com check até a janela
// dele fechar (ver chooseNoShowStep abaixo).
//
// Elegibilidade (ajuste de rodada anterior, mantido): o card só pode
// sumir quando o lead AGENDAR/REMARCAR ou for marcado como perdido — uma
// resposta dele sem agendar não some o card nem reinicia os prazos.
// ANTES disso era "log NO_SHOW ainda aberto" (FollowUpLog.respondedAt ===
// null), que fechava na primeira resposta de QUALQUER teor — pedido
// explícito de uma rodada anterior pra separar "respondeu" de
// "agendou/remarcou" aqui, SEM alterar a sequência automática (que
// continua usando respondedAt normalmente, ver
// cancelPendingFollowUp/follow-up.ts). Elegível agora: o agendamento
// ainda está NO_SHOW *e* continua sendo o mais recente do lead (nenhum
// Appointment mais novo, de nenhum status — mesmo critério de "mais
// recente por lead" já usado por selectReactivationCandidates,
// reactivation.ts) *e* a conversa não está LOST. A âncora de dias
// continua FollowUpLog.triggeredAt (nunca reescrito por nenhum código —
// ver comentário grande em triggerFollowUp, follow-up.ts), o mais
// recente da conversa com trigger NO_SHOW — só um agendamento NO_SHOW
// pode ser "o mais recente do lead" por vez, então nunca há ambiguidade
// sobre qual log corresponde à falta atual.
//
// Ancorado em FollowUpLog.triggeredAt (o momento do CLIQUE em "Não
// compareceu", não o horário agendado da consulta — mesmo motivo de
// sempre: o lead pode ter avisado que ia atrasar/remarcar por fora, ver
// comentário grande em triggerFollowUp) — reaproveita
// computeReactivationWindow/isWithinReactivationWindow (reactivation.ts),
// mesma janela de 5 dias úteis.

export const NO_SHOW_CARD_STEPS = [
  { step: 1, offsetDays: 3 },
  { step: 2, offsetDays: 7 },
  { step: 3, offsetDays: 15 },
] as const;

// "3º dia (D3)" — rótulo do campo de texto na aba "Cards do Painel"
// (FollowUpView.tsx), sempre a partir de NO_SHOW_CARD_STEPS (pedido
// explícito) — nunca um número escrito à mão, pra acompanhar sozinho se
// a cadência mudar de novo.
export function noShowStepLabel(step: number): string {
  const offsetDays = NO_SHOW_CARD_STEPS.find((s) => s.step === step)?.offsetDays ?? step;
  return `${offsetDays}º dia (D${offsetDays})`;
}

export const DEFAULT_NO_SHOW_CARD_MESSAGES: readonly [string, string, string] = [
  "Oi, {{primeiro_nome}}! Notamos que você não pôde vir na sua avaliação {{data_horario}}. Quer remarcar? Estamos à disposição.",
  "Oi! Ainda dá tempo de remarcar sua avaliação — é só nos avisar o melhor dia pra você.",
  // D15 (passo 3) — sem variável de nome da Dra. disponível (ver
  // KNOWN_VARIABLE_NAMES, message-template.ts: só primeiro_nome/
  // data_horario existem) — escreve sem o nome quando não houver a
  // variável ("a nossa agenda").
  "Oi, {{primeiro_nome}}. Passando para avisar que a nossa agenda segue com horários abertos. Quando fizer sentido, é só me chamar por aqui.",
];

export type NoShowExistingStep = { step: number; sentAt: Date | null };

export type NoShowCandidate = {
  appointmentId: string;
  leadId: string;
  conversationId: string;
  scheduledAt: Date;
  noShowTriggeredAt: Date;
  // Passos já com slot gravado (NoShowCardSlot) pra este agendamento —
  // usado por chooseNoShowStep (abaixo) pra escolher qual passo mostrar
  // quando mais de uma janela está aberta ao mesmo tempo (D3/D7).
  existingSteps: NoShowExistingStep[];
};

export type NoShowCardCandidate = Omit<NoShowCandidate, "existingSteps"> & { step: number; window: ReactivationWindow };

const NO_SHOW_STEPS_BY_OFFSET_ASC = [...NO_SHOW_CARD_STEPS].sort((a, b) => a.offsetDays - b.offsetDays);

// Escolhe QUAL passo mostrar agora pra um agendamento — mesmo espírito de
// chooseNeverScheduledStep (never-scheduled-cards.ts), necessário porque
// D3 e D7 ficam só 4 dias um do outro: a janela de 5 dias úteis de cada
// um (computeReactivationWindow) é mais larga que essa distância, e as
// duas SE SOBREPÕEM por alguns dias — sem escolher, as duas apareceriam
// como cards SEPARADOS pro mesmo agendamento ao mesmo tempo (verificação
// pedida ao trocar a cadência pra D3/D7/D15). D7 e D15 não se sobrepõem
// na prática (8 dias de distância, mais que a janela de ~1 semana) — pra
// eles, esta função sempre devolve exatamente o que o código antigo já
// devolvia, sem mudar nada do comportamento existente.
//
// Prioridade: (1) o passo cronologicamente mais precoce com janela
// aberta e AINDA NÃO marcado enviado; (2) se nenhum pendente estiver
// aberto, o passo mais precoce com janela aberta JÁ marcado enviado —
// mantém o "✓ enviado" visível até a janela dele fechar, igual ao
// comportamento de sempre.
export function chooseNoShowStep(
  noShowTriggeredAt: Date,
  existingSteps: NoShowExistingStep[],
  now: Date
): { step: number; window: ReactivationWindow } | null {
  const sentSteps = new Set(existingSteps.filter((s) => s.sentAt).map((s) => s.step));

  for (const { step, offsetDays } of NO_SHOW_STEPS_BY_OFFSET_ASC) {
    if (sentSteps.has(step)) continue;
    const window = computeReactivationWindow(noShowTriggeredAt, offsetDays);
    if (isWithinReactivationWindow(window, now)) return { step, window };
  }
  for (const { step, offsetDays } of NO_SHOW_STEPS_BY_OFFSET_ASC) {
    if (!sentSteps.has(step)) continue;
    const window = computeReactivationWindow(noShowTriggeredAt, offsetDays);
    if (isWithinReactivationWindow(window, now)) return { step, window };
  }
  return null;
}

// Pura — aplica chooseNoShowStep a cada candidato já pré-filtrado (ver
// getNoShowCards). No máximo UM resultado por appointmentId agora (ver
// comentário grande acima).
export function buildNoShowCardCandidates(candidates: NoShowCandidate[], now: Date): NoShowCardCandidate[] {
  const result: NoShowCardCandidate[] = [];
  for (const c of candidates) {
    const choice = chooseNoShowStep(c.noShowTriggeredAt, c.existingSteps, now);
    if (!choice) continue;
    result.push({
      appointmentId: c.appointmentId,
      leadId: c.leadId,
      conversationId: c.conversationId,
      scheduledAt: c.scheduledAt,
      noShowTriggeredAt: c.noShowTriggeredAt,
      step: choice.step,
      window: choice.window,
    });
  }
  return result.sort((a, b) => a.window.start.getTime() - b.window.start.getTime() || a.appointmentId.localeCompare(b.appointmentId));
}

export function resolveNoShowCardMessageTemplate(
  step: number,
  settings: { day3Content?: string | null; day10Content?: string | null; day30Content?: string | null }
): string {
  const custom = step === 1 ? settings.day3Content : step === 2 ? settings.day10Content : settings.day30Content;
  if (custom && custom.trim()) return custom.trim();
  return DEFAULT_NO_SHOW_CARD_MESSAGES[step - 1]!;
}

// "Faltou há 3 dias · mensagem 1 de 3" (exemplo do pedido, "de 3" após o
// item 1 desta rodada adicionar o D30) — dias contados a partir do clique
// em "Não compareceu" (noShowTriggeredAt), não do horário agendado
// perdido.
export function buildNoShowCardReason(noShowTriggeredAt: Date, now: Date, step: number): string {
  const days = Math.max(0, Math.floor((now.getTime() - noShowTriggeredAt.getTime()) / (24 * 60 * 60 * 1000)));
  const dayLabel = days === 1 ? "1 dia" : `${days} dias`;
  return `Faltou há ${dayLabel} · mensagem ${step} de ${NO_SHOW_CARD_STEPS.length}`;
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
  // Limite diário de WhatsApp (Reativação + Faltou, compartilhado — ver
  // countTodaysWhatsappSends/ReactivationConfig.dailyWhatsappLimit em
  // reactivation.ts) já atingido — só true pra card de canal WHATSAPP
  // ainda pendente, mesmo mecanismo de ReactivationCard.dailyLimitReached.
  dailyLimitReached: boolean;
};

export async function getNoShowCards(clinicId: string, now: Date = new Date()): Promise<NoShowCard[]> {
  // Elegibilidade (item 4 — ver comentário grande no topo do arquivo):
  // ainda NO_SHOW, conversa não perdida, e — pra decidir "ainda não
  // agendou/remarcou desde a falta" sem depender de respondedAt (que a
  // sequência automática usa pra outro fim) — busca TODOS os
  // agendamentos não cancelados do lead, não só o NO_SHOW, pra achar qual
  // é o mais recente de cada um.
  const appointments = await prisma.appointment.findMany({
    where: {
      clinicId,
      status: { not: "CANCELLED" },
      leadId: { not: null },
      conversationId: { not: null },
    },
    select: {
      id: true,
      leadId: true,
      conversationId: true,
      scheduledAt: true,
      status: true,
      noShowCardSlots: { select: { step: true, sentAt: true } },
      conversation: {
        select: {
          status: true,
          followUps: {
            where: { trigger: "NO_SHOW" },
            orderBy: { triggeredAt: "desc" },
            take: 1,
            select: { triggeredAt: true },
          },
        },
      },
    },
  });

  // Só o agendamento MAIS RECENTE de cada lead conta — mesmo critério
  // usado por selectReactivationCandidates (reactivation.ts), aplicado ao
  // inverso: um NO_SHOW só é candidato se ainda for o mais recente (nada
  // mais novo criado por remarcação/novo agendamento desde a falta).
  const latestByLead = new Map<string, (typeof appointments)[number]>();
  for (const appt of appointments) {
    if (!appt.leadId) continue;
    const current = latestByLead.get(appt.leadId);
    if (!current || appt.scheduledAt.getTime() > current.scheduledAt.getTime()) latestByLead.set(appt.leadId, appt);
  }

  const candidates: NoShowCandidate[] = [];
  for (const appt of latestByLead.values()) {
    if (appt.status !== "NO_SHOW") continue;
    if (appt.conversation?.status === "LOST") continue;
    const log = appt.conversation?.followUps[0];
    if (!log) continue; // defesa — toda marcação de NO_SHOW cria um log (triggerFollowUp, appointments.ts)
    candidates.push({
      appointmentId: appt.id,
      leadId: appt.leadId!,
      conversationId: appt.conversationId!,
      scheduledAt: appt.scheduledAt,
      noShowTriggeredAt: log.triggeredAt,
      existingSteps: appt.noShowCardSlots,
    });
  }

  const cardCandidates = buildNoShowCardCandidates(candidates, now);
  if (cardCandidates.length === 0) return [];

  const [settings, leads, instagramAccount, reactivationConfig, sentTodayCount] = await Promise.all([
    prisma.noShowCardSettings.findUnique({ where: { id: "singleton" } }),
    prisma.lead.findMany({
      where: { id: { in: cardCandidates.map((c) => c.leadId) } },
      select: { id: true, name: true, igUsername: true, igScopedId: true, nameLookupAttempted: true, profilePictureUrl: true, phone: true },
    }),
    prisma.instagramAccount.findUnique({ where: { clinicId }, select: { accessTokenEnc: true } }),
    prisma.reactivationConfig.findUnique({ where: { clinicId }, select: { dailyWhatsappLimit: true } }),
    countTodaysWhatsappSends(clinicId, now),
  ]);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const whatsappDailyLimitReached = isDailyWhatsappLimitReached(sentTodayCount, reactivationConfig?.dailyWhatsappLimit ?? DEFAULT_DAILY_WHATSAPP_LIMIT);
  // sentAtByKey vem direto dos slots já buscados junto do agendamento
  // (noShowCardSlots, acima) — sem precisar de uma segunda consulta.
  const sentAtByKey = new Map(candidates.flatMap((c) => c.existingSteps.map((s) => [`${c.appointmentId}:${s.step}`, s.sentAt] as const)));

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
    // D3/D7 (passos 1 e 2): sem telefone, o card usa o botão do
    // Instagram (fallback de sempre). D15 (passo 3): SEMPRE Instagram,
    // manual — pedido explícito desta rodada, substitui a decisão da
    // rodada anterior (PR #170) de deixar o passo 3 igual aos outros.
    const channel: "WHATSAPP" | "INSTAGRAM" = c.step === 3 ? "INSTAGRAM" : phone ? "WHATSAPP" : "INSTAGRAM";

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
      instagramDmLink: channel === "INSTAGRAM" ? resolveInstagramDmLink(igUsername, message) : null,
      instagramProfileLink: igUsername ? buildInstagramProfileLink(igUsername) : null,
      reason: buildNoShowCardReason(c.noShowTriggeredAt, now, c.step),
      noShowTriggeredAt: c.noShowTriggeredAt,
      sentAt: sentAtByKey.get(`${c.appointmentId}:${c.step}`) ?? null,
      dailyLimitReached: channel === "WHATSAPP" && !sentAtByKey.get(`${c.appointmentId}:${c.step}`) && whatsappDailyLimitReached,
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
      leadId: true,
      lead: { select: { id: true, name: true, igScopedId: true, nameLookupAttempted: true, phone: true } },
      clinic: { select: { whatsappInstanceName: true, instagramAccount: { select: { accessTokenEnc: true } } } },
      conversation: {
        select: { status: true, followUps: { where: { trigger: "NO_SHOW" }, orderBy: { triggeredAt: "desc" }, take: 1, select: { triggeredAt: true } } },
      },
    },
  });
  if (!appointment) return { ok: false, reason: "not_found" };

  const clinicId = appointment.clinicId;

  // Passo 3 (D15) nunca manda por WhatsApp (pedido explícito desta
  // rodada) — a UI não oferece esse botão pro passo 3, mas a defesa em
  // profundidade vale aqui também, caso a função seja chamada direto.
  if (step === 3) return { ok: false, reason: "no_longer_eligible", clinicId };

  // Defesa em profundidade — reconfere aqui o que getNoShowCards já exige
  // pra sequer mostrar o card (item 4: ainda NO_SHOW, conversa não
  // perdida, e ainda o agendamento mais recente do lead — nenhuma
  // remarcação/novo agendamento desde a falta) — cobre a corrida "entre o
  // card aparecer e o clique".
  const noShowLog = appointment.conversation?.followUps[0];
  const newerAppointmentExists = appointment.leadId
    ? (await prisma.appointment.count({
        where: { leadId: appointment.leadId, status: { not: "CANCELLED" }, scheduledAt: { gt: appointment.scheduledAt } },
      })) > 0
    : false;
  if (
    appointment.status !== "NO_SHOW" ||
    !noShowLog ||
    appointment.conversation?.status === "LOST" ||
    newerAppointmentExists
  ) {
    return { ok: false, reason: "no_longer_eligible", clinicId };
  }

  const existing = await prisma.noShowCardSlot.findUnique({ where: { appointmentId_step: { appointmentId, step } } });
  if (existing?.sentAt) return { ok: true, alreadySent: true, clinicId };

  const [reactivationConfig, sentTodayCount] = await Promise.all([
    prisma.reactivationConfig.findUnique({ where: { clinicId }, select: { dailyWhatsappLimit: true } }),
    countTodaysWhatsappSends(clinicId, now),
  ]);
  if (isDailyWhatsappLimitReached(sentTodayCount, reactivationConfig?.dailyWhatsappLimit ?? DEFAULT_DAILY_WHATSAPP_LIMIT)) {
    return { ok: false, reason: "daily_limit_reached", clinicId };
  }

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
