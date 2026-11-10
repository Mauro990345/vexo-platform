import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendWhatsappMessage, normalizeBrazilianWhatsappNumber } from "@/lib/whatsapp";
import { DEMO_CLINIC_ID } from "@/lib/demo-clinic";
import {
  computeReportPeriod,
  isReportSendMoment,
  formatReportPeriodLabel,
  formatReportDateRange,
  type ReportFrequency,
  type ReportPeriod,
  type MonthlyDayMode,
} from "@/lib/report-period";

// Relatório de resultados (quinzenal/mensal) — envio automático por
// WhatsApp, ver DESIGN.md e ClinicReportConfig/ClinicReportDelivery no
// schema. Esta é a ÚNICA peça que de fato envia (reaproveitada tanto pelo
// worker, processClinicReports abaixo, quanto pelo botão "Enviar agora"
// do painel, ver sendClinicReportNow em crm/clinicas/report-actions.ts) —
// nenhuma segunda implementação de "mandar e registrar o resultado".
//
// REMETENTE investigado antes de implementar (pedido explícito): o VEXO
// NÃO TEM um número/instância PRÓPRIO que envie WhatsApp — todo envio do
// sistema (lembretes, confirmação de agendamento, Reativação/Faltou,
// resumo semanal — ver whatsapp.ts/sendWhatsappMessage) sai pela
// instância Evolution API JÁ CONECTADA da PRÓPRIA clínica
// (Clinic.whatsappInstanceName). Por isso o relatório usa o MESMO
// mecanismo (não um remetente "do VEXO" separado, que não existe) — o
// remetente É a clínica, mandando pro número configurado no painel
// (ClinicReportConfig.whatsappNumber), que deve ser DIFERENTE do número
// que a própria clínica usa pra atender pacientes
// (Clinic.clientWhatsappNumber) — mandar pro MESMO número seria a
// clínica mandando mensagem pra si mesma, que a Evolution API rejeita.
// Essa checagem (REPORT_SELF_SEND_BLOCKED abaixo) é a defesa contra esse
// caso — tanto na gravação da configuração (updateClinicReportConfig,
// report-actions.ts) quanto aqui de novo, em profundidade, antes de
// qualquer envio de verdade. Decisão PENDENTE (sem resposta ainda, ver
// relatório final): se o VEXO quiser um número PRÓPRIO e dedicado (não o
// de nenhuma clínica) pra mandar todos os relatórios, isso exige uma
// instância Evolution API adicional, hoje inexistente — não implementado.
//
// RESTRIÇÃO DE FASE DE TESTE (pedido explícito, "sem usuários reais") —
// mesmo padrão já usado por WEEKLY_SUMMARY_WHATSAPP_ENABLED
// (weekly-summary.ts): const boolean, não variável de ambiente, fácil de
// desligar quando a fase de teste acabar, sem precisar de deploy de
// infra nem remover nada do resto do código. Enquanto true, NENHUM envio
// de verdade acontece pra clínica que não seja a Demo — nem automático
// (processClinicReports pula a clínica inteira) nem manual
// (sendClinicReportNow recusa antes de chamar isto aqui) — ver os dois
// pontos de checagem abaixo.
export const CLINIC_REPORT_SEND_RESTRICTED_TO_DEMO = true;

export const REPORT_MAX_SEND_ATTEMPTS = 3;

export function isClinicReportSendAllowed(clinicId: string): boolean {
  return !CLINIC_REPORT_SEND_RESTRICTED_TO_DEMO || clinicId === DEMO_CLINIC_ID;
}

export function generateReportToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

export function buildReportUrl(token: string): string {
  return `${process.env.APP_URL ?? ""}/relatorio/${token}`;
}

// "Olá! Segue o relatório de {período} da {Nome da clínica}, gerado pelo
// VEXO IA: {link}" (pedido explícito) — NUNCA cita "M8 Growth" (pedido
// explícito, item 3).
export function formatClinicReportWhatsAppMessage(params: { clinicName: string; frequency: ReportFrequency; period: ReportPeriod; link: string }): string {
  const periodLabel = formatReportPeriodLabel(params.frequency, params.period);
  return `Olá! Segue o relatório de ${periodLabel} da ${params.clinicName}, gerado pelo VEXO IA: ${params.link}`;
}

export type SendClinicReportResult =
  | { ok: true; alreadySent: boolean }
  | { ok: false; reason: "not_configured" | "self_send_blocked" | "whatsapp_not_connected" | "send_failed" | "restricted_to_demo" };

