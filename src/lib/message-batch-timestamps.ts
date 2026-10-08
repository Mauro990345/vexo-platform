// Resolve createdAt/sentAt pra um LOTE de mensagens do lead vindas do mesmo
// debounce (ver inbound-debounce.ts) — usado nos dois pontos de
// conversation-pipeline.ts que criam as Message INBOUND de um lote
// (handleInboundInstagramMessage, branch normal e branch NEEDS_HUMAN).
//
// Dois problemas reais, resolvidos juntos:
//
// 1) Bug real investigado: duas (ou mais) mensagens do MESMO lote, criadas
// dentro do MESMO prisma.$transaction/createMany, recebiam createdAt
// IDÊNTICO — no Postgres, now()/CURRENT_TIMESTAMP (o default da coluna) é
// "congelado" no início da transação, igual pra toda instrução dentro dela,
// não um valor novo por INSERT. A query que monta o histórico pro modelo
// (`ORDER BY "createdAt" ASC`, sem nenhuma chave de desempate) não garante
// NADA sobre a ordem relativa de linhas empatadas — o Postgres documenta
// isso explicitamente. Resultado possível: as duas mensagens do lead
// chegam mescladas (toChatHistory junta turnos consecutivos do mesmo
// remetente) na ORDEM ERRADA, e a IA responde como se tivesse visto só uma
// delas — não porque alguma foi perdida, mas porque o texto mesclado saiu
// embaralhado.
//
// 2) O timestamp que a Meta manda por mensagem (event.timestamp no
// webhook) não tem garantia de vir presente, válido, nem sequer distinto
// entre duas mensagens do mesmo lote (a resolução é de segundos, não
// milissegundos) — um valor ausente/inválido virando `sentAt`/`createdAt`
// quebraria o insert (Prisma rejeita um Invalid Date antes de chegar no
// banco), derrubando o lote inteiro.
//
// Resolve os dois de uma vez: devolve um createdAt por mensagem, SEMPRE na
// mesma ordem do array de entrada (= ordem de chegada no webhook, já que é
// a ordem em que bufferForDebounce acumulou os itens), cada valor
// ESTRITAMENTE maior que o anterior do mesmo lote — nunca dois iguais,
// nunca fora de ordem — usando o timestamp real do Instagram quando ele é
// válido e plausível, e caindo pro horário atual (`now`, injetável só pra
// teste) quando não é.
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000; // 24h pra qualquer lado — Meta nunca deveria mandar fora disso

export type ResolvedBatchTimestamp = {
  // Horário "real" validado da mensagem (o que a Meta mandou, ou `now` se
  // ausente/inválido/fora do intervalo plausível) — pode legitimamente
  // repetir entre duas mensagens do lote (a Meta só reporta em segundos);
  // é só informativo, nunca usado pra ordenar nada.
  sentAt: Date;
  // Mesmo valor de sentAt, exceto quando colidiria com o createdAt da
  // mensagem ANTERIOR deste mesmo lote — nesse caso, empurrado +1ms pra
  // garantir ordem estrita. É este valor (nunca sentAt) que vai pra coluna
  // createdAt, a que toda query de histórico ordena por.
  createdAt: Date;
};

export function resolveBatchTimestamps(
  timestamps: (Date | null | undefined)[],
  now: () => Date = () => new Date()
): ResolvedBatchTimestamp[] {
  const nowMs = now().getTime();
  let previousCreatedAtMs: number | null = null;

  return timestamps.map((timestamp) => {
    const candidateMs = timestamp?.getTime();
    const isValid =
      typeof candidateMs === "number" && !Number.isNaN(candidateMs) && Math.abs(candidateMs - nowMs) <= MAX_CLOCK_SKEW_MS;
    const sentAtMs = isValid ? candidateMs! : nowMs;

    let createdAtMs = sentAtMs;
    if (previousCreatedAtMs !== null && createdAtMs <= previousCreatedAtMs) {
      createdAtMs = previousCreatedAtMs + 1;
    }
    previousCreatedAtMs = createdAtMs;

    return { sentAt: new Date(sentAtMs), createdAt: new Date(createdAtMs) };
  });
}
