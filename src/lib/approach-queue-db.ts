import { prisma } from "@/lib/prisma";
import {
  normalizeApproachUsername,
  resolveApproachUploadRows,
  parseApproachUsernamesTxt,
  parseCsvRows,
  startOfApproachDay,
  computeApproachAccountState,
  randomApproachWaitMs,
  resolveAvailableApproachSlots,
  pickNextApproachMessageSlot,
  fillApproachMessageTemplate,
  type ApproachAccountState,
  type ApproachUploadRow,
} from "@/lib/approach-queue";

// Funções COM banco da Fila de abordagem — lógica pura em approach-queue.ts
// (testada sem Prisma); aqui só orquestração + persistência. Mesma divisão
// já usada em reactivation.ts/report-metrics.ts.

// ---------------------------------------------------------------------------
// Configuração por clínica (criada sob demanda — upsert)
// ---------------------------------------------------------------------------

export async function getOrCreateApproachQueueConfig(clinicId: string) {
  return prisma.approachQueueConfig.upsert({
    where: { clinicId },
    update: {},
    create: { clinicId },
  });
}

export async function setApproachDailyLimit(clinicId: string, dailyLimit: number) {
  if (!Number.isInteger(dailyLimit) || dailyLimit < 1) {
    throw new Error("Limite por dia precisa ser um número inteiro maior que zero.");
  }
  await prisma.approachQueueConfig.upsert({
    where: { clinicId },
    update: { dailyLimit },
    create: { clinicId, dailyLimit },
  });
}

export async function setApproachActiveInQueue(clinicId: string, active: boolean) {
  await prisma.approachQueueConfig.upsert({
    where: { clinicId },
    update: { activeInQueue: active },
    create: { clinicId, activeInQueue: active },
  });
}

export async function setApproachPaused(clinicId: string, paused: boolean) {
  await prisma.approachQueueConfig.upsert({
    where: { clinicId },
    update: { paused },
    create: { clinicId, paused },
  });
}

export async function getApproachMessagesConfig(clinicId: string) {
  return prisma.approachMessagesConfig.findUnique({ where: { clinicId } });
}

export async function saveApproachMessages(clinicId: string, messages: { message1?: string | null; message2?: string | null; message3?: string | null; message4?: string | null; message5?: string | null }) {
  await prisma.approachMessagesConfig.upsert({
    where: { clinicId },
    update: messages,
    create: { clinicId, ...messages },
  });
}

// "Copiar de outra clínica" — substitui as 5 mensagens da clínica de
// destino pelas da origem (nunca mescla, sempre sobrescreve igual a um
// "colar por cima").
export async function copyApproachMessagesFrom(targetClinicId: string, sourceClinicId: string) {
  const source = await prisma.approachMessagesConfig.findUnique({ where: { clinicId: sourceClinicId } });
  if (!source) throw new Error("A clínica de origem ainda não tem mensagens cadastradas.");
  await saveApproachMessages(targetClinicId, {
    message1: source.message1,
    message2: source.message2,
    message3: source.message3,
    message4: source.message4,
    message5: source.message5,
  });
}

// ---------------------------------------------------------------------------
// Upload de lista (CSV/XLSX/TXT) — dedup e inserção no FIM da fila
// ---------------------------------------------------------------------------

export type ApproachUploadResult = { added: number; discarded: number };

