"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { validateBrazilianPhone, normalizeBrazilianWhatsappNumber } from "@/lib/whatsapp";
import {
  sendClinicReportDelivery,
  generateReportToken,
  buildReportUrl,
  isClinicReportSendAllowed,
  type SendClinicReportResult,
} from "@/lib/clinic-reports";
import { computeReportPeriod, resolveNextSendDate, formatReportPeriodLabel, formatReportDateRange, type ReportFrequency, type MonthlyDayMode } from "@/lib/report-period";

// Relatório de resultados (quinzenal/mensal) — ações de servidor da
// página "Contas" (ver ClinicReportPanel.tsx). TODAS exigem sessão
// interna (requireInternalSession) — nada aqui é alcançável pelo cliente
// logado (role CLIENT, ver requireClientSession em session.ts, nunca
// usado neste arquivo): o bloqueio é no SERVIDOR, não só esconder o
// botão na tela (pedido explícito, item 1).

export type ClinicReportConfigView = {
  whatsappNumber: string | null;
  frequency: ReportFrequency;
  monthlyDayMode: MonthlyDayMode;
  monthlyFixedDay: number | null;
  sendHour: number;
  sendMinute: number;
  autoSendEnabled: boolean;
};

export type ClinicReportDeliveryView = {
  id: string;
  periodLabel: string;
  dateRange: string;
  url: string | null; // null quando token revogado ou nunca chegou a gerar um
  status: "SENT" | "FAILED" | null;
  trigger: "AUTO" | "MANUAL";
  attempt: number;
  sentAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
};

export type ClinicReportPanelData = {
  config: ClinicReportConfigView | null;
  latestDelivery: ClinicReportDeliveryView | null;
  nextSendDateLabel: string | null; // "30/11" — null quando autoSendEnabled está desligado
  previewUrl: string;
  isSendAllowed: boolean; // false = restrito à Demo durante a fase de teste (ver clinic-reports.ts)
};

const DEFAULT_CONFIG_VIEW: ClinicReportConfigView = {
  whatsappNumber: null,
  frequency: "MONTHLY",
  monthlyDayMode: "LAST_DAY",
  monthlyFixedDay: null,
  sendHour: 17,
  sendMinute: 0,
  autoSendEnabled: false,
};

function formatDayMonth(d: Date): string {
  // Mesmo padrão "DD/MM" usado no resto do painel (ver PanelAppointmentsColumn.tsx).
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

export type ClinicReportRowSummary = { autoSendEnabled: boolean; nextSendDateLabel: string | null };

// Versão EM LOTE, leve, só pro texto discreto "Relatório · 30/11" de cada
// linha da lista de Contas (ClinicSearchList.tsx) — uma query só pra
// todas as clínicas, nunca N chamadas de getClinicReportPanelData (que é
// por clínica e busca o histórico de entregas também, usado só quando o
// painel de UMA clínica específica é aberto).
export async function getClinicReportRowSummaries(clinicIds: string[]): Promise<Record<string, ClinicReportRowSummary>> {
  await requireInternalSession();
  if (clinicIds.length === 0) return {};

  const configs = await prisma.clinicReportConfig.findMany({ where: { clinicId: { in: clinicIds }, autoSendEnabled: true } });

  const now = new Date();
  const result: Record<string, ClinicReportRowSummary> = {};
  for (const config of configs) {
    result[config.clinicId] = { autoSendEnabled: true, nextSendDateLabel: formatDayMonth(resolveNextSendDate(config, now)) };
  }
  return result;
}

// Chamado pela página "Contas" (Server Component) pra montar o botão
// "Relatório" (texto "Relatório · 30/11" quando o envio automático está
// ligado) e pelo painel/modal, ao abrir, pro estado inicial.
export async function getClinicReportPanelData(clinicId: string): Promise<ClinicReportPanelData> {
  await requireInternalSession();

  const [config, latestDelivery] = await Promise.all([
    prisma.clinicReportConfig.findUnique({ where: { clinicId } }),
    prisma.clinicReportDelivery.findFirst({ where: { clinicId }, orderBy: { periodStart: "desc" } }),
  ]);

  const configView: ClinicReportConfigView | null = config
    ? {
        whatsappNumber: config.whatsappNumber,
        frequency: config.frequency,
        monthlyDayMode: config.monthlyDayMode,
        monthlyFixedDay: config.monthlyFixedDay,
        sendHour: config.sendHour,
        sendMinute: config.sendMinute,
        autoSendEnabled: config.autoSendEnabled,
      }
    : null;

  const nextSendDateLabel =
    config?.autoSendEnabled ? formatDayMonth(resolveNextSendDate(config, new Date())) : null;

  const latestDeliveryView: ClinicReportDeliveryView | null = latestDelivery
    ? {
        id: latestDelivery.id,
        periodLabel: formatReportPeriodLabel(latestDelivery.periodType, { start: latestDelivery.periodStart, end: latestDelivery.periodEnd }),
        dateRange: formatReportDateRange({ start: latestDelivery.periodStart, end: latestDelivery.periodEnd }),
        url: latestDelivery.token ? buildReportUrl(latestDelivery.token) : null,
        status: latestDelivery.status,
        trigger: latestDelivery.trigger,
        attempt: latestDelivery.attempt,
        sentAt: latestDelivery.sentAt?.toISOString() ?? null,
        lastAttemptAt: latestDelivery.lastAttemptAt?.toISOString() ?? null,
        lastError: latestDelivery.lastError,
      }
    : null;

  return {
    config: configView ?? DEFAULT_CONFIG_VIEW,
    latestDelivery: latestDeliveryView,
    nextSendDateLabel,
    previewUrl: `/crm/clinicas/${clinicId}/relatorio-preview`,
    isSendAllowed: isClinicReportSendAllowed(clinicId),
  };
}

export type UpdateClinicReportConfigInput = {
  whatsappNumber: string; // vazio = "sem número" (desliga autoSendEnabled)
  frequency: ReportFrequency;
  monthlyDayMode: MonthlyDayMode;
  monthlyFixedDay: number | null;
  sendHour: number;
  sendMinute: number;
  autoSendEnabled: boolean;
};

export type UpdateClinicReportConfigResult = { ok: true } | { ok: false; error: string };

// Validação sempre no SERVIDOR (pedido explícito, item 1 — "bloqueio no
// servidor, não só esconder o botão") — mesmo quando o formulário do
// painel já impede boa parte disso na própria tela.
export async function updateClinicReportConfig(clinicId: string, input: UpdateClinicReportConfigInput): Promise<UpdateClinicReportConfigResult> {
  await requireInternalSession();

  const trimmedNumber = input.whatsappNumber.trim();
  let normalizedNumber: string | null = null;
  if (trimmedNumber) {
    const check = validateBrazilianPhone(trimmedNumber);
    if (!check.valid) return { ok: false, error: check.reason };
    normalizedNumber = trimmedNumber;

    const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { clientWhatsappNumber: true } });
    if (clinic?.clientWhatsappNumber && normalizeBrazilianWhatsappNumber(trimmedNumber) === normalizeBrazilianWhatsappNumber(clinic.clientWhatsappNumber)) {
      return {
        ok: false,
        error:
          "Esse é o mesmo número que a clínica usa para atender pacientes (WhatsApp conectado) — mandar o relatório " +
          "pra ele faria a clínica mandar uma mensagem pra si mesma, que falha. Use um número diferente (ex.: o " +
          "celular pessoal da dona/responsável).",
      };
    }
  }

  if (input.monthlyDayMode === "FIXED_DAY" && (!input.monthlyFixedDay || input.monthlyFixedDay < 1 || input.monthlyFixedDay > 28)) {
    return { ok: false, error: "O dia fixo do envio mensal precisa estar entre 1 e 28." };
  }
  if (input.sendHour < 0 || input.sendHour > 23 || input.sendMinute < 0 || input.sendMinute > 59) {
    return { ok: false, error: "Horário de envio inválido." };
  }
  if (input.autoSendEnabled && !normalizedNumber) {
    return { ok: false, error: "Informe o número de WhatsApp antes de ligar o envio automático." };
  }

  const data = {
    whatsappNumber: normalizedNumber,
    frequency: input.frequency,
    monthlyDayMode: input.monthlyDayMode,
    monthlyFixedDay: input.monthlyDayMode === "FIXED_DAY" ? input.monthlyFixedDay : null,
    sendHour: input.sendHour,
    sendMinute: input.sendMinute,
    autoSendEnabled: input.autoSendEnabled,
  };

  await prisma.clinicReportConfig.upsert({
    where: { clinicId },
    create: { clinicId, ...data },
    update: data,
  });

  revalidatePath("/crm");
  return { ok: true };
}

