// Conversão entre horário de Brasília (America/Sao_Paulo) e UTC — usado
// pelas ferramentas de agenda (check_availability, schedule_appointment,
// check_current_appointment, ver conversation-pipeline.ts) pra que a IA
// NUNCA precise fazer a conversão de fuso horário sozinha.
//
// Causa raiz real investigada em produção: agendamentos de horários
// genuinamente livres (confirmado direto no Google Calendar, sem nenhum
// evento conflitante) sendo rejeitados por schedule_appointment como "não
// disponível". O motivo: o design anterior exigia que o MODELO calculasse
// o ISO 8601 em UTC de cabeça (ex.: "9h de Brasília = 12:00 UTC") toda vez
// que confirmava um horário — e esse cálculo tinha que ser refeito do zero
// em CADA turno da conversa, porque o histórico persistido
// (Message.content, ver schema.prisma) guarda só o TEXTO final que a IA
// mandou pro lead ("temos 9h, 10h ou 11h"), nunca o ISO exato que
// check_availability devolveu — não existe em lugar nenhum um "cache" da
// conversão de um turno pro outro. Uma conta errada (o erro mais comum:
// esquecer de somar as 3h e tratar "9h" como se já fosse "09:00Z") faz
// schedule_appointment rejeitar um horário genuinamente livre, e a IA lê
// esse erro genérico como "alguém pegou esse horário", quando na verdade é
// o PRÓPRIO sistema que mandou um horário errado pra checar. Isso explica
// por que o bug era consistente desde os primeiros testes (ainda com
// Sonnet, bem antes do Luna) e não dependia de mensagens simultâneas: é um
// problema estrutural do formato usado na fronteira IA<->ferramenta, não
// uma corrida.
//
// Correção: as ferramentas de agenda passam a falar em horário de
// Brasília DIRETO, sem nenhuma conversão — a IA só ecoa o que o lead disse
// ("9h", "11h") e o que check_availability devolveu, sem fazer conta
// nenhuma. Toda a matemática de fuso fica aqui, em código determinístico e
// testado, nunca dependendo do modelo acertar uma continha sob pressão.
//
// Brasília não tem mais horário de verão desde 2019 (Decreto 9.772/2019) —
// o offset é SEMPRE -03:00 em relação a UTC, o ano inteiro, sem exceção.
// Isso permite converter com aritmética fixa, sem depender de tabelas de
// fuso horário nem do Intl/ICU da plataforma (mais robusto ainda que usar
// Intl: não pode divergir entre ambientes com dados de fuso diferentes).
export const SAO_PAULO_UTC_OFFSET_HOURS = 3; // UTC = horário de Brasília + 3h

// Formato aceito pelas ferramentas: "AAAA-MM-DDTHH:mm" ou
// "AAAA-MM-DDTHH:mm:ss", SEM sufixo de fuso (nunca "Z" nem "+/-HH:mm") —
// representa, por convenção, um instante no horário de Brasília. Nunca UTC,
// nunca horário local do servidor.
const LOCAL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

// Lança em vez de devolver Invalid Date silenciosamente — assim o erro
// aparece como um erro de FERRAMENTA claro pro modelo corrigir (ver uso em
// conversation-pipeline.ts), em vez de checkAvailability simplesmente não
// achar nenhum slot sem explicar por quê (comportamento antigo de
// `new Date(stringInválida)` alimentando o loop de slots).
export function parseBrazilLocalDateTime(localDateTime: string): Date {
  const match = LOCAL_DATETIME_PATTERN.exec(localDateTime.trim());
  if (!match) {
    throw new Error(
      `Data/hora inválida: "${localDateTime}" — formato esperado "AAAA-MM-DDTHH:mm" (horário de Brasília, ` +
        `sem sufixo de fuso horário, ex.: "2026-09-19T09:00").`
    );
  }
  const [, year, month, day, hour, minute, second] = match;
  // Date.UTC normaliza campos fora da faixa sozinho (ex.: hora 23 + 3 =
  // "26" vira 02h do dia seguinte automaticamente) — por isso dá pra somar
  // o offset direto na hora, sem tratar virada de dia manualmente.
  const utcMillis = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) + SAO_PAULO_UTC_OFFSET_HOURS,
    Number(minute),
    Number(second ?? "0")
  );
  const date = new Date(utcMillis);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Data/hora inválida: "${localDateTime}" não corresponde a uma data real.`);
  }
  return date;
}

// Inverso de parseBrazilLocalDateTime — devolve um instante UTC formatado
// no MESMO formato que a função acima aceita de volta (round-trip
// garantido, ver timezone.test.ts). Aritmética pura (desloca o instante e
// lê os componentes em UTC do resultado) em vez de Intl/toLocaleString, pra
// nunca divergir do que parseBrazilLocalDateTime realmente entende.
export function formatAsBrazilLocalDateTime(date: Date): string {
  const shifted = new Date(date.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T` +
    `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
  );
}
