// Timing adaptativo de resposta da IA — pura lógica de agendamento de envio,
// não consome tokens extras. Primeira resposta tem delay curto fixo; as
// seguintes espelham o tempo que o lead levou para responder, com jitter e
// teto/piso de segurança.

export const FIRST_REPLY_DELAY_SECONDS = Number(process.env.AI_FIRST_REPLY_DELAY_SECONDS ?? 40);
export const MIN_REPLY_DELAY_SECONDS = Number(process.env.AI_MIN_REPLY_DELAY_SECONDS ?? 15);
export const MAX_REPLY_DELAY_SECONDS = Number(process.env.AI_MAX_REPLY_DELAY_SECONDS ?? 900);

export function computeAdaptiveDelaySeconds(leadResponseTimeSeconds: number | null): number {
  if (leadResponseTimeSeconds === null) {
    return FIRST_REPLY_DELAY_SECONDS;
  }

  const jitterFactor = 0.8 + Math.random() * 0.4; // variação de ±20%
  const mirrored = leadResponseTimeSeconds * jitterFactor;

  return Math.min(
    MAX_REPLY_DELAY_SECONDS,
    Math.max(MIN_REPLY_DELAY_SECONDS, Math.round(mirrored))
  );
}
