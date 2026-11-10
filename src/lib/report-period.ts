import { SAO_PAULO_UTC_OFFSET_HOURS } from "@/lib/timezone";

// Cálculo de período do Relatório de resultados (quinzenal/mensal) — ver
// ClinicReportConfig/ClinicReportDelivery no schema e DESIGN.md. Lógica
// pura aqui (testável sem Prisma, mesmo padrão de reactivation.ts/
// metrics.ts), wrapper com Prisma em clinic-reports.ts.
//
// Sempre em dia civil de Brasília (America/Sao_Paulo) — mesma aritmética
// de deslocamento fixo já usada em timezone.ts (Brasília não tem mais
// horário de verão desde 2019, offset sempre -03:00). [start, end) —
// `end` é SEMPRE a meia-noite de Brasília do dia seguinte ao último dia
// do período, mesma convenção de intervalo semiaberto usada em todo o
// resto do sistema (metrics.ts/reactivation.ts) pra filtros `gte`/`lt`.

const DAY_MS = 24 * 60 * 60 * 1000;

function brazilDayStart(year: number, monthIndex0: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex0, day, SAO_PAULO_UTC_OFFSET_HOURS, 0, 0, 0));
}

// Ano/mês/dia (e hora/minuto) EM BRASÍLIA de um instante — mesmo
// deslocamento fixo usado por startOfBrazilDay (timezone.ts), só que
// expondo os componentes em vez de só o início do dia.
export function brazilDateParts(d: Date): { year: number; month0: number; day: number; hour: number; minute: number } {
  const shifted = new Date(d.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month0: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

// Quantos dias tem o mês `monthIndex0` (0-11) do ano `year` — fato de
// calendário, não depende de fuso horário (Date.UTC(y, m+1, 0) = dia 0 do
// mês seguinte = último dia do mês m, aritmética pura do JS).
export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

export type ReportPeriod = { start: Date; end: Date };

// Mês civil (dia 1 ao último dia do mês) contendo `reference`.
export function computeMonthlyPeriod(reference: Date): ReportPeriod {
  const { year, month0 } = brazilDateParts(reference);
  const lastDay = daysInMonth(year, month0);
  return {
    start: brazilDayStart(year, month0, 1),
    // day = lastDay + 1 nunca existe no mês atual — Date.UTC normaliza
    // sozinho pro dia 1 do mês seguinte (mesmo princípio de
    // parseBrazilLocalDateTime, timezone.ts).
    end: brazilDayStart(year, month0, lastDay + 1),
  };
}

// Quinzena civil (dia 1-15, ou dia 16-último dia do mês) contendo
// `reference`.
export function computeBiweeklyPeriod(reference: Date): ReportPeriod {
  const { year, month0, day } = brazilDateParts(reference);
  if (day <= 15) {
    return { start: brazilDayStart(year, month0, 1), end: brazilDayStart(year, month0, 16) };
  }
  const lastDay = daysInMonth(year, month0);
  return { start: brazilDayStart(year, month0, 16), end: brazilDayStart(year, month0, lastDay + 1) };
}

export type ReportFrequency = "MONTHLY" | "BIWEEKLY";

export function computeReportPeriod(frequency: ReportFrequency, reference: Date): ReportPeriod {
  return frequency === "MONTHLY" ? computeMonthlyPeriod(reference) : computeBiweeklyPeriod(reference);
}

// Período civil ANTERIOR a `period` (mesma frequência) — 1ms antes do
// início de `period` sempre cai no último dia do período anterior,
// qualquer que seja a duração dele (mês de 28/29/30/31 dias, quinzena de
// 13 a 16 dias). Única definição, reaproveitada tanto pela comparação
// "vs. período anterior" do relatório (getReportNumbersWithComparison,
// report-metrics.ts) quanto por computeLastClosedPeriod abaixo.
export function resolvePreviousPeriod(frequency: ReportFrequency, period: ReportPeriod): ReportPeriod {
  return computeReportPeriod(frequency, new Date(period.start.getTime() - 1));
}

// Período civil (mês/quinzena) mais recente que já TERMINOU antes de
// `now` — nunca o período em andamento. Pedido explícito (preview admin,
// "Ver relatório"): evita comparar um período PARCIAL (poucos dias de
// atividade, ainda em andamento) contra um período anterior completo, o
// que produziria uma queda artificial (ex.: "-100%") só por o mês atual
// ainda não ter acabado — nada a ver com o desempenho real da clínica.
// Os relatórios de verdade ENVIADOS (worker/"Enviar agora") continuam
// usando o período que contém `now` normalmente (ver clinic-reports.ts) —
// aquele já é sempre gerado exatamente no dia de fechamento do período,
// nunca parcial.
export function computeLastClosedPeriod(frequency: ReportFrequency, now: Date): ReportPeriod {
  const current = computeReportPeriod(frequency, now);
  return resolvePreviousPeriod(frequency, current);
}

// Quantos dias corridos tem o período — sempre um inteiro exato (start/end
// são ambos meia-noite de Brasília), usado pelo adapter que reaproveita
// computeReactivationReturnStats (ver report-metrics.ts).
export function periodLengthDays(period: ReportPeriod): number {
  return Math.round((period.end.getTime() - period.start.getTime()) / DAY_MS);
}

export type MonthlyDayMode = "LAST_DAY" | "FIXED_DAY";

// Dia (1-28/29/30/31) em que o relatório MENSAL é enviado naquele
// ano/mês — "último dia do mês" (padrão) ou um dia fixo de 1 a 28. Um
// `monthlyFixedDay` > dias do mês nunca acontece na prática (validado na
// escrita, ver report-actions.ts, máximo 28), mas por segurança nunca
// passa do último dia real do mês.
export function resolveMonthlySendDay(year: number, month0: number, mode: MonthlyDayMode, fixedDay: number | null): number {
  const lastDay = daysInMonth(year, month0);
  if (mode === "FIXED_DAY" && fixedDay) return Math.min(fixedDay, lastDay);
  return lastDay;
}

// Os DOIS dias de envio do relatório QUINZENAL naquele ano/mês — sempre
// dia 15 e o último dia do mês (pedido explícito, sem outra opção).
export function resolveBiweeklySendDays(year: number, month0: number): number[] {
  return [15, daysInMonth(year, month0)];
}

export type ReportScheduleConfig = {
  frequency: ReportFrequency;
  monthlyDayMode: MonthlyDayMode;
  monthlyFixedDay: number | null;
  sendHour: number;
  sendMinute: number;
};

// true quando HOJE (em Brasília) é um dia de envio desta clínica E o
// horário configurado já passou — é o gatilho que o worker usa pra
// decidir se cria/envia uma entrega NOVA (ver processClinicReports,
// clinic-reports.ts). Nunca olha pra trás (dias de envio já passados) —
// é só esse "hoje" que decide início de um envio novo; o reenvio de uma
// entrega já criada mas ainda não confirmada (retry) é outro mecanismo,
// que não depende desta função (ver ClinicReportDelivery.attempt).
export function isReportSendMoment(config: ReportScheduleConfig, now: Date): boolean {
  const { year, month0, day, hour, minute } = brazilDateParts(now);
  const sendDays =
    config.frequency === "MONTHLY"
      ? [resolveMonthlySendDay(year, month0, config.monthlyDayMode, config.monthlyFixedDay)]
      : resolveBiweeklySendDays(year, month0);
  if (!sendDays.includes(day)) return false;

  const nowMinutesOfDay = hour * 60 + minute;
  const targetMinutesOfDay = config.sendHour * 60 + config.sendMinute;
  return nowMinutesOfDay >= targetMinutesOfDay;
}

// Próxima data de envio prevista a partir de `now` (exibida no painel —
// "Relatório · 30/11" na lista de Contas, "Próximo envio: 30/11 às 17h"
// dentro do painel) — olha pra FRENTE, nunca pra trás: se hoje já é (ou
// já passou) o dia de envio deste período, avança pro período seguinte.
// Checagem por dia civil (não por instante exato) — comparar só a data,
// nunca a hora, é o que evita mostrar "hoje" depois que o horário já
// passou (nesse caso o próximo envio já é do período seguinte).
export function resolveNextSendDate(config: ReportScheduleConfig, now: Date): Date {
  const { year, month0, day } = brazilDateParts(now);
  const sendDaysThisMonth =
    config.frequency === "MONTHLY"
      ? [resolveMonthlySendDay(year, month0, config.monthlyDayMode, config.monthlyFixedDay)]
      : resolveBiweeklySendDays(year, month0);

  const upcomingThisMonth = sendDaysThisMonth.filter((d) => d >= day).sort((a, b) => a - b);
  if (upcomingThisMonth.length > 0) {
    return brazilDayStart(year, month0, upcomingThisMonth[0]!);
  }

  // Nenhum dia de envio deste mês ainda está por vir (já passou até o
  // último) — o próximo é no mês seguinte. Date.UTC normaliza mês 12
  // (jan do ano seguinte) sozinho, mesmo princípio de daysInMonth acima.
  const nextMonthDays =
    config.frequency === "MONTHLY"
      ? [resolveMonthlySendDay(year, month0 + 1, config.monthlyDayMode, config.monthlyFixedDay)]
      : resolveBiweeklySendDays(year, month0 + 1).sort((a, b) => a - b);
  return brazilDayStart(year, month0 + 1, nextMonthDays[0]!);
}

const MONTH_NAMES_PT = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

// Rótulo legível do período — usado tanto na mensagem de WhatsApp quanto
// no topo da página pública do relatório (uma ÚNICA definição pros dois
// lugares, ver clinic-reports.ts/ClinicReportContent.tsx). Mês civil:
// "novembro de 2026"; quinzena: "1ª quinzena de novembro de 2026"/"2ª
// quinzena de novembro de 2026" — o mês de referência é sempre o do
// PRIMEIRO dia do período (period.start), nunca o do último, pra nunca
// ambiguar numa quinzena que começa num mês e... na prática nunca termina
// no mês seguinte (quinzenas são sempre dentro de um único mês civil,
// mas o mês de start é o jeito mais direto de nomear mesmo assim).
export function formatReportPeriodLabel(frequency: ReportFrequency, period: ReportPeriod): string {
  const { year, month0, day } = brazilDateParts(period.start);
  const monthLabel = `${MONTH_NAMES_PT[month0]} de ${year}`;
  if (frequency === "MONTHLY") return monthLabel;
  return day === 1 ? `1ª quinzena de ${monthLabel}` : `2ª quinzena de ${monthLabel}`;
}

export type ReportWeek = { start: Date; end: Date };

// Semanas civis de SEGUNDA a DOMINGO (dia de Brasília), recortadas nas
// bordas do período — a 1ª semana pode começar no meio de uma semana
// civil (quando period.start não é segunda) e a última pode terminar no
// meio (quando period.end não é a segunda seguinte). Cobertura EXATA de
// [period.start, period.end), sem lacuna nem sobreposição entre semanas —
// é isso que garante que qualquer métrica aditiva por data (ex.:
// abordagens, ver computeWeeklyApproached em report-metrics.ts) some,
// semana a semana, exatamente o mesmo total do período inteiro (pedido
// explícito, item 5: "a soma das barras deve bater com o box
// 'Abordados'").
export function splitIntoWeeks(period: ReportPeriod): ReportWeek[] {
  const weeks: ReportWeek[] = [];
  let cursor = period.start;
  while (cursor.getTime() < period.end.getTime()) {
    const { year, month0, day } = brazilDateParts(cursor);
    // getUTCDay() do instante "deslocado" (mesmo truque de brazilDateParts)
    // dá o dia da semana EM BRASÍLIA: 0=domingo..6=sábado. Convertido pra
    // ISO (1=segunda..7=domingo) pra achar em quantos dias cai a PRÓXIMA
    // segunda-feira a partir de `cursor` (sempre entre 1 e 7 dias).
    const shifted = new Date(cursor.getTime() - SAO_PAULO_UTC_OFFSET_HOURS * 60 * 60 * 1000);
    const isoDow = shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay();
    const daysUntilNextMonday = 8 - isoDow;
    const nextMonday = brazilDayStart(year, month0, day + daysUntilNextMonday);
    const weekEnd = nextMonday.getTime() < period.end.getTime() ? nextMonday : period.end;
    weeks.push({ start: cursor, end: weekEnd });
    cursor = weekEnd;
  }
  return weeks;
}

// Prefixo da FRASE DE ABERTURA do relatório (pedido explícito, item 2) —
// "Em outubro" (mensal) / "Na 1ª quinzena de novembro" (quinzenal), sem o
// ano (diferente de formatReportPeriodLabel, que é o rótulo completo
// mostrado no cabeçalho). Mesma fonte de nome de mês/quinzena, uma única
// definição.
export function formatReportOpeningPrefix(frequency: ReportFrequency, period: ReportPeriod): string {
  const { month0, day } = brazilDateParts(period.start);
  const monthName = MONTH_NAMES_PT[month0];
  if (frequency === "MONTHLY") return `Em ${monthName}`;
  return day === 1 ? `Na 1ª quinzena de ${monthName}` : `Na 2ª quinzena de ${monthName}`;
}

// "01/11 a 15/11" / "01/11 a 30/11" — datas inicial e final do período,
// sempre mostradas junto do rótulo acima (pedido explícito, item 3) na
// página pública/preview do relatório. `period.end` é EXCLUSIVO (ver
// convenção no topo do arquivo) — o último dia de verdade é o dia
// anterior a `end`.
export function formatReportDateRange(period: ReportPeriod): string {
  const fmt = (d: Date) => {
    const { day, month0 } = brazilDateParts(d);
    return `${String(day).padStart(2, "0")}/${String(month0 + 1).padStart(2, "0")}`;
  };
  const lastDayInstant = new Date(period.end.getTime() - DAY_MS);
  return `${fmt(period.start)} a ${fmt(lastDayInstant)}`;
}

// Rótulo curto do período pro gráfico de evolução (4ª rodada): "mai",
// "jun" (mensal) / "1ª mai", "2ª mai" (quinzenal). Mesma fonte de nomes de
// mês de formatReportPeriodLabel — 3 primeiras letras ("mar" de "março").
export function formatReportPeriodShortLabel(frequency: ReportFrequency, period: ReportPeriod): string {
  const { month0, day } = brazilDateParts(period.start);
  const short = MONTH_NAMES_PT[month0]!.slice(0, 3);
  if (frequency === "MONTHLY") return short;
  return day === 1 ? `1ª ${short}` : `2ª ${short}`;
}
