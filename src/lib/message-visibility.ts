// Quando uma Message passa a aparecer na conversa (ConversationMessages) —
// e, por extensão, o cursor usado pelo polling dela (ver
// conversation-polling.ts). Separado num módulo próprio porque as duas
// rotas que leem mensagens (a carga inicial em conversas/[id]/page.tsx e
// o polling em /api/conversas/[id]/mensagens) precisam da MESMA regra,
// nunca duas versões divergindo com o tempo.
//
// Pedido: a resposta da IA só deve aparecer no VEXO depois de ter sido
// enviada de verdade pro Instagram — hoje ela é gravada como PENDING e já
// aparece na hora (com "· agendada"), só saindo de fato quando o
// atraso adaptativo + o cron de despacho (dispatch.ts) rodam, minutos
// depois. Isso faz a resposta aparecer no VEXO ANTES de chegar no
// Instagram — ruim pro vídeo de revisão da Meta.
export type MessageStatus = "PENDING" | "SENDING" | "SENT" | "FAILED";

const HIDDEN_STATUSES: ReadonlySet<MessageStatus> = new Set(["PENDING", "SENDING"]);

// PENDING (ainda esperando o horário do atraso adaptativo) e SENDING
// (despacho em andamento, ver claimMessage em dispatch.ts) nunca aparecem
// — nem na carga inicial, nem no polling. SENT aparece normalmente. FAILED
// continua aparecendo, com a marca "· falhou" que já existia.
export function isMessageVisible(status: MessageStatus): boolean {
  return !HIDDEN_STATUSES.has(status);
}

export type VisibilityInput = {
  direction: "INBOUND" | "OUTBOUND";
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// O instante em que a mensagem PASSA A SER VISÍVEL — é isso (não
// createdAt) que decide a ordem na tela e o cursor do polling.
//
// Mensagens de ENTRADA (do lead) são visíveis desde que chegam: createdAt
// já é esse instante, tanto numa mensagem em tempo real quanto numa linha
// recuperada pelo backfill de histórico (ver buildHistoryBackfillRows/
// resolveBatchTimestamps — createdAt ali é sempre o horário REAL em que o
// lead escreveu no Instagram, nunca o horário em que o backfill rodou).
//
// Mensagens de SAÍDA (IA/humano/sistema) só ficam visíveis quando saem de
// verdade: sentAt — preenchido no MESMO instante em que dispatchOneMessage
// marca SENT (dispatch.ts) — é esse instante exato. Uma que FALHOU nunca
// chega a ter sentAt preenchido; updatedAt (Prisma @updatedAt, atualizado
// sozinho a cada write) É o instante da própria falha, já que a única
// escrita que muda o status pra FAILED é essa — createdAt ficaria
// defasado do atraso adaptativo e de qualquer retentativa, reproduzindo
// exatamente o bug de cursor que esconder PENDING/SENDING introduziria se
// não fosse corrigido (ver comentário grande no polling, abaixo).
export function messageVisibleAt(message: VisibilityInput): Date {
  if (message.direction === "INBOUND") return message.createdAt;
  return message.sentAt ?? message.updatedAt;
}

export type VisibleMessage = { id: string; visibleAt: Date };

// Mesmo desempate (visibleAt, depois id) usado em toda a conversa —
// mensagens com o MESMO visibleAt (ex: lote do mesmo debounce, que nunca
// colide de verdade — resolveBatchTimestamps garante valores distintos)
// ficam na ordem de criação (id crescente, cuid é monotônico).
export function compareByVisibleAt(a: VisibleMessage, b: VisibleMessage): number {
  const diff = a.visibleAt.getTime() - b.visibleAt.getTime();
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Estritamente depois do cursor (afterVisibleAt, afterId) — mesma semântica
// do antigo filtro por createdAt/id, só que sobre o instante de
// visibilidade em vez do de criação. É isto que resolve o bug real: uma
// mensagem de saída criada ANTES do cursor atual (porque passou minutos
// PENDING) ainda é trazida pelo polling quando o sentAt dela (não o
// createdAt) é mais recente que o cursor.
export function isAfterVisibleCursor(message: VisibleMessage, afterVisibleAt: Date, afterId: string): boolean {
  const diff = message.visibleAt.getTime() - afterVisibleAt.getTime();
  if (diff !== 0) return diff > 0;
  return message.id > afterId;
}

// Filtra (só o que é mais novo que o cursor) e ordena (por visibleAt) de
// uma vez — usado pelo polling depois de buscar os candidatos no banco
// (ver route.ts: a query já restringe por sentAt/updatedAt/createdAt > o
// cursor conforme a direção, isto aqui é o filtro EXATO, incluindo o
// desempate por id, sobre esse conjunto já pequeno).
export function selectMessagesAfterCursor<T extends VisibleMessage>(
  messages: T[],
  afterVisibleAt: Date,
  afterId: string
): T[] {
  return messages.filter((m) => isAfterVisibleCursor(m, afterVisibleAt, afterId)).sort(compareByVisibleAt);
}
