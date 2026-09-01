import { toZonedTime, fromZonedTime } from "date-fns-tz";

// Janela de envio das mensagens de follow-up (dias da semana + horário,
// configurável em /crm/follow-up). Fixo em horário de Brasília — a
// sequência é global (todas as clínicas), então não há timezone por clínica
// aqui. windowDays usa a mesma convenção do Date.getDay() nativo: 0=domingo
// .. 6=sábado.

export const FOLLOW_UP_TIMEZONE = "America/Sao_Paulo";

// Dado um instante `from`, encontra o próximo instante >= from que cai
// dentro da janela permitida — se `from` já está dentro da janela, retorna
// o próprio `from` (envia agora); senão, avança para o início da próxima
// ocorrência válida.
export function nextValidSendTime(
  from: Date,
  windowDays: number[],
  windowStartMinute: number,
  windowEndMinute: number
): Date {
  if (windowDays.length === 0) return from; // guard contra configuração inválida (não deveria acontecer)

  for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
    const zonedFrom = toZonedTime(from, FOLLOW_UP_TIMEZONE);
    const candidateDay = new Date(zonedFrom);
    candidateDay.setDate(zonedFrom.getDate() + dayOffset);
    candidateDay.setHours(0, 0, 0, 0);

    if (!windowDays.includes(candidateDay.getDay())) continue;

    const windowStartLocal = new Date(candidateDay.getTime() + windowStartMinute * 60_000);
    const windowEndLocal = new Date(candidateDay.getTime() + windowEndMinute * 60_000);

    const windowStartUtc = fromZonedTime(windowStartLocal, FOLLOW_UP_TIMEZONE);
    const windowEndUtc = fromZonedTime(windowEndLocal, FOLLOW_UP_TIMEZONE);

    if (from < windowStartUtc) return windowStartUtc;
    if (from >= windowStartUtc && from < windowEndUtc) return from;
    // `from` já passou da janela desse dia -> tenta o próximo dia permitido
  }

  return from; // fallback de segurança — não deveria ser alcançado com windowDays não vazio
}