// Núcleo do envio — upsert ATÔMICO o bastante pro caso de uso (clinicId +
// periodType + periodStart é @@unique no schema; duas chamadas
// concorrentes pro MESMO período fariam a 2ª falhar na criação e cair no
// catch como "já existe", nunca duplicando linha nem mandando 2x; dado o
// volume baixíssimo desta feature — no máximo um envio por clínica por
// dia de envio — não precisou de um claim atômico tipo updateMany como em
// sendReactivationWhatsAppMessage). Chamado tanto pelo worker (AUTO)
// quanto por "Enviar agora" (MANUAL, ver report-actions.ts).
export async function sendClinicReportDelivery(params: {
  clinicId: string;
  frequency: ReportFrequency;
  period: ReportPeriod;
  trigger: "AUTO" | "MANUAL";
  now?: Date;
}): Promise<SendClinicReportResult> {
  const now = params.now ?? new Date();

  if (!isClinicReportSendAllowed(params.clinicId)) {
    return { ok: false, reason: "restricted_to_demo" };
  }

  const [clinic, config] = await Promise.all([
    prisma.clinic.findUnique({
      where: { id: params.clinicId },
      select: { name: true, whatsappInstanceName: true, clientWhatsappNumber: true },
    }),
    prisma.clinicReportConfig.findUnique({ where: { clinicId: params.clinicId } }),
  ]);
  if (!clinic || !config?.whatsappNumber) return { ok: false, reason: "not_configured" };

  if (clinic.clientWhatsappNumber && normalizeBrazilianWhatsappNumber(config.whatsappNumber) === normalizeBrazilianWhatsappNumber(clinic.clientWhatsappNumber)) {
    return { ok: false, reason: "self_send_blocked" };
  }

  const existing = await prisma.clinicReportDelivery.findUnique({
    where: { clinicId_periodType_periodStart: { clinicId: params.clinicId, periodType: params.frequency, periodStart: params.period.start } },
  });

  // Idempotência (pedido explícito, "nunca enviar duas vezes o mesmo
  // período") — só pro envio AUTOMÁTICO. "Enviar agora" é a própria
  // ferramenta de teste manual pedida explicitamente pra poder reenviar
  // de novo durante os testes; nunca cria uma SEGUNDA linha pro mesmo
  // período (upsert abaixo), só atualiza a mesma.
  if (existing?.sentAt && params.trigger === "AUTO") return { ok: true, alreadySent: true };
  if (existing && existing.attempt >= REPORT_MAX_SEND_ATTEMPTS && !existing.sentAt && params.trigger === "AUTO") {
    return { ok: false, reason: "send_failed" };
  }

  // Gerado (ou reaproveitado) já aqui, mesmo antes de confirmar o envio —
  // deixa o link pronto pro admin conferir o conteúdo (preview/"Copiar
  // link") mesmo que o envio de verdade ainda falhe (ex.: WhatsApp
  // desconectado no momento).
  const token = existing?.token ?? generateReportToken();

  if (!clinic.whatsappInstanceName) {
    await recordAttempt(params.clinicId, params.frequency, params.period, params.trigger, existing, {
      ok: false,
      error: "Clínica sem WhatsApp conectado.",
      token,
    });
    return { ok: false, reason: "whatsapp_not_connected" };
  }

  const link = buildReportUrl(token);
  const message = formatClinicReportWhatsAppMessage({ clinicName: clinic.name, frequency: params.frequency, period: params.period, link });

  try {
    await sendWhatsappMessage(clinic.whatsappInstanceName, config.whatsappNumber, message);
    await recordAttempt(params.clinicId, params.frequency, params.period, params.trigger, existing, { ok: true, token, sentAt: now });
    return { ok: true, alreadySent: false };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Erro desconhecido.";
    console.error(`[vexo:clinic-reports] Falha ao enviar relatório (clinicId=${params.clinicId}):`, err);
    await recordAttempt(params.clinicId, params.frequency, params.period, params.trigger, existing, { ok: false, error: errorMessage, token });
    return { ok: false, reason: "send_failed" };
  }
}

