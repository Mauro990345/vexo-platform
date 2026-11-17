import { prisma } from "@/lib/prisma";
import { buildInstagramDmLink } from "@/lib/reactivation";
import {
  normalizeApproachUsername,
  resolveApproachUploadRows,
  parseApproachUsernamesTxt,
  parseCsvRows,
  startOfApproachDay,
  computeApproachAccountState,
  approachAccountSortKey,
  randomApproachWaitMs,
  resolveAvailableApproachSlots,
  pickNextApproachMessageSlot,
  fillApproachMessageTemplate,
  validateApproachWindow,
  validateApproachTiming,
  DEFAULT_APPROACH_WINDOW_START_MINUTE,
  DEFAULT_APPROACH_WINDOW_END_MINUTE,
  DEFAULT_APPROACH_WAIT_MIN_MINUTES,
  DEFAULT_APPROACH_WAIT_MAX_MINUTES,
  DEFAULT_APPROACH_BATCH_SIZE,
  DEFAULT_APPROACH_BATCH_PAUSE_HOURS,
  type ApproachAccountState,
  type ApproachUploadRow,
} from "@/lib/approach-queue";

// ---------------------------------------------------------------------------
// Horário permitido — GLOBAL, singleton (ver ApproachWindowSettings, schema.prisma)
// ---------------------------------------------------------------------------

export type ApproachWindow = { startMinute: number; endMinute: number };

export async function getApproachWindow(): Promise<ApproachWindow> {
  const settings = await prisma.approachWindowSettings.findUnique({ where: { id: "singleton" } });
  return {
    startMinute: settings?.startMinute ?? DEFAULT_APPROACH_WINDOW_START_MINUTE,
    endMinute: settings?.endMinute ?? DEFAULT_APPROACH_WINDOW_END_MINUTE,
  };
}

export async function setApproachWindow(startMinute: number, endMinute: number): Promise<void> {
  validateApproachWindow(startMinute, endMinute);
  await prisma.approachWindowSettings.upsert({
    where: { id: "singleton" },
    update: { startMinute, endMinute },
    create: { id: "singleton", startMinute, endMinute },
  });
}

// ---------------------------------------------------------------------------
// Tempos (espera entre mensagens, lote e pausa) — GLOBAL, singleton (ver
// ApproachTimingSettings, schema.prisma). Mesmo padrão do horário acima.
// ---------------------------------------------------------------------------

export type ApproachTiming = { waitMinMinutes: number; waitMaxMinutes: number; batchSize: number; batchPauseHours: number };

export async function getApproachTimingSettings(): Promise<ApproachTiming> {
  const settings = await prisma.approachTimingSettings.findUnique({ where: { id: "singleton" } });
  return {
    waitMinMinutes: settings?.waitMinMinutes ?? DEFAULT_APPROACH_WAIT_MIN_MINUTES,
    waitMaxMinutes: settings?.waitMaxMinutes ?? DEFAULT_APPROACH_WAIT_MAX_MINUTES,
    batchSize: settings?.batchSize ?? DEFAULT_APPROACH_BATCH_SIZE,
    batchPauseHours: settings?.batchPauseHours ?? DEFAULT_APPROACH_BATCH_PAUSE_HOURS,
  };
}

export async function setApproachTiming(timing: ApproachTiming): Promise<void> {
  validateApproachTiming(timing);
  await prisma.approachTimingSettings.upsert({
    where: { id: "singleton" },
    update: timing,
    create: { id: "singleton", ...timing },
  });
}

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

export type ApproachBoardItem = { id: string; username: string; name: string | null; message: string | null; dmLink: string | null };

export type ApproachBoardAccount = {
  clinicId: string;
  name: string;
  igUsername: string | null;
  profilePictureUrl: string | null;
  dailyLimit: number;
  sentToday: number;
  leadsRemaining: number;
  state: ApproachAccountState;
  items: ApproachBoardItem[];
};

export async function countApproachedToday(clinicId: string, now: Date): Promise<number> {
  return prisma.approachQueueItem.count({
    where: { clinicId, status: "SENT", sentAt: { gte: startOfApproachDay(now) } },
  });
}