export type SendClinicReportNowResult = SendClinicReportResult;

// Botão "Enviar agora" (item 2, pedido explícito pra teste) — usa o MESMO
// núcleo de envio do worker automático (sendClinicReportDelivery,
// clinic-reports.ts), trigger MANUAL (reenvia mesmo se o período já
// tiver sido marcado como enviado, ao contrário do worker). Restrito à
// Demo durante a fase de teste — ver CLINIC_REPORT_SEND_RESTRICTED_TO_DEMO,
// clinic-reports.ts; sendClinicReportDelivery já recusa com reason
// "restricted_to_demo" antes de chegar perto de enviar de verdade.
export async function sendClinicReportNow(clinicId: string): Promise<SendClinicReportNowResult> {
  await requireInternalSession();

  const config = await prisma.clinicReportConfig.findUnique({ where: { clinicId } });
  if (!config?.whatsappNumber) return { ok: false, reason: "not_configured" };

  const period = computeReportPeriod(config.frequency, new Date());
  const result = await sendClinicReportDelivery({ clinicId, frequency: config.frequency, period, trigger: "MANUAL" });

  revalidatePath("/crm");
  return result;
}

export type RegenerateReportLinkResult = { ok: true; url: string } | { ok: false; error: string };

// "Regenerar" (item 4) — token NOVO pra mesma entrega (histórico de envio
// preservado); o link antigo para de funcionar assim que este grava.
export async function regenerateClinicReportLink(deliveryId: string): Promise<RegenerateReportLinkResult> {
  await requireInternalSession();

  const token = generateReportToken();
  const delivery = await prisma.clinicReportDelivery.update({ where: { id: deliveryId }, data: { token } });

  revalidatePath("/crm");
  return { ok: true, url: buildReportUrl(delivery.token!) };
}

// "Revogar" (item 4) — token vira null; a rota pública (/relatorio/[token])
// passa a tratar como link inválido (mesmo padrão de BriefingLink/
// ClientPanelLink: ausência/null = não autentica/não abre). O histórico
// da entrega (status/tentativas) continua intacto, só o acesso público é
// cortado.
export async function revokeClinicReportLink(deliveryId: string): Promise<{ ok: true }> {
  await requireInternalSession();

  await prisma.clinicReportDelivery.update({ where: { id: deliveryId }, data: { token: null } });

  revalidatePath("/crm");
  return { ok: true };
}
