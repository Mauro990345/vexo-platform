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

const USERNAME_HEADER_HINTS = ["usuario", "usuário", "username", "user", "instagram", "@", "handle", "perfil", "conta"];
const NAME_HEADER_HINTS = ["nome", "name"];

function normalizeHeaderCell(cell: string): string {
  return cell
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Linhas de tabela (CSV ou XLSX, já extraídas como células) → lista de
// {username, name}. Detecta as colunas pelo CABEÇALHO (1ª linha) quando
// algum título bate com os termos conhecidos; sem bater nenhum, assume a
// 1ª coluna = usuário e a 2ª (se houver) = nome — não existe "origem"
// (seguidor/curtiu/comentou) pra detectar, pedido explícito: todos os leads
// são iguais.
export function resolveApproachUploadRows(rows: string[][]): ApproachUploadRow[] {
  if (rows.length === 0) return [];

  const header = rows[0]!.map(normalizeHeaderCell);
  let usernameCol = header.findIndex((h) => USERNAME_HEADER_HINTS.some((hint) => h.includes(hint)));
  let nameCol = header.findIndex((h) => NAME_HEADER_HINTS.some((hint) => h.includes(hint)));
  const headerMatched = usernameCol !== -1;

  let dataRows = rows;
  if (headerMatched) {
    dataRows = rows.slice(1);
  } else {
    usernameCol = 0;
    nameCol = rows[0]!.length > 1 ? 1 : -1;
  }

  const result: ApproachUploadRow[] = [];
  for (const cells of dataRows) {
    const usernameRaw = cells[usernameCol]?.trim();
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
// Horário permitido (7h-20h, São Paulo) + zerar à meia-noite
// ---------------------------------------------------------------------------

export const APPROACH_WINDOW_START_HOUR = 7;
export const APPROACH_WINDOW_END_HOUR = 20;

function saoPauloHour(now: Date): number {
  const shifted = new Date(now.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return shifted.getUTCHours();
}

// [7h, 20h) em São Paulo — às 20h em ponto já está fora (pedido explícito:
// "das 7h às 20h").
export function isWithinApproachHours(now: Date): boolean {
  const hour = saoPauloHour(now);
  return hour >= APPROACH_WINDOW_START_HOUR && hour < APPROACH_WINDOW_END_HOUR;
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
}): ApproachAccountState {
  if (!isWithinApproachHours(params.now)) return { kind: "OUTSIDE_HOURS" };
  if (params.paused) return { kind: "PAUSED" };
  if (params.sentToday >= params.dailyLimit) return { kind: "LIMIT_REACHED" };
  if (params.lockedUntil && params.lockedUntil.getTime() > params.now.getTime()) {
    return { kind: "WAITING", msRemaining: params.lockedUntil.getTime() - params.now.getTime() };
  }
  return { kind: "READY" };
}