// Quantos @ ainda faltam enviar nesta clínica (status QUEUED — não
// enviado, não pulado; inclui o item ATIVO no card, que também é QUEUED
// até o toque em "Enviar") — base do contador "N na fila" (ver DESIGN.md
// "Preparação — contador de leads restantes").
export async function countApproachQueueRemaining(clinicId: string): Promise<number> {
  return prisma.approachQueueItem.count({ where: { clinicId, status: "QUEUED" } });
}

// Atribui (e PERSISTE) a mensagem sorteada pro item ATIVO (o primeiro da
// fila) assim que ele aparece no board — nunca sorteada de novo depois
// disso, nem numa atualização automática da tela nem num recarregamento
// (bug corrigido: o toque em "Enviar mensagem" dependia de uma resposta de
// rede pra saber a mensagem, e no Safari/iOS isso quebra o "gesto do
// usuário" que autoriza copiar pra área de transferência e abrir outra
// aba — a mensagem e o link precisam estar prontos ANTES do toque, ver
// FilaView.tsx/handleSend). Idempotente: se o item já tem
// `assignedMessage`, devolve ele tal como está, sem sortear/gravar de
// novo — é isso que garante que "Desfazer" devolve a mesma mensagem (ela
// nunca é apagada, só o status/sentAt/approachLogId voltam) e que um
// "Pular" faz o PRÓXIMO item ganhar a dele só quando ele mesmo virar o
// ativo (nunca atribui adiantado pros 2 cards de prévia, que não têm
// botão nenhum pra precisar disso).
async function ensureApproachItemMessageAssigned(
  clinicId: string,
  item: { id: string; name: string | null; assignedMessage: string | null; assignedMessageSlot: number | null }
): Promise<{ message: string; slot: number } | null> {
  if (item.assignedMessage) return { message: item.assignedMessage, slot: item.assignedMessageSlot! };

  const [config, messagesConfig] = await Promise.all([getOrCreateApproachQueueConfig(clinicId), getApproachMessagesConfig(clinicId)]);
  const availableSlots = resolveAvailableApproachSlots([messagesConfig?.message1, messagesConfig?.message2, messagesConfig?.message3, messagesConfig?.message4, messagesConfig?.message5]);
  if (availableSlots.length === 0) return null;

  const slot = pickNextApproachMessageSlot(availableSlots, config.lastMessageSlot);
  const template = [messagesConfig?.message1, messagesConfig?.message2, messagesConfig?.message3, messagesConfig?.message4, messagesConfig?.message5][slot - 1]!;
  const message = fillApproachMessageTemplate(template, item.name);

  await Promise.all([
    prisma.approachQueueItem.update({ where: { id: item.id }, data: { assignedMessage: message, assignedMessageSlot: slot } }),
    prisma.approachQueueConfig.update({ where: { clinicId }, data: { lastMessageSlot: slot } }),
  ]);

  return { message, slot };
}

// Snapshot de UMA conta — reaproveitado tanto pelo board inteiro
// (getApproachBoard) quanto pelas actions de enviar/desfazer/pular/pausar
// (cada uma devolve o snapshot só da conta que mexeu, pro cliente atualizar
// aquele card sem precisar recarregar o board inteiro).
export async function getApproachBoardAccount(clinicId: string, now: Date = new Date(), window?: ApproachWindow): Promise<ApproachBoardAccount | null> {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { id: true, name: true, instagramAccount: { select: { igUsername: true, profilePictureUrl: true } } },
  });
  if (!clinic) return null;

  const [config, sentToday, leadsRemaining, rawItems, resolvedWindow] = await Promise.all([
    getOrCreateApproachQueueConfig(clinicId),
    countApproachedToday(clinicId, now),
    countApproachQueueRemaining(clinicId),
    // Cada clínica participante tem sempre só 1 lead ativo na tela (o
    // próximo @ dela) — a fila de preparação pode ter mais itens atrás
    // dele, mas só o da frente aparece no board (ver DESIGN.md "3 cards").
    prisma.approachQueueItem.findMany({
      where: { clinicId, status: "QUEUED" },
      orderBy: { createdAt: "asc" },
      take: 1,
      select: { id: true, username: true, name: true, assignedMessage: true, assignedMessageSlot: true },
    }),
    window ? Promise.resolve(window) : getApproachWindow(),
  ]);
  const state = computeApproachAccountState({
    now,
    paused: config.paused,
    dailyLimit: config.dailyLimit,
    sentToday,
    lockedUntil: config.lockedUntil,
    batchPausedUntil: config.batchPausedUntil,
    windowStartMinute: resolvedWindow.startMinute,
    windowEndMinute: resolvedWindow.endMinute,
  });

  const front = rawItems[0];
  const assigned = front ? await ensureApproachItemMessageAssigned(clinicId, front) : null;

  const items: ApproachBoardItem[] = front
    ? [
        {
          id: front.id,
          username: front.username,
          name: front.name,
          message: assigned?.message ?? null,
          dmLink: assigned ? buildInstagramDmLink(front.username, assigned.message) : null,
        },
      ]
    : [];

  return {
    clinicId: clinic.id,
    name: clinic.name,
    igUsername: clinic.instagramAccount?.igUsername ?? null,
    profilePictureUrl: clinic.instagramAccount?.profilePictureUrl ?? null,
    dailyLimit: config.dailyLimit,
    sentToday,
    leadsRemaining,
    state,
    items,
  };
}