// `rows` já vem como {username, name} (ver parseCsvRows/resolveApproachUploadRows
// pro CSV/XLSX, e parseApproachUsernamesTxt pro TXT — a extração específica
// de cada formato de arquivo fica na action, que sabe ler o File; aqui só a
// parte com banco: dedup + insert).
export async function uploadApproachLeads(clinicId: string, rows: ApproachUploadRow[]): Promise<ApproachUploadResult> {
  const seen = new Set<string>();
  const candidates: ApproachUploadRow[] = [];
  for (const row of rows) {
    const normalized = normalizeApproachUsername(row.username);
    if (!normalized || seen.has(normalized)) continue; // duplicado dentro do PRÓPRIO arquivo
    seen.add(normalized);
    candidates.push({ username: row.username.trim().replace(/^@+/, ""), name: row.name });
  }
  if (candidates.length === 0) return { added: 0, discarded: rows.length };

  const pairs = candidates.map((c) => ({ candidate: c, normalized: normalizeApproachUsername(c.username) }));

  // "já está em qualquer lista" OU "já recebeu mensagem" — ambos cobertos
  // por uma linha já existente em ApproachQueueItem pra este clinicId+@
  // normalizado, qualquer que seja o status (QUEUED/SENT/SKIPPED).
  const [existingItems, existingLeads] = await Promise.all([
    prisma.approachQueueItem.findMany({
      where: { clinicId, usernameNormalized: { in: pairs.map((p) => p.normalized) } },
      select: { usernameNormalized: true },
    }),
    // "já tem conversa com a clínica" — todo Lead nasce junto com a 1ª
    // Conversation (ver handleInboundInstagramMessage, conversation-pipeline.ts),
    // então checar Lead já cobre isso sem precisar de join com Conversation.
    prisma.lead.findMany({
      where: { clinicId, igUsername: { not: null } },
      select: { igUsername: true },
    }),
  ]);
  const existingNormalized = new Set(existingItems.map((i) => i.usernameNormalized));
  const existingLeadUsernames = new Set(existingLeads.map((l) => normalizeApproachUsername(l.igUsername!)));

  const toInsert = pairs.filter((p) => !existingNormalized.has(p.normalized) && !existingLeadUsernames.has(p.normalized));
  const discarded = rows.length - toInsert.length;

  if (toInsert.length > 0) {
    await prisma.approachQueueItem.createMany({
      data: toInsert.map((p) => ({
        clinicId,
        username: p.candidate.username,
        usernameNormalized: p.normalized,
        name: p.candidate.name,
      })),
      skipDuplicates: true,
    });
  }

  return { added: toInsert.length, discarded };
}

export function extractApproachRowsFromCsvText(text: string): ApproachUploadRow[] {
  return resolveApproachUploadRows(parseCsvRows(text));
}

export { parseApproachUsernamesTxt };

// ---------------------------------------------------------------------------
// Board da Fila (contas + até 3 cards cada)
// ---------------------------------------------------------------------------

export type ApproachBoardAccount = {
  clinicId: string;
  name: string;
  igUsername: string | null;
  dailyLimit: number;
  sentToday: number;
  state: ApproachAccountState;
  items: { id: string; username: string; name: string | null }[];
};

export async function countApproachedToday(clinicId: string, now: Date): Promise<number> {
  return prisma.approachQueueItem.count({
    where: { clinicId, status: "SENT", sentAt: { gte: startOfApproachDay(now) } },
  });
}

// Snapshot de UMA conta — reaproveitado tanto pelo board inteiro
// (getApproachBoard) quanto pelas actions de enviar/desfazer/pular/pausar
// (cada uma devolve o snapshot só da conta que mexeu, pro cliente atualizar
// aquele card sem precisar recarregar o board inteiro).
export async function getApproachBoardAccount(clinicId: string, now: Date = new Date()): Promise<ApproachBoardAccount | null> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true, instagramAccount: { select: { igUsername: true } } },
  });
  if (!clinic) return null;

  const [config, sentToday, items] = await Promise.all([
    getOrCreateApproachQueueConfig(clinicId),
    countApproachedToday(clinicId, now),
    prisma.approachQueueItem.findMany({
      where: { clinicId, status: "QUEUED" },
      orderBy: { createdAt: "asc" },
      take: 3,
      select: { id: true, username: true, name: true },
    }),
  ]);
  const state = computeApproachAccountState({
    now,
    paused: config.paused,
    dailyLimit: config.dailyLimit,
    sentToday,
    lockedUntil: config.lockedUntil,
  });
  return {
    clinicId: clinic.id,
    name: clinic.name,
    igUsername: clinic.instagramAccount?.igUsername ?? null,
    dailyLimit: config.dailyLimit,
    sentToday,
    state,
    items,
  };
}

export async function getApproachBoard(now: Date = new Date()): Promise<ApproachBoardAccount[]> {
  const clinics = await prisma.clinic.findMany({
    where: { approachQueueConfig: { is: { activeInQueue: true } } },
    select: { id: true },
    orderBy: { name: "asc" },
  });
  const accounts = await Promise.all(clinics.map((c) => getApproachBoardAccount(c.id, now)));
  return accounts.filter((a): a is ApproachBoardAccount => a !== null);
}

// ---------------------------------------------------------------------------
// Enviar / desfazer / pular
// ---------------------------------------------------------------------------

export type SendApproachResult =
  | { ok: true; message: string; igUsername: string; itemId: string }
  | { ok: false; reason: "outside_hours" | "paused" | "limit_reached" | "waiting" | "empty_queue" | "no_messages" };

