import { SAO_PAULO_UTC_OFFSET_HOURS } from "@/lib/timezone";

// Fila de abordagem (1ª mensagem manual, pelo Instagram do celular) — ver
// DESIGN.md. Este arquivo separa a lógica PURA (testável sem Prisma, mesmo
// padrão de reactivation.ts/report-period.ts) das funções com banco, que
// ficam em approach-queue-db.ts.

// ---------------------------------------------------------------------------
// Normalização / parsing
// ---------------------------------------------------------------------------

// Chave de deduplicação: sem "@", minúsculo, sem espaço nas pontas. "@Fulano"
// e "fulano " são o mesmo lead pra todos os efeitos (upload duplicado, já
// recebeu mensagem, já tem conversa).
export function normalizeApproachUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

// Primeiro nome da lista de upload (pedido explícito: "usar apenas o
// PRIMEIRO nome") — null sem nome (o {nome} fica visível no texto pra quem
// está enviando corrigir na hora, ver fillApproachMessageTemplate).
export function firstNameOf(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0]!;
}

export type ApproachUploadRow = { username: string; name: string | null };

// Parser de CSV minimalista (sem dependência externa): suporta campos entre
// aspas (com aspas escapadas "") e vírgula como separador — suficiente pro
// formato esperado aqui (uma coluna de @ e opcionalmente uma de nome, sem
// texto livre longo). Sempre devolve a mesma quantidade de colunas por
// linha não é garantido (linhas mais curtas só têm menos células) —
// resolveApproachUploadRows abaixo lida com isso.
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\n") {
      pushRow();
    } else if (c === "\r") {
      // ignora — \r\n tratado só pelo \n
    } else {
      field += c;
    }
  }
  // Última linha sem quebra final
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

// Comparados DEPOIS de normalizeHeaderCell (minúsculo, sem acento, sem
// pontuação/espaço/underscore) — "Usuário", "USER NAME" e "user_name" todos
// viram formas comparáveis aqui. Lista pedida explicitamente: @ / username /
// user / usuário / usuario / handle (coluna de @) e name / nome / full_name /
// fullname / nome completo (coluna de nome).
const USERNAME_HEADER_TOKENS = new Set(["usuario", "username", "user", "handle", "instagram", "perfil", "conta"]);
const NAME_HEADER_TOKENS = new Set(["nome", "name", "fullname", "nomecompleto"]);

function normalizeHeaderCell(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // acentos
    .replace(/[^a-z0-9]/g, ""); // espaço/underscore/pontuação — "full_name"/"nome completo" -> "fullname"/"nomecompleto"
}

// Igualdade EXATA (nunca .includes/substring) — essencial: um @ real de
// lead pode conter por acaso um pedaço de uma das palavras-chave (ex.: um
// username como "novo_user_99" contém "user"), e um match por substring
// tratava essa 1ª linha de dados como se fosse cabeçalho, descartando um
// lead de verdade silenciosamente (bug real encontrado em produção — 3
// leads enviados, só 1 chegou na fila). Comparar a célula INTEIRA (já
// normalizada) contra o conjunto de tokens conhecidos elimina esse falso
// positivo por completo.
function isUsernameHeaderCell(cell: string): boolean {
  if (cell.trim() === "@") return true; // normalizeHeaderCell tira todo não-alfanumérico, "@" sozinho viraria "" e nunca bateria
  return USERNAME_HEADER_TOKENS.has(normalizeHeaderCell(cell));
}

function isNameHeaderCell(cell: string): boolean {
  return NAME_HEADER_TOKENS.has(normalizeHeaderCell(cell));
}

// Linhas de tabela (CSV, já extraída como células) → lista de
// {username, name}. Detecta as colunas pelo CABEÇALHO (1ª linha) só quando
// alguma célula bate EXATAMENTE com um token conhecido (ver matchesAnyToken
// acima). SEM header reconhecido, trata o arquivo inteiro (inclusive a 1ª
// linha) como uma lista simples de @ — 1ª coluna de cada linha, sem nome
// nenhum (pedido explícito: "se o arquivo não tiver cabeçalho, trate como
// lista de @, um por linha") — nunca tenta adivinhar uma 2ª coluna como
// nome nesse caso, pra não arriscar sacrificar a 1ª linha de novo. Não
// existe "origem" (seguidor/curtiu/comentou) pra detectar — todos os leads
// são iguais.
export function resolveApproachUploadRows(rows: string[][]): ApproachUploadRow[] {
  if (rows.length === 0) return [];

  const header = rows[0]!;
  const usernameCol = header.findIndex(isUsernameHeaderCell);
  const headerMatched = usernameCol !== -1;
  const nameCol = headerMatched ? header.findIndex(isNameHeaderCell) : -1;

  const dataRows = headerMatched ? rows.slice(1) : rows;
  const col = headerMatched ? usernameCol : 0;

  const result: ApproachUploadRow[] = [];
  for (const cells of dataRows) {
    const usernameRaw = cells[col]?.trim();
    if (!usernameRaw) continue;
    const nameRaw = nameCol !== -1 ? cells[nameCol]?.trim() : undefined;
    result.push({ username: usernameRaw, name: nameRaw || null });
  }
  return result;
}