// Quantos cards aparecem ao mesmo tempo na tela da Fila (rodada 7: 3 -> 5,
// só ajuste de quantidade/altura — ver DESIGN.md "rodada 7").
export const APPROACH_BOARD_MAX_ACCOUNTS = 5;

// Escolhe até APPROACH_BOARD_MAX_ACCOUNTS clínicas pra mostrar na tela: só
// as que têm lead ativo (sem isso, não há "próximo @" pra mostrar no
// card), liberadas primeiro, depois em espera/pausa da que volta mais cedo
// pra mais tarde (ver approachAccountSortKey, approach-queue.ts, e
// DESIGN.md "3/5 cards").
export async function getApproachBoard(now: Date = new Date()): Promise<{ accounts: ApproachBoardAccount[]; window: ApproachWindow }> {
  const [clinics, window] = await Promise.all([
    prisma.clinic.findMany({
      where: { approachQueueConfig: { is: { activeInQueue: true } } },
      select: { id: true },
      orderBy: { name: "asc" },
    }),
    getApproachWindow(),
  ]);
  const accounts = await Promise.all(clinics.map((c) => getApproachBoardAccount(c.id, now, window)));
  const withLead = accounts.filter((a): a is ApproachBoardAccount => a !== null && a.items.length > 0);
  withLead.sort((a, b) => approachAccountSortKey(a.state) - approachAccountSortKey(b.state));
  return { accounts: withLead.slice(0, APPROACH_BOARD_MAX_ACCOUNTS), window };
}

// ---------------------------------------------------------------------------
// Enviar / desfazer / pular
// ---------------------------------------------------------------------------

export type ConfirmApproachSendResult =
  | { ok: true }
  | { ok: false; reason: "outside_hours" | "paused" | "limit_reached" | "batch_paused" | "waiting" | "not_found" | "already_handled" };

