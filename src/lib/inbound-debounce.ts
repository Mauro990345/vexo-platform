// Agrupa itens do MESMO lead chegando em sequência rápida numa ÚNICA
// chamada de callback, em vez de uma por item — bug real reportado: o
// lead mandou "Oi" e, poucos segundos depois, "Ainda não pensei nisso";
// como cada mensagem virava sua própria chamada a
// handleInboundInstagramMessage (conversation-pipeline.ts) — sequencial,
// graças ao conversation-lock, mas ainda uma POR mensagem — a IA
// respondia "Oi" isoladamente, como só um cumprimento solto, ANTES de
// sequer ter visto a segunda mensagem, em vez de responder as duas juntas
// com o contexto completo.
//
// Debounce clássico "aguarda o silêncio": cada item novo reinicia o timer
// da MESMA janela pra essa chave; só quando a janela inteira passa sem
// nenhum item novo é que o lote acumulado até ali dispara o callback, UMA
// vez, com todos os itens em ordem de chegada. Em memória, por processo —
// mesma limitação já documentada em conversation-lock.ts: não sobrevive a
// um crash/redeploy no meio da janela (o item já foi perdido daqui, mas
// ver uso em route.ts — cada mensagem do Instagram é gravada no banco
// ANTES de entrar neste buffer, então o pior caso é a resposta da IA
// atrasar até a próxima mensagem do lead, nunca o texto dele se perder) e
// não escala pra múltiplas réplicas do serviço web sem virar uma fila
// distribuída (ex.: Redis) no lugar deste.
export const DEFAULT_DEBOUNCE_WINDOW_MS = 6_000;

type PendingBatch = {
  items: unknown[];
  timer: ReturnType<typeof setTimeout>;
};

const pendingByKey = new Map<string, PendingBatch>();

export function bufferForDebounce<T>(
  key: string,
  item: T,
  onFlush: (items: T[]) => void,
  windowMs: number = DEFAULT_DEBOUNCE_WINDOW_MS
): void {
  const existing = pendingByKey.get(key);
  if (existing) {
    clearTimeout(existing.timer);
    existing.items.push(item);
    existing.timer = setTimeout(() => flush(key, onFlush), windowMs);
    return;
  }

  pendingByKey.set(key, {
    items: [item],
    timer: setTimeout(() => flush(key, onFlush), windowMs),
  });
}

function flush<T>(key: string, onFlush: (items: T[]) => void): void {
  const batch = pendingByKey.get(key);
  if (!batch) return;
  pendingByKey.delete(key);
  onFlush(batch.items as T[]);
}

// Só pra teste — dá pra confirmar que nenhum lote ficou "preso" (timer
// nunca disparado) sem expor o Map inteiro.
export function pendingDebounceCount(): number {
  return pendingByKey.size;
}
