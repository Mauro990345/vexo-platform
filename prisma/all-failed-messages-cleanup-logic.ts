// Lógica PURA (sem PrismaClient, sem nenhum efeito colateral) do script
// prisma/cleanup-all-failed-messages.ts — separada num arquivo próprio só
// pra poder ser testada isoladamente. Mesmo padrão dos dois cleanups
// anteriores (evolution-cleanup-logic.ts e instagram-failed-cleanup-logic.ts).
//
// Este cleanup é o mais simples dos três: sem corte de data, sem filtro
// de canal nem de failReason — TODA Message com status=FAILED é
// candidata (pedido explícito: sistema em fase de teste, sem usuários
// reais, o dono decidiu limpar tudo).

export type FailedMessageRow = {
  id: string;
  channel: string;
  failReason: string | null;
};

// Prefixo legível do failReason — até a primeira quebra de linha (corta a
// stack trace) ou 100 caracteres. Mesma lógica dos dois cleanups
// anteriores, duplicada aqui de propósito: os três scripts são
// ferramentas descartáveis e independentes.
export function failReasonPrefix(failReason: string | null): string {
  if (!failReason) return "(sem motivo registrado)";
  const firstLine = failReason.split("\n")[0] ?? "";
  return firstLine.length > 100 ? `${firstLine.slice(0, 100)}…` : firstLine;
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