// Registra um envio que o CLIENTE já executou (copiou a mensagem e abriu o
// Instagram ANTES de chamar isto — ver FilaView.tsx/handleSend e o
// comentário grande em ApproachQueueItem.assignedMessage, schema.prisma).
// Recebe o `itemId` exato que foi mostrado/tocado (nunca "o primeiro da
// fila" de novo — evita registrar o item errado numa corrida com um Pular
// concorrente) e só precisa: conferir de novo horário/pausa/limite/espera
// (nunca confia só na UI, mesmo padrão de sempre no projeto) e fazer o
// claim atômico anti duplo-toque (updateMany condicionado em status
// QUEUED — mesmo padrão de sendReactivationWhatsAppMessage, reactivation.ts).
// NUNCA sorteia mensagem aqui — ela já foi atribuída e persistida bem
// antes, em ensureApproachItemMessageAssigned (board).
export async function confirmApproachSend(clinicId: string, itemId: string, now: Date = new Date()): Promise<ConfirmApproachSendResult> {
  const [config, sentToday, item, window, timing] = await Promise.all([
    getOrCreateApproachQueueConfig(clinicId),
    countApproachedToday(clinicId, now),
    prisma.approachQueueItem.findUnique({ where: { id: itemId } }),
    getApproachWindow(),
    getApproachTimingSettings(),
  ]);

  const state = computeApproachAccountState({
    now,
    paused: config.paused,
    dailyLimit: config.dailyLimit,
    sentToday,
    lockedUntil: config.lockedUntil,
    batchPausedUntil: config.batchPausedUntil,
    windowStartMinute: window.startMinute,
    windowEndMinute: window.endMinute,
  });
  if (state.kind === "OUTSIDE_HOURS") return { ok: false, reason: "outside_hours" };
  if (state.kind === "PAUSED") return { ok: false, reason: "paused" };
  if (state.kind === "LIMIT_REACHED") return { ok: false, reason: "limit_reached" };
  if (state.kind === "BATCH_PAUSED") return { ok: false, reason: "batch_paused" };
  if (state.kind === "WAITING") return { ok: false, reason: "waiting" };
  if (!item || item.clinicId !== clinicId) return { ok: false, reason: "not_found" };

  // Claim atômico — só conta a 1ª chamada concorrente pra ESTE item;
  // toque duplo (ou um Pular que chegou primeiro) vira "already_handled",
  // nunca registrado duas vezes nem contado por engano depois de pulado.
  const claim = await prisma.approachQueueItem.updateMany({
    where: { id: itemId, status: "QUEUED" },
    data: { status: "SENT", sentAt: now },
  });
  if (claim.count === 0) return { ok: false, reason: "already_handled" };

  const todayStart = startOfApproachDay(now);
  const log = await prisma.approachLog.create({ data: { clinicId, loggedDate: todayStart, count: 1 } });

  // Se a pausa de lote anterior já tinha vencido, este envio começa um
  // lote novo do zero em vez de simplesmente continuar somando em cima do
  // valor antigo (ver DESIGN.md "pausa do lote").
  const batchExpired = config.batchPausedUntil !== null && config.batchPausedUntil.getTime() <= now.getTime();
  const nextBatchSentCount = (batchExpired ? 0 : config.batchSentCount) + 1;
  const nextBatchPausedUntil =
    timing.batchPauseHours > 0 && nextBatchSentCount >= timing.batchSize
      ? new Date(now.getTime() + timing.batchPauseHours * 3600_000)
      : null;

  await Promise.all([
    prisma.approachQueueItem.update({ where: { id: itemId }, data: { approachLogId: log.id } }),
    prisma.approachQueueConfig.update({
      where: { clinicId },
      data: {
        lockedUntil: new Date(now.getTime() + randomApproachWaitMs(timing.waitMinMinutes, timing.waitMaxMinutes)),
        batchSentCount: nextBatchSentCount,
        batchPausedUntil: nextBatchPausedUntil,
      },
    }),
  ]);

  return { ok: true };
}

// "Não enviei · Desfazer" — só o envio MAIS RECENTE desta clínica (sempre
// o card que acabou de ficar em espera; nunca existe mais de um "em voo"
// por clínica, já que só o card da frente tem botão). Devolve o item pro
// topo da fila (basta voltar status->QUEUED: createdAt dele continua sendo
// o mais antigo entre os QUEUED, porque qualquer lead novo entra DEPOIS —
// ver comentário grande em ApproachQueueItem, schema.prisma), apaga a
// linha de ApproachLog criada por aquele envio e libera a conta na hora.
export async function undoLastApproachSend(clinicId: string): Promise<{ ok: boolean }> {
  const [config, lastSent] = await Promise.all([
    getOrCreateApproachQueueConfig(clinicId),
    prisma.approachQueueItem.findFirst({ where: { clinicId, status: "SENT" }, orderBy: { sentAt: "desc" } }),
  ]);
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
  // Regra única pra qualquer desfazer: volta o contador do lote em 1 e
  // cancela a pausa de lote (se não havia pausa, limpar null é inofensivo)
  // — cobre tanto o "desfazer comum" quanto o "desfazer do envio que fechou
  // o lote" (volta pra 29 e libera na hora), ver DESIGN.md "pausa do lote".
  await prisma.approachQueueConfig.update({
    where: { clinicId },
    data: { lockedUntil: null, batchPausedUntil: null, batchSentCount: Math.max(0, config.batchSentCount - 1) },
  });
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
