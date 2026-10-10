import type { Prisma } from "@prisma/client";

// Lógica PURA (sem PrismaClient, sem nenhum efeito colateral) do script
// prisma/cleanup-evolution-failed-whatsapp-messages.ts — separada num
// arquivo próprio só pra poder ser testada isoladamente (o script em si
// chama main() incondicionalmente ao ser carregado, o que tentaria
// conectar num banco de verdade se fosse importado por um teste).

// 2026-10-09 22:15 America/Sao_Paulo == 2026-10-10 01:15 UTC (UTC-3, sem
// horário de verão no Brasil desde 2019) — momento em que o worker parou
// de apontar pra Evolution/instância errada.
export const CORRECTION_CUTOFF_UTC = new Date("2026-10-10T01:15:00.000Z");

export const TARGET_MARKER = "Evolution API";
export const TARGET_KNOWN_REASONS = ["instance does not exist", "Connection Closed"];

export type FailedMessageRow = {
  id: string;
  channel: string;
  createdAt: Date;
  failReason: string | null;
};

// Prefixo legível do failReason pra agrupar no relatório — até a primeira
// quebra de linha (corta a stack trace) ou 100 caracteres, o que vier
// primeiro.
export function failReasonPrefix(failReason: string | null): string {
  if (!failReason) return "(sem motivo registrado)";
  const firstLine = failReason.split("\n")[0] ?? "";
  return firstLine.length > 100 ? `${firstLine.slice(0, 100)}…` : firstLine;
}

// Decide se UMA linha deve ser apagada. Regra DELIBERADAMENTE restrita:
// só WHATSAPP, só antes do corte, só failReason contendo "Evolution API"
// E (contendo "instance does not exist" OU "Connection Closed"). Qualquer
// FAILED de Instagram, qualquer FAILED de WhatsApp com outro motivo (ex.:
// "Lead sem telefone cadastrado.", "Clínica sem WhatsApp conectado."), ou
// qualquer Message com outro status, nunca bate aqui — de propósito, não
// por omissão.
export function matchesCleanupCriteria(row: FailedMessageRow): boolean {
  if (row.channel !== "WHATSAPP") return false;
  if (row.createdAt >= CORRECTION_CUTOFF_UTC) return false;
  if (!row.failReason || !row.failReason.includes(TARGET_MARKER)) return false;
  return TARGET_KNOWN_REASONS.some((reason) => row.failReason!.includes(reason));
}

// Mesmo filtro de matchesCleanupCriteria, em forma de WHERE do Prisma —
// os dois precisam concordar sempre; o script reconfere isso dentro da
// transação antes de apagar de verdade.
export function cleanupWhereClause(): Prisma.MessageWhereInput {
  return {
    status: "FAILED",
    channel: "WHATSAPP",
    createdAt: { lt: CORRECTION_CUTOFF_UTC },
    failReason: { contains: TARGET_MARKER },
    OR: TARGET_KNOWN_REASONS.map((reason) => ({ failReason: { contains: reason } })),
  };
}

export function breakdownByChannelAndReason(rows: FailedMessageRow[]): {
  total: number;
  byChannel: Map<string, number>;
  byChannelAndReason: Map<string, number>;
} {
  const byChannel = new Map<string, number>();
  const byChannelAndReason = new Map<string, number>();
  for (const row of rows) {
    byChannel.set(row.channel, (byChannel.get(row.channel) ?? 0) + 1);
    const key = `[${row.channel}] ${failReasonPrefix(row.failReason)}`;
    byChannelAndReason.set(key, (byChannelAndReason.get(key) ?? 0) + 1);
  }
  return { total: rows.length, byChannel, byChannelAndReason };
}
