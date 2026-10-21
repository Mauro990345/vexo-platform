// Lógica PURA (sem PrismaClient, sem nenhum efeito colateral) do script
// prisma/report-conversations.ts — relatório SOMENTE LEITURA de conversas
// criadas num período; nunca escreve, atualiza nem apaga nada no banco.
// Separada num arquivo próprio só pra poder ser testada isoladamente, mesmo
// padrão dos scripts de limpeza desta sessão (ex.:
// all-failed-messages-cleanup-logic.ts) — a diferença aqui é que este
// script não apaga nada, só lê e formata.
//
// Sem import de "@/lib/timezone" de propósito: os scripts em prisma/ rodam
// via `npx tsx`, sem nenhuma garantia de que o alias "@/" do tsconfig
// resolve nesse contexto (nenhum script existente nesta pasta importa de
// src/lib) — a mesma fórmula fixa (-03:00, sem horário de verão desde
// 2019) é duplicada aqui de propósito, igual a outros pequenos helpers já
// duplicados entre os scripts de limpeza.
const SAO_PAULO_UTC_OFFSET_HOURS = 3;

export function formatBrazilDateTime(date: Date): string {
  const shifted = new Date(date.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ` +
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
  );
}

export function brazilDayKey(date: Date): string {
  return formatBrazilDateTime(date).slice(0, 10); // "AAAA-MM-DD"
}

export function startOfBrazilDay(date: Date): Date {
  const shifted = new Date(date.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate(), SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0)
  );
}

export const DEFAULT_REPORT_DAYS = 30;

export type ReportArgs = {
  days: number;
  clinic: string | null;
};

// Aceita --days=N e --clinic=<id ou nome>, em qualquer ordem — N inválido
// (não numérico, zero ou negativo) cai no default em vez de travar o
// script ou devolver um período sem sentido.
export function parseReportArgs(argv: string[]): ReportArgs {
  let days = DEFAULT_REPORT_DAYS;
  let clinic: string | null = null;

  for (const arg of argv) {
    const daysMatch = /^--days=(.+)$/.exec(arg);
    if (daysMatch) {
      const parsed = Number(daysMatch[1] ?? "");
      if (Number.isFinite(parsed) && parsed > 0) days = Math.floor(parsed);
      continue;
    }
    const clinicMatch = /^--clinic=(.+)$/.exec(arg);
    if (clinicMatch) {
      const value = (clinicMatch[1] ?? "").trim();
      clinic = value || null;
    }
  }

  return { days, clinic };
}

export type ReportPeriod = { start: Date; end: Date };

// Últimos N dias terminando AGORA — não dias de calendário fechados.
// `now` recebido por parâmetro (nunca new Date() direto aqui) pra ficar
// 100% determinístico em teste.
export function computeReportPeriod(now: Date, days: number): ReportPeriod {
  return { start: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), end: now };
}

export type ConversationStatusValue = "NEW" | "IN_CONVERSATION" | "SCHEDULED" | "FOLLOW_UP" | "NEEDS_HUMAN" | "LOST";

export type ConversationReportRow = {
  conversationId: string;
  createdAt: Date;
  leadId: string;
  leadLabel: string;
  clinicName: string;
  status: ConversationStatusValue;
  leadMessageCount: number;
  aiMessageCount: number;
};

// Nome de exibição do lead — mesma prioridade usada no resto do produto
// (ver leadDisplayParts, src/lib/lead-display.ts): nome real primeiro, @
// do Instagram como fallback, rótulo fixo se nenhum dos dois existir.
export function leadReportLabel(lead: { name: string | null; igUsername: string | null }): string {
  if (lead.name) return lead.name;
  if (lead.igUsername) return `@${lead.igUsername}`;
  return "(lead sem nome)";
}

// Pelo menos 1 mensagem REAL do lead — distingue de uma conversa que só
// tem mensagem automática (ex.: primeiro contato disparado pelo sistema,
// ou um follow-up cuja resposta ainda não chegou) — pedido explícito do
// item 5 do relatório.
export function hasRealLeadMessage(row: Pick<ConversationReportRow, "leadMessageCount">): boolean {
  return row.leadMessageCount > 0;
}

function padEndSafe(text: string, length: number): string {
  return text.length >= length ? text : text.padEnd(length);
}

// Uma linha de texto por conversa — ordem dos campos pedida no item 3:
// data/hora (BRT), lead, clínica, status, mensagens do lead, mensagens da
// IA, e a marcação do item 5 (engajamento real vs. só automático).
export function formatConversationLine(row: ConversationReportRow): string {
  const engagement = hasRealLeadMessage(row) ? "respondeu" : "SÓ AUTOMÁTICO (lead nunca respondeu)";
  return (
    `${formatBrazilDateTime(row.createdAt)}  ` +
    `${padEndSafe(row.leadLabel, 28)}  ` +
    `${padEndSafe(row.clinicName, 24)}  ` +
    `${padEndSafe(row.status, 15)}  ` +
    `lead=${row.leadMessageCount}  ia=${row.aiMessageCount}  ${engagement}`
  );
}

export type StatusSummaryEntry = { status: ConversationStatusValue; count: number };

const STATUS_ORDER: ConversationStatusValue[] = ["NEW", "IN_CONVERSATION", "SCHEDULED", "FOLLOW_UP", "NEEDS_HUMAN", "LOST"];

// Só os status que de fato apareceram no período, na ordem fixa do
// Pipeline (ver PIPELINE_COLUMNS, src/app/crm/clinicas/[id]/page.tsx) —
// nunca a ordem de inserção/alfabética, que mudaria a cada execução.
export function summarizeByStatus(rows: ConversationReportRow[]): StatusSummaryEntry[] {
  const counts = new Map<ConversationStatusValue, number>();
  for (const row of rows) counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
  return STATUS_ORDER.filter((status) => counts.has(status)).map((status) => ({ status, count: counts.get(status)! }));
}

export type DaySummaryEntry = { day: string; count: number }; // day = "AAAA-MM-DD" em BRT

// Agrupa por DIA em Brasília (nunca UTC — mesmo motivo de
// startOfBrazilDay, acima: uma conversa criada à noite em Brasília pode
// cair num dia UTC diferente). Inclui TODO dia do período, mesmo com zero
// conversas — o resumo mostra o período inteiro, não só os dias com
// atividade, pra um dia parado ficar visível (não some da lista).
export function summarizeByDay(rows: ConversationReportRow[], period: ReportPeriod): DaySummaryEntry[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const day = brazilDayKey(row.createdAt);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const days: DaySummaryEntry[] = [];
  const cursor = startOfBrazilDay(period.start);
  const end = startOfBrazilDay(period.end);
  while (cursor.getTime() <= end.getTime()) {
    const day = brazilDayKey(cursor);
    days.push({ day, count: counts.get(day) ?? 0 });
    cursor.setTime(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return days;
}

export function countDistinctLeads(rows: ConversationReportRow[]): number {
  return new Set(rows.map((row) => row.leadId)).size;
}