// UM TOQUE = marca enviado + sorteia a mensagem + devolve o link do
// Instagram (montado na action, que já tem buildInstagramDmLink à mão) —
// esta função só garante o lado do banco: estado da conta, claim atômico
// do item (anti duplo-toque, mesmo padrão de sendReactivationWhatsAppMessage,
// reactivation.ts), log em ApproachLog e nova espera sorteada.
export async function sendNextApproachItem(clinicId: string, now: Date = new Date()): Promise<SendApproachResult> {
  const [config, messagesConfig, sentToday, item] = await Promise.all([
    getOrCreateApproachQueueConfig(clinicId),
    getApproachMessagesConfig(clinicId),
    countApproachedToday(clinicId, now),
    prisma.approachQueueItem.findFirst({
      where: { clinicId, status: "QUEUED" },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const state = computeApproachAccountState({ now, paused: config.paused, dailyLimit: config.dailyLimit, sentToday, lockedUntil: config.lockedUntil });
  if (state.kind === "OUTSIDE_HOURS") return { ok: false, reason: "outside_hours" };
  if (state.kind === "PAUSED") return { ok: false, reason: "paused" };
  if (state.kind === "LIMIT_REACHED") return { ok: false, reason: "limit_reached" };
  if (state.kind === "WAITING") return { ok: false, reason: "waiting" };
  if (!item) return { ok: false, reason: "empty_queue" };

  const availableSlots = resolveAvailableApproachSlots([messagesConfig?.message1, messagesConfig?.message2, messagesConfig?.message3, messagesConfig?.message4, messagesConfig?.message5]);
  if (availableSlots.length === 0) return { ok: false, reason: "no_messages" };

  // Claim atômico — só conta a 1ª chamada concorrente pra ESTE item;
  // double-click (ou double-tap) na mesma ação some sem efeito duplo.
  const claim = await prisma.approachQueueItem.updateMany({
    where: { id: item.id, status: "QUEUED" },
    data: { status: "SENT", sentAt: now },
  });
  if (claim.count === 0) return { ok: false, reason: "empty_queue" };

  const slot = pickNextApproachMessageSlot(availableSlots, config.lastMessageSlot);
  const template = [messagesConfig?.message1, messagesConfig?.message2, messagesConfig?.message3, messagesConfig?.message4, messagesConfig?.message5][slot - 1]!;
  const message = fillApproachMessageTemplate(template, item.name);

  const todayStart = startOfApproachDay(now);
  const log = await prisma.approachLog.create({ data: { clinicId, loggedDate: todayStart, count: 1 } });

  await Promise.all([
    prisma.approachQueueItem.update({ where: { id: item.id }, data: { approachLogId: log.id } }),
    prisma.approachQueueConfig.update({
      where: { clinicId },
      data: { lockedUntil: new Date(now.getTime() + randomApproachWaitMs()), lastMessageSlot: slot },
    }),
  ]);

  return { ok: true, message, igUsername: item.username, itemId: item.id };
}

// "Não enviei · Desfazer" — só o envio MAIS RECENTE desta clínica (sempre
// o card que acabou de ficar em espera; nunca existe mais de um "em voo"
// por clínica, já que só o card da frente tem botão). Devolve o item pro
// topo da fila (basta voltar status->QUEUED: createdAt dele continua sendo
// o mais antigo entre os QUEUED, porque qualquer lead novo entra DEPOIS —
// ver comentário grande em ApproachQueueItem, schema.prisma), apaga a
// linha de ApproachLog criada por aquele envio e libera a conta na hora.
export async function undoLastApproachSend(clinicId: string): Promise<{ ok: boolean }> {
  const lastSent = await prisma.approachQueueItem.findFirst({
    where: { clinicId, status: "SENT" },
    orderBy: { sentAt: "desc" },
  });
  if (!lastSent) return { ok: false };

  await prisma.approachQueueItem.update({
    where: { id: lastSent.id },
    data: { status: "QUEUED", sentAt: null, approachLogId: null },
  });
  if (lastSent.approachLogId) {
    await prisma.approachLog.delete({ where: { id: lastSent.approachLogId } }).catch(() => {
      // já apagada por um Desfazer concorrente — ignora
    });
  }
  await prisma.approachQueueConfig.update({ where: { clinicId }, data: { lockedUntil: null } });
  return { ok: true };
}

// "Pular" — some pra sempre, nunca conta, nunca volta. Só sai da fila se
// ainda estiver QUEUED (evita destravar um item já SENT por engano se o
// clique chegar atrasado).
export async function skipApproachItem(itemId: string): Promise<{ ok: boolean }> {
  const result = await prisma.approachQueueItem.updateMany({
    where: { id: itemId, status: "QUEUED" },
    data: { status: "SKIPPED" },
  });
  return { ok: result.count > 0 };
}
