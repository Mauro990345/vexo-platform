// Lógica pura do polling da tela de conversa (ConversationMessages) —
// separada do componente só pra poder testar sem precisar de jsdom/DOM
// real (este repo não tem infra de teste de componente, só node puro —
// ver vitest.config.ts). O componente em si só chama estas funções.

// visibleAt (não createdAt) — o instante em que a mensagem passa a
// aparecer na conversa, ver src/lib/message-visibility.ts. Precisa ser
// isso, não o horário de criação, porque uma resposta da IA é criada
// PENDING e só fica visível minutos depois, quando sai de verdade.
export type PollableMessage = { id: string; visibleAt: string };

// Decide se o próximo tick do setInterval deve de fato buscar mensagens
// novas. Nunca dispara com a aba escondida (pausa o polling) e nunca
// dispara se já existe uma busca em voo (isFetching) — garante que nunca
// há duas buscas concorrentes pra mesma conversa.
export function shouldPoll(visibilityState: DocumentVisibilityState, isFetching: boolean): boolean {
  return visibilityState === "visible" && !isFetching;
}

// Cursor (afterVisibleAt/afterId) da busca: mensagens estritamente depois
// da última já exibida. Sem mensagem nenhuma ainda, usa um cursor que
// qualquer mensagem real passa (visibleAt=epoch, id="" — menor que
// qualquer cuid).
export function nextPollCursor(messages: PollableMessage[]): { afterVisibleAt: string; afterId: string } {
  const last = messages[messages.length - 1];
  return {
    afterVisibleAt: last ? last.visibleAt : new Date(0).toISOString(),
    afterId: last ? last.id : "",
  };
}

// Só entra o que ainda não está na lista local — defesa extra contra
// qualquer sobreposição entre buscas (a exclusão mútua de shouldPoll já
// devia bastar, isto é só uma segunda rede de segurança, barata).
export function dedupeIncomingMessages<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const knownIds = new Set(current.map((m) => m.id));
  return incoming.filter((m) => !knownIds.has(m.id));
}

// Verdadeiro quando a posição de rolagem já está perto o bastante do fim
// da página pra contar como "operador está lendo o fim da conversa" — só
// nesse caso mensagens novas podem puxar a rolagem junto; lendo mensagens
// antigas mais acima, a rolagem nunca se move.
export function isNearBottom(scrollY: number, innerHeight: number, scrollHeight: number, thresholdPx: number): boolean {
  return innerHeight + scrollY >= scrollHeight - thresholdPx;
}
