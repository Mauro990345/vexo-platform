// Timing de resposta da IA — pura lógica de agendamento de envio, não
// consome tokens extras (a resposta já foi gerada; isso só decide QUANDO
// ela sai). Faixas fixas por tempo de silêncio do lead desde a última
// mensagem da IA, sorteadas aleatoriamente dentro de cada faixa.
//
// A faixa de >6h é mais RÁPIDA que a de 1-6h de propósito: quando o lead
// volta depois de sumir muito tempo é um momento de reengajamento, e o
// sistema deve aproveitar rápido a atenção dele voltando em vez de
// enfileirar atrás de um delay ainda maior.

const ONE_HOUR_SECONDS = 60 * 60;
const SIX_HOURS_SECONDS = 6 * 60 * 60;

// Usado quando o timing adaptativo está desligado (AiSettings.adaptiveDelayEnabled
// = false, ver conversation-pipeline.ts) — modo de teste: a IA responde rápido e
// direto, sem as faixas de espera abaixo.
export const FAST_REPLY_DELAY_SECONDS = 3;

function randomInRangeSeconds(minSeconds: number, maxSeconds: number): number {
  return Math.round(minSeconds + Math.random() * (maxSeconds - minSeconds));
}

export function computeAdaptiveDelaySeconds(leadResponseTimeSeconds: number | null): number {
  // Primeira mensagem da IA numa conversa nova: mesma faixa da resposta rápida (≤1h).
  if (leadResponseTimeSeconds === null || leadResponseTimeSeconds <= ONE_HOUR_SECONDS) {
    return randomInRangeSeconds(30, 60);
  }

  if (leadResponseTimeSeconds <= SIX_HOURS_SECONDS) {
    return randomInRangeSeconds(5 * 60, 10 * 60);
  }

  return randomInRangeSeconds(2 * 60, 5 * 60);
}