// TXT: um @ por linha, sem coluna de nome.
export function parseApproachUsernamesTxt(text: string): ApproachUploadRow[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((username) => ({ username, name: null }));
}

// ---------------------------------------------------------------------------
// Horário permitido (configurável — padrão 7h-20h, São Paulo) + zerar à
// meia-noite
// ---------------------------------------------------------------------------

// Padrão até o admin salvar outro valor na tela de Preparação (ver
// ApproachWindowSettings, singleton igual a FollowUpSettings) — minutos
// desde a meia-noite, mesma convenção de FollowUpSettings.windowStart/EndMinute.
export const DEFAULT_APPROACH_WINDOW_START_MINUTE = 7 * 60; // 07:00
export const DEFAULT_APPROACH_WINDOW_END_MINUTE = 20 * 60; // 20:00

function saoPauloMinuteOfDay(now: Date): number {
  const shifted = new Date(now.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

// [startMinute, endMinute) em São Paulo — no minuto exato do fim já está
// fora (pedido explícito, mesma convenção semiaberta usada em todo o
// sistema, ver report-period.ts). Vale pra TODAS as clínicas — um horário
// só, nunca por clínica (ver UI em AbordagemPrepView.tsx).
export function isWithinApproachHours(
  now: Date,
  startMinute: number = DEFAULT_APPROACH_WINDOW_START_MINUTE,
  endMinute: number = DEFAULT_APPROACH_WINDOW_END_MINUTE
): boolean {
  const minute = saoPauloMinuteOfDay(now);
  return minute >= startMinute && minute < endMinute;
}

function formatApproachClockTime(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

// "7h às 20h" / "7h30 às 19h45" — rótulo do aviso "Fora do horário" na
// Fila, sempre a partir do valor salvo (nunca um texto fixo, pedido
// explícito desta rodada).
export function formatApproachWindowLabel(startMinute: number, endMinute: number): string {
  return `${formatApproachClockTime(startMinute)} às ${formatApproachClockTime(endMinute)}`;
}

// "HH:MM" (valor de <input type="time">) -> minutos desde a meia-noite —
// mesmo formato/validação de parseTimeToMinutes (follow-up/actions.ts),
// cópia própria aqui pra poder validar o par start<end sem depender de
// Prisma (ver validateApproachWindow abaixo).
export function parseApproachTimeToMinutes(value: string, label: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) throw new Error(`${label} inválido — use o formato HH:MM.`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) throw new Error(`${label} inválido.`);
  return hours * 60 + minutes;
}

// Valida o par (início < fim) — pedido explícito. Lançado tanto da UI de
// Preparação quanto reutilizável em teste sem precisar montar um FormData.
export function validateApproachWindow(startMinute: number, endMinute: number): void {
  if (startMinute >= endMinute) {
    throw new Error("O horário inicial precisa ser antes do horário final.");
  }
}

// Início do dia civil em São Paulo (00:00 BRT) — mesmo deslocamento fixo de
// startOfBrazilDay (timezone.ts), reaproveitado aqui só pra não criar outra
// cópia da mesma conta; "zera à meia-noite" nunca precisa de um contador
// resetado por um cron: o contador do dia é sempre reconstruído contando
// ApproachQueueItem.sentAt >= este instante (ver countApproachedToday,
// approach-queue-db.ts).
export function startOfApproachDay(now: Date): Date {
  const shifted = new Date(now.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));
}

// ---------------------------------------------------------------------------
// Espera aleatória entre envios (padrão 1-2min) e pausa de lote (padrão a
// cada 30 envios, 2h) — ambas configuráveis na tela de Preparação, ver
// ApproachTimingSettings (singleton, mesmo padrão de ApproachWindowSettings)
// ---------------------------------------------------------------------------

export const DEFAULT_APPROACH_WAIT_MIN_MINUTES = 1;
export const DEFAULT_APPROACH_WAIT_MAX_MINUTES = 2;
export const DEFAULT_APPROACH_BATCH_SIZE = 30;
export const DEFAULT_APPROACH_BATCH_PAUSE_HOURS = 2;

// Sorteada de novo a cada envio (pedido explícito) — `rand` injetável só
// pros testes (checar os limites sem depender de Math.random real).
export function randomApproachWaitMs(
  waitMinMinutes: number = DEFAULT_APPROACH_WAIT_MIN_MINUTES,
  waitMaxMinutes: number = DEFAULT_APPROACH_WAIT_MAX_MINUTES,
  rand: () => number = Math.random
): number {
  const minMs = waitMinMinutes * 60_000;
  const maxMs = waitMaxMinutes * 60_000;
  return minMs + Math.floor(rand() * (maxMs - minMs + 1));
}

// "m:ss" pro botão "Aguarde m:ss" — nunca negativo (0:00 quando já passou,
// a UI troca pro estado liberado no próximo recarregamento/ação).
export function formatApproachCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// "H:MM:SS" pro botão "Pausa H:MM:SS" (pausa de lote, até algumas horas —
// formato diferente de formatApproachCountdown de propósito, pra nunca
// mostrar um número de minutos de 3 dígitos tipo "118:00").
export function formatApproachPauseCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// Quantos @ ainda faltam enviar numa clínica (status QUEUED — não enviado,
// não pulado, inclui o que está ativo no card) vira uma estimativa de
// "pra quantos dias dá" dividindo pelo limite por dia (pedido explícito:
// "pra saber quando reabastecer a lista"). Arredonda pra inteiro só
// quando passa de 3 dias (ex. "uns 5 dias"); entre 1 e 3 dias mostra 1
// casa decimal com vírgula, no singular (ex. "uns 1,5 dia", igual ao
// exemplo pedido); abaixo de 1 dia nunca mostra fração enganosa de "quase
// lá", só "menos de 1 dia". Fila vazia é um caso próprio (nunca "uns 0
// dias" nem "menos de 1 dia").
export function formatApproachDaysRemainingLabel(leadsRemaining: number, dailyLimit: number): string {
  if (leadsRemaining <= 0) return "Fila vazia";
  const days = leadsRemaining / dailyLimit;
  if (days < 1) return "menos de 1 dia";
  if (days <= 3) return `uns ${(Math.round(days * 10) / 10).toFixed(1).replace(".", ",")} dia`;
  return `uns ${Math.round(days)} dias`;
}

// Nível de urgência pra colorir o contador (ver DESIGN.md "Preparação —
// contador de leads restantes"): normal (cinza claro) com 2 dias ou mais
// de sobra; aviso (amarelo) abaixo de 2 dias; perigo (vermelho) abaixo de
// 1 dia OU fila vazia — mesmos limiares usados no texto acima, só que em
// forma de nível pra UI escolher a cor certa sem reimplementar a conta.
export type ApproachQueueLevel = "normal" | "warning" | "danger";

export function approachQueueLevel(leadsRemaining: number, dailyLimit: number): ApproachQueueLevel {
  if (leadsRemaining <= 0) return "danger";
  const days = leadsRemaining / dailyLimit;
  if (days < 1) return "danger";
  if (days < 2) return "warning";
  return "normal";
}

// "HH:MM"/minutos/inteiros da tela de Preparação -> validação com mensagem
// curta, pedido explícito (mínimo <= máximo, mínimo >= 1min, lote >= 1,
// pausa >= 0 — 0 = sem pausa). Validado tanto na UI quanto de novo no
// servidor (updateApproachTimingAction), nunca confia só na tela.
export function validateApproachTiming(params: { waitMinMinutes: number; waitMaxMinutes: number; batchSize: number; batchPauseHours: number }): void {
  if (!Number.isFinite(params.waitMinMinutes) || !Number.isFinite(params.waitMaxMinutes) || !Number.isFinite(params.batchSize) || !Number.isFinite(params.batchPauseHours)) {
    throw new Error("Preencha todos os campos com números válidos.");
  }
  if (params.waitMinMinutes < 1) throw new Error("A espera mínima precisa ser de pelo menos 1 minuto.");
  if (params.waitMinMinutes > params.waitMaxMinutes) throw new Error("A espera mínima precisa ser menor ou igual à máxima.");
  if (params.batchSize < 1) throw new Error("Envios por lote precisa ser pelo menos 1.");
  if (params.batchPauseHours < 0) throw new Error("A pausa não pode ser negativa (0 = sem pausa).");
}

// ---------------------------------------------------------------------------
// Sorteio de mensagem (sem repetir a mesma duas vezes seguidas)
// ---------------------------------------------------------------------------

// Slots (1-5) com texto preenchido — mesmo formato de
// resolveAvailableReactivationSlots (reactivation.ts), sem fallback pra
// defaults (aqui não existe mensagem padrão: sem nenhuma preenchida, a
// clínica simplesmente não aparece na Fila, ver resolveApproachMessages).
export function resolveAvailableApproachSlots(messages: (string | null | undefined)[]): number[] {
  const slots: number[] = [];
  messages.forEach((msg, idx) => {
    if (msg && msg.trim()) slots.push(idx + 1);
  });
  return slots;
}

// Sorteado (nunca em sequência fixa, ao contrário do rodízio de Reativação,
// ver assignNextReactivationSlot) — com 2+ slots disponíveis, nunca repete
// o `lastSlot` imediatamente anterior; com só 1 slot, a repetição é
// inevitável (não há outra opção, só o que existe). `rand` injetável pros
// testes.
export function pickNextApproachMessageSlot(availableSlots: number[], lastSlot: number | null, rand: () => number = Math.random): number {
  if (availableSlots.length === 0) {
    throw new Error("Nenhuma mensagem configurada para esta clínica.");
  }
  if (availableSlots.length === 1) return availableSlots[0]!;

  const candidates = lastSlot === null ? availableSlots : availableSlots.filter((slot) => slot !== lastSlot);
  const pickFrom = candidates.length > 0 ? candidates : availableSlots;
  const index = Math.floor(rand() * pickFrom.length);
  return pickFrom[Math.min(index, pickFrom.length - 1)]!;
}

// Troca {nome} pelo primeiro nome do lead — sem nome, o placeholder fica
// visível de propósito (pedido explícito: "eu troco na hora").
export function fillApproachMessageTemplate(template: string, name: string | null): string {
  const first = firstNameOf(name);
  return first ? template.replaceAll("{nome}", first) : template;
}

// ---------------------------------------------------------------------------
// Estado da conta (cor do círculo no topo da Fila)
// ---------------------------------------------------------------------------

export type ApproachAccountState =
  | { kind: "OUTSIDE_HOURS" }
  | { kind: "PAUSED" }
  | { kind: "LIMIT_REACHED" }
  | { kind: "BATCH_PAUSED"; msRemaining: number }
  | { kind: "WAITING"; msRemaining: number }
  | { kind: "READY" };

// Ordem de prioridade pedida: fora do horário cobre tudo (nenhuma conta
// libera fora da janela, mesmo com uma pausa de lote já vencida — "se a
// pausa terminar fora do horário, continua bloqueada pelo horário");
// dentro do horário, pausada manualmente > limite do dia > pausa de lote
// (30 envios, mais longa) > espera entre mensagens (mais curta) > liberada.
// `lockedUntil`/`batchPausedUntil` só importam enquanto ainda no futuro —
// passado = já liberou daquele lado específico, mas os outros gates ainda
// se aplicam (daí a ordem: limite do dia continua valendo por cima mesmo
// com a pausa de lote já vencida).
export function computeApproachAccountState(params: {
  now: Date;
  paused: boolean;
  dailyLimit: number;
  sentToday: number;
  lockedUntil: Date | null;
  batchPausedUntil: Date | null;
  windowStartMinute?: number;
  windowEndMinute?: number;
}): ApproachAccountState {
  if (!isWithinApproachHours(params.now, params.windowStartMinute, params.windowEndMinute)) return { kind: "OUTSIDE_HOURS" };
  if (params.paused) return { kind: "PAUSED" };
  if (params.sentToday >= params.dailyLimit) return { kind: "LIMIT_REACHED" };
  if (params.batchPausedUntil && params.batchPausedUntil.getTime() > params.now.getTime()) {
    return { kind: "BATCH_PAUSED", msRemaining: params.batchPausedUntil.getTime() - params.now.getTime() };
  }
  if (params.lockedUntil && params.lockedUntil.getTime() > params.now.getTime()) {
    return { kind: "WAITING", msRemaining: params.lockedUntil.getTime() - params.now.getTime() };
  }
  return { kind: "READY" };
}

// ---------------------------------------------------------------------------
// Estimativa de liberação dos itens EMPILHADOS atrás do ativo (Fila por
// clínica, /crm/clinicas/[id]/abordagem/fila — pedido explícito: mostrar os
// próximos 4-5 leads, só o 1º com botão clicável, os de baixo esmaecidos
// com uma contagem de quando devem liberar)
// ---------------------------------------------------------------------------

// NUNCA uma promessa exata — o único instante real é frontMsRemaining (o
// `lockedUntil`/`batchPausedUntil` JÁ GRAVADO, ver computeApproachAccountState
// acima); o espaçamento REAL entre os próximos envios só é sorteado
// (randomApproachWaitMs) no momento em que cada um sai de verdade, nunca
// antes. Esta função projeta uma estimativa PURAMENTE VISUAL assumindo o
// cenário "liberou, enviou na hora, esperou a média configurada" repetido
// item a item — serve só pra dar uma ideia de quando cada card deve ficar
// pronto, NUNCA decide se o botão é clicável (isso continua sendo só o
// item 0, o ativo de verdade — ver ClinicFilaView.tsx). Errar pra mais ou
// pra menos aqui nunca quebra a regra de "só um envio por vez liberado".
//
// Pausa de lote: cruza a mesma fronteira que confirmApproachSend usa de
// verdade (nextBatchSentCount >= batchSize) — cada item hipotético conta
// como +1 no lote; ao cruzar o tamanho do lote, soma a pausa inteira e
// zera a contagem (mesmo reset que acontece de verdade quando uma pausa
// vencida é detectada no próximo envio real).
export function estimateQueuedItemsMsRemaining(params: {
  frontMsRemaining: number; // 0 quando o item ativo já está READY agora
  itemCount: number; // total de itens, incluindo o ativo (índice 0)
  batchSentCount: number; // envios já contados no lote ATUAL (ApproachQueueConfig.batchSentCount)
  batchSize: number;
  batchPauseMs: number; // 0 = pausa de lote desligada
  waitMinMs: number;
  waitMaxMs: number;
}): number[] {
  const avgWaitMs = (params.waitMinMs + params.waitMaxMs) / 2;
  const results: number[] = [];
  let cumulativeMs = Math.max(0, params.frontMsRemaining);
  let batchCount = params.batchSentCount;

  for (let index = 0; index < params.itemCount; index++) {
    if (index > 0) {
      cumulativeMs += avgWaitMs;
      batchCount += 1;
      if (params.batchPauseMs > 0 && batchCount >= params.batchSize) {
        cumulativeMs += params.batchPauseMs;
        batchCount = 0;
      }
    }
    results.push(Math.round(cumulativeMs));
  }
  return results;
}

// "1min 20s" / "2h05min" / "45s" — rótulo da estimativa (ver
// estimateQueuedItemsMsRemaining acima) nos itens empilhados da Fila por
// clínica. Formato DIFERENTE de propósito de formatApproachCountdown
// ("m:ss", o botão "Aguarde" do item ATIVO) — esse aqui é só uma prévia
// visual, não um relógio de verdade, então escreve por extenso (pedido
// explícito, ver DESIGN.md) em vez do formato compacto do cronômetro real.
export function formatApproachEstimateLabel(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.round(msRemaining / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h${String(minutes).padStart(2, "0")}min`;
  if (minutes > 0) return `${minutes}min ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

// ---------------------------------------------------------------------------
// Ordem dos cards na Fila: liberadas primeiro, depois espera/pausa da que
// volta mais cedo pra que volta mais tarde — ver DESIGN.md
// ---------------------------------------------------------------------------

// Chave de ordenação ASCENDENTE — READY sempre primeiro (chave negativa);
// WAITING/BATCH_PAUSED pelo próprio ms restante (naturalmente intercalados:
// uma espera curta de 1min sempre vem antes de uma pausa de lote de 2h, sem
// precisar tratar os dois tipos separadamente); LIMIT_REACHED/PAUSED/
// OUTSIDE_HOURS não têm "volta às" automático previsível pra esta tela,
// então ficam depois de qualquer espera/pausa (ordem relativa entre eles
// não foi pedida — PAUSED manual por último, por nunca voltar sozinho).
export function approachAccountSortKey(state: ApproachAccountState): number {
  switch (state.kind) {
    case "READY":
      return -1;
    case "WAITING":
    case "BATCH_PAUSED":
      return state.msRemaining;
    case "LIMIT_REACHED":
      return Number.MAX_SAFE_INTEGER - 2;
    case "OUTSIDE_HOURS":
      return Number.MAX_SAFE_INTEGER - 1;
    case "PAUSED":
      return Number.MAX_SAFE_INTEGER;
  }
}