async function recordAttempt(
  clinicId: string,
  frequency: ReportFrequency,
  period: ReportPeriod,
  trigger: "AUTO" | "MANUAL",
  existing: { id: string; attempt: number } | null,
  outcome: { ok: true; token: string; sentAt: Date } | { ok: false; error: string; token?: string }
): Promise<void> {
  const now = new Date();
  const baseData = {
    clinicId,
    periodType: frequency,
    periodStart: period.start,
    periodEnd: period.end,
    trigger,
    attempt: (existing?.attempt ?? 0) + 1,
    lastAttemptAt: now,
  };

  if (outcome.ok) {
    await prisma.clinicReportDelivery.upsert({
      where: { clinicId_periodType_periodStart: { clinicId, periodType: frequency, periodStart: period.start } },
      create: { ...baseData, token: outcome.token, status: "SENT", sentAt: outcome.sentAt, lastError: null },
      update: { ...baseData, token: outcome.token, status: "SENT", sentAt: outcome.sentAt, lastError: null },
    });
    return;
  }

  await prisma.clinicReportDelivery.upsert({
    where: { clinicId_periodType_periodStart: { clinicId, periodType: frequency, periodStart: period.start } },
    create: { ...baseData, token: outcome.token ?? null, status: "FAILED", lastError: outcome.error },
    update: { ...baseData, ...(outcome.token ? { token: outcome.token } : {}), status: "FAILED", lastError: outcome.error },
  });
}

export type ReportScheduleRow = {
  clinicId: string;
  frequency: ReportFrequency;
  monthlyDayMode: MonthlyDayMode;
  monthlyFixedDay: number | null;
  sendHour: number;
  sendMinute: number;
};

// Worker diário (ver worker/index.ts) — duas passadas independentes:
// (1) RETRY: entregas já criadas que ainda não confirmaram sucesso e
//     ainda têm tentativa sobrando (pedido explícito: "tentar de novo no
//     dia seguinte, máximo 3 tentativas") — tenta de novo com os MESMOS
//     limites de período congelados na própria linha (nunca recalcula o
//     período a partir de "hoje", que já pode ser outro).
// (2) NOVO ENVIO: clínicas com autoSendEnabled, cujo dia/horário de envio
//     chegou HOJE (isReportSendMoment) — só cria uma entrega NOVA se
//     ainda não existir nenhuma pro período de hoje (nunca duplica linha;
//     se já existe, é porque ou já foi tratada por "Enviar agora" ou já
//     está na passada de retry). Nunca olha pra períodos cujo dia de
//     envio JÁ PASSOU antes de hoje — é isso que garante "se o envio for
//     ligado no meio de um período, o primeiro envio acontece no próximo
//     dia de envio previsto" (pedido explícito) sem precisar de nenhum
//     campo "ligado em" extra: um período cujo dia de envio já passou
//     simplesmente nunca é considerado "hoje" de novo.
//
// Limitação CONHECIDA (documentada, não implementada): se o worker ficar
// fora do ar durante TODO o dia de envio de um período, esse período
// específico não é recuperado automaticamente depois — o sistema só olha
// pro dia de envio de HOJE, nunca pra atrasados. Mitigável rodando
// "Enviar agora" manualmente se isso acontecer. Aceitável nesta fase (o
// worker roda a cada ~15min, uma indisponibilidade de um dia inteiro é um
// cenário extremo).
export async function processClinicReports(now: Date = new Date()): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  const pendingRetries = await prisma.clinicReportDelivery.findMany({
    where: { sentAt: null, attempt: { lt: REPORT_MAX_SEND_ATTEMPTS }, trigger: "AUTO" },
    select: { clinicId: true, periodType: true, periodStart: true, periodEnd: true },
  });
  for (const delivery of pendingRetries) {
    if (!isClinicReportSendAllowed(delivery.clinicId)) continue;
    const result = await sendClinicReportDelivery({
      clinicId: delivery.clinicId,
      frequency: delivery.periodType,
      period: { start: delivery.periodStart, end: delivery.periodEnd },
      trigger: "AUTO",
      now,
    });
    if (result.ok && !result.alreadySent) sent++;
    else if (!result.ok) failed++;
  }

  const schedules = await prisma.clinicReportConfig.findMany({
    where: { autoSendEnabled: true, whatsappNumber: { not: null } },
    select: { clinicId: true, frequency: true, monthlyDayMode: true, monthlyFixedDay: true, sendHour: true, sendMinute: true },
  });
  for (const config of schedules) {
    if (!isClinicReportSendAllowed(config.clinicId)) continue;
    if (!isReportSendMoment(config, now)) continue;

    const period = computeReportPeriod(config.frequency, now);
    const existing = await prisma.clinicReportDelivery.findUnique({
      where: { clinicId_periodType_periodStart: { clinicId: config.clinicId, periodType: config.frequency, periodStart: period.start } },
      select: { id: true },
    });
    if (existing) continue; // já tratada (enviada, ou já pega pela passada de retry acima)

    const result = await sendClinicReportDelivery({ clinicId: config.clinicId, frequency: config.frequency, period, trigger: "AUTO", now });
    if (result.ok && !result.alreadySent) sent++;
    else if (!result.ok) failed++;
  }

  return { sent, failed };
}

export { formatReportPeriodLabel, formatReportDateRange };
