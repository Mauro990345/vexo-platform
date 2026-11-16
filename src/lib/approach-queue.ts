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
// Espera aleatória (3-5 min) entre envios
// ---------------------------------------------------------------------------

export const APPROACH_WAIT_MIN_MS = 3 * 60 * 1000;
export const APPROACH_WAIT_MAX_MS = 5 * 60 * 1000;

// Sorteada de novo a cada envio (pedido explícito) — `rand` injetável só
// pros testes (checar os limites sem depender de Math.random real).
export function randomApproachWaitMs(rand: () => number = Math.random): number {
  return APPROACH_WAIT_MIN_MS + Math.floor(rand() * (APPROACH_WAIT_MAX_MS - APPROACH_WAIT_MIN_MS + 1));
}

// "m:ss" pro botão "Aguarde m:ss" — nunca negativo (0:00 quando já passou,
// a UI troca pro estado liberado no próximo recarregamento/ação).
export function formatApproachCountdown(msRemaining: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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
  | { kind: "WAITING"; msRemaining: number }
  | { kind: "READY" };

// Ordem de prioridade pedida: fora do horário cobre tudo (nenhuma conta
// libera fora de 7h-20h); dentro do horário, pausada > limite > espera >
// liberada. `sentToday`/`dailyLimit` decidem o dourado; `lockedUntil`
// decide o cinza-aguardando (só importa quando ainda está no futuro —
// passado = já liberou, vira READY).
export function computeApproachAccountState(params: {
  now: Date;
  paused: boolean;
  dailyLimit: number;
  sentToday: number;
  lockedUntil: Date | null;
  windowStartMinute?: number;
  windowEndMinute?: number;
}): ApproachAccountState {
  if (!isWithinApproachHours(params.now, params.windowStartMinute, params.windowEndMinute)) return { kind: "OUTSIDE_HOURS" };
  if (params.paused) return { kind: "PAUSED" };
  if (params.sentToday >= params.dailyLimit) return { kind: "LIMIT_REACHED" };
  if (params.lockedUntil && params.lockedUntil.getTime() > params.now.getTime()) {
    return { kind: "WAITING", msRemaining: params.lockedUntil.getTime() - params.now.getTime() };
  }
  return { kind: "READY" };
}
