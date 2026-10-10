import type { Prisma } from "@prisma/client";

// Lógica PURA (sem PrismaClient, sem nenhum efeito colateral) do script
// prisma/cleanup-old-instagram-failed-messages.ts — separada num arquivo
// próprio só pra poder ser testada isoladamente (o script em si chama
// main() incondicionalmente ao ser carregado, o que tentaria conectar num
// banco de verdade se fosse importado por um teste). Mesmo padrão de
// evolution-cleanup-logic.ts (cleanup anterior, das Message de WhatsApp
// com failReason de Evolution).

// Janela de retenção: nunca apaga uma falha com menos de 48h, mesmo que
// bata em todo o resto do filtro — dá tempo de alguém notar/investigar
// uma falha NOVA antes dela desaparecer da tela Status.
export const RETENTION_WINDOW_MS = 48 * 60 * 60 * 1000;

export type FailedMessageRow = {
  id: string;
  channel: string;
  conversationId: string;
  createdAt: Date;
  failReason: string | null;
};

// Corte dinâmico: SEMPRE relativo ao instante em que o script roda (não
// uma data fixa, ao contrário do cleanup anterior) — "mais de 48h atrás"
// se desloca pra frente a cada execução.
export function computeCutoff(now: Date): Date {
  return new Date(now.getTime() - RETENTION_WINDOW_MS);
}

// Decide se UMA linha deve ser apagada. Filtro deliberadamente simples
// (pedido explícito, diferente do cleanup anterior: aqui não importa o
// failReason) — só channel=INSTAGRAM e createdAt mais antigo que a janela
// de retenção. Qualquer Message de WHATSAPP, qualquer Message com outro
// status, ou qualquer FAILED do Instagram DENTRO das últimas 48h, nunca
// bate aqui.
export function matchesCleanupCriteria(row: FailedMessageRow, now: Date): boolean {
  if (row.channel !== "INSTAGRAM") return false;
  return row.createdAt < computeCutoff(now);
}

// Mesmo filtro de matchesCleanupCriteria, em forma de WHERE do Prisma —
// os dois precisam concordar sempre; o script reconfere isso dentro da
// transação antes de apagar de verdade.
export function cleanupWhereClause(now: Date): Prisma.MessageWhereInput {
  return {
    status: "FAILED",
    channel: "INSTAGRAM",
    createdAt: { lt: computeCutoff(now) },
  };
}

// Prefixo legível do failReason pra agrupar no relatório — até a primeira
// quebra de linha (corta a stack trace) ou 100 caracteres, o que vier
// primeiro. Mesma lógica de evolution-cleanup-logic.ts, duplicada aqui de
// propósito (não importada de lá): os dois scripts são ferramentas
// descartáveis e independentes — nenhum devia precisar existir pra o
// outro continuar funcionando se um for apagado depois de usado.
export function failReasonPrefix(failReason: string | null): string {
  if (!failReason) return "(sem motivo registrado)";
  const firstLine = failReason.split("\n")[0] ?? "";
  return firstLine.length > 100 ? `${firstLine.slice(0, 100)}…` : firstLine;
}

export type ReasonGroupStats = {
  reason: string;
  total: number;
  oldest: Date;
  newest: Date;
  // Quantas deste grupo estão DENTRO da janela de retenção (nunca
  // apagadas) vs. fora dela (candidatas a apagar, se --apply).
  withinRetentionWindow: number;
  olderThanRetentionWindow: number;
};

// Agrupa por início do failReason — pra cada grupo, mostra total, a data
// mais antiga/mais recente (createdAt) e quantas estão dentro/fora da
// janela de retenção de 48h. Puro, exportado só pra teste.
export function groupByReason(rows: FailedMessageRow[], now: Date): ReasonGroupStats[] {
  const cutoff = computeCutoff(now);
  const groups = new Map<string, FailedMessageRow[]>();
  for (const row of rows) {
    const key = failReasonPrefix(row.failReason);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  const result: ReasonGroupStats[] = [];
  for (const [reason, groupRows] of groups) {
    const times = groupRows.map((r) => r.createdAt.getTime());
    const withinRetentionWindow = groupRows.filter((r) => r.createdAt >= cutoff).length;
    result.push({
      reason,
      total: groupRows.length,
      oldest: new Date(Math.min(...times)),
      newest: new Date(Math.max(...times)),
      withinRetentionWindow,
      olderThanRetentionWindow: groupRows.length - withinRetentionWindow,
    });
  }
  return result.sort((a, b) => b.total - a.total);
}

// Quantas conversas DISTINTAS têm pelo menos uma Message no conjunto dado
// — usado pro relatório mostrar o alcance real (quantas conversas de
// verdade exibem (ou exibiam) alguma dessas mensagens no histórico).
export function countDistinctConversations(rows: FailedMessageRow[]): number {
  return new Set(rows.map((r) => r.conversationId)).size;
}
