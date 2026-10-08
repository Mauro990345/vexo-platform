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
//
// Bug real reportado: duas mensagens do lead mandadas com ~4s de
// intervalo (bem dentro da janela) mesmo assim geraram DUAS respostas
// separadas da IA, uma pra cada mensagem — como se o debounce não
// tivesse agrupado nada. A lógica de reset em si (auditada de novo nesta
// investigação) está correta: não há bypass em código nenhum, o único
// call site é sempre via este mecanismo (ver route.ts). A explicação
// mais provável, sem acesso a logs reais pra confirmar com certeza: o
// intervalo que importa aqui é entre a CHEGADA de cada webhook no
// servidor (Date.now() no momento do bufferForDebounce), não entre os
// dois envios do lead no app do Instagram — a entrega de webhook da Meta
// é "best effort" e pode introduzir alguns segundos de latência/jitter
// própria, então um gap de ~4s do lado do lead pode facilmente virar >6s
// entre as duas entregas no nosso servidor, já esgotando a janela antiga
// antes da segunda mensagem chegar. 6s era pouca margem pra essa
// variação real; 10s dá uma folga bem mais realista sem deixar uma
// conversa comum (mensagem única) sensivelmente mais lenta. Ver
// [vexo:debounce] abaixo — log permanente que deixa confirmar/medir isso
// de verdade da próxima vez, em vez de só ajustar o número no escuro.
//
// Segundo bug real reportado, com o log acima já confirmando a reinício
// do timer em toda mensagem nova (não era mais dúvida): 10s é curto pra
// um lead digitando uma frase longa em mais de uma mensagem (comum no
// app do Instagram — a pessoa manda um pedaço, continua digitando,
// manda o resto) — a IA respondia só à primeira parte antes da segunda
// chegar, do mesmo jeito que o bug original desta correção, só que com
// uma causa diferente (tempo de digitação real do lead, não latência de
// entrega do webhook). 20s dava folga pra isso sem deixar uma conversa
// comum (mensagem única) sensivelmente mais lenta.
//
// 20s -> 15s (ajuste pedido): investigação do tempo de resposta real em
// conversa ativa (meta ~40s entre a última mensagem do lead e a resposta
// da IA) mostrou que o debounce era a MAIOR fatia fixa do total — somado
// ao delay adaptativo configurado (Clinic.firstBandDelaySeconds) e à
// espera do próprio ciclo do worker de despacho (até ~15s,
// DISPATCH_INTERVAL_MS, src/worker/index.ts), o total ficava perto de um
// minuto, bem mais que o esperado por quem configura o delay na tela.
// 15s é o mesmo valor já usado como piso defensivo (antes da correção da
// "frase longa" acima) e ainda dá folga real: o gap médio entre entregas
// de webhook da Meta pra duas mensagens do lead raramente passa de uns
// poucos segundos — 15s continua ABSORVENDO esse jitter sem reintroduzir
// o bug original (texto cortado em duas mensagens).
export const LEAD_DEBOUNCE_WINDOW_MS = 15_000;

// Teto pro adiamento TOTAL de um lote, mesmo que cada mensagem nova
// continue reiniciando a janela de silêncio acima — sem isso, um lead
// "verborrágico" que manda várias mensagens curtas, cada uma chegando
// antes da janela de silêncio da anterior terminar, nunca deixa a janela
// completar, e o lote NUNCA dispara: a IA fica sem responder
// indefinidamente, não só um pouco mais devagar. Age como uma segunda
// trava, independente da janela de silêncio: força o flush quando o lote
// como um todo já espera tempo demais desde a PRIMEIRA mensagem, mesmo
// que a mais recente ainda esteja "fresca" dentro da janela normal.
//
// Mantido em 30s de propósito (pedido explícito), tanto na subida de
// LEAD_DEBOUNCE_WINDOW_MS pra 20s quanto na volta pra 15s — a proporção
// janela/teto (2x com a janela em 15s) continua garantindo pelo menos uma
// rodada de reset antes do teto forçar o flush. Nunca impede o
// agrupamento de 2 mensagens digitadas em sequência normal (o caso que
// motivou LEAD_DEBOUNCE_WINDOW_MS acima) — só limita quantas RODADAS de
// reset consecutivas um lead muito falante consegue emendar antes de ser
// cortado.
export const MAX_DEBOUNCE_TOTAL_WAIT_MS = 30_000;

type PendingBatch = {
  items: unknown[];
  timer: ReturnType<typeof setTimeout>;
  firstItemAt: number;
};

const pendingByKey = new Map<string, PendingBatch>();

export function bufferForDebounce<T>(
  key: string,
  item: T,
  onFlush: (items: T[]) => void,
  windowMs: number = LEAD_DEBOUNCE_WINDOW_MS
): void {
  const existing = pendingByKey.get(key);
  if (existing) {
    clearTimeout(existing.timer);
    existing.items.push(item);
    // Nunca deixa o próximo timer ultrapassar o teto total, contado a
    // partir da PRIMEIRA mensagem do lote — ver MAX_DEBOUNCE_TOTAL_WAIT_MS
    // acima. Math.max(0, ...) garante um flush praticamente imediato (não
    // negativo) se o lote já estourou o teto entre uma mensagem e outra.
    const elapsedSinceFirst = Date.now() - existing.firstItemAt;
    const nextDelay = Math.max(0, Math.min(windowMs, MAX_DEBOUNCE_TOTAL_WAIT_MS - elapsedSinceFirst));
    console.log(
      `[vexo:debounce] key=${key} item#${existing.items.length} chegou ${elapsedSinceFirst}ms depois do ` +
        `primeiro do lote — timer reiniciado, próximo flush em ${nextDelay}ms.`
    );
    existing.timer = setTimeout(() => flush(key, onFlush), nextDelay);
    return;
  }

  console.log(`[vexo:debounce] key=${key} item#0 abre um lote novo — flush em ${windowMs}ms se nada mais chegar.`);
  pendingByKey.set(key, {
    items: [item],
    firstItemAt: Date.now(),
    timer: setTimeout(() => flush(key, onFlush), windowMs),
  });
}

function flush<T>(key: string, onFlush: (items: T[]) => void): void {
  const batch = pendingByKey.get(key);
  if (!batch) return;
  pendingByKey.delete(key);
  console.log(`[vexo:debounce] key=${key} flush com ${batch.items.length} item(ns).`);
  onFlush(batch.items as T[]);
}

// Só pra teste — dá pra confirmar que nenhum lote ficou "preso" (timer
// nunca disparado) sem expor o Map inteiro.
export function pendingDebounceCount(): number {
  return pendingByKey.size;
}
