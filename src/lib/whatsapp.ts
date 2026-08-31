// Integração com WhatsApp via Evolution API (self-hosted).
// Usada para: lembretes de agendamento (fallback), resumo semanal e
// notificação de escalonamento para Mauro/secretária.

function evolutionConfig() {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_API_INSTANCE;
  if (!baseUrl || !apiKey || !instance) {
    throw new Error("Evolution API não configurada (EVOLUTION_API_URL/KEY/INSTANCE).");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey, instance };
}

export async function sendWhatsappMessage(phoneE164: string, text: string): Promise<void> {
  const { baseUrl, apiKey, instance } = evolutionConfig();

  const number = phoneE164.replace(/\D/g, "");

  const res = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({
      number,
      text,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Falha ao enviar WhatsApp via Evolution API (${res.status}): ${body}`);
  }
}

export function formatWeeklySummaryMessage(params: {
  clinicName: string;
  weekStart: Date;
  weekEnd: Date;
  approached: number;
  responded: number;
  scheduled: number;
  noShows: number;
  completed: number;
}): string {
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  return [
    `*VEXO — Resumo semanal (${fmt(params.weekStart)} a ${fmt(params.weekEnd)})*`,
    `Clínica: ${params.clinicName}`,
    "",
    `Abordados: ${params.approached}`,
    `Responderam: ${params.responded}`,
    `Agendados: ${params.scheduled}`,
    `Compareceram: ${params.completed}`,
    `Faltas: ${params.noShows}`,
  ].join("\n");
}

export function formatEscalationAlert(params: {
  clinicName: string;
  leadName: string;
  reason: string;
  conversationUrl: string;
}): string {
  return [
    `*VEXO — conversa precisa de atenção humana*`,
    `Clínica: ${params.clinicName}`,
    `Lead: ${params.leadName}`,
    `Motivo: ${params.reason}`,
    params.conversationUrl,
  ].join("\n");
}

export function formatReminderMessage(params: {
  leadFirstName: string;
  hoursBefore: number;
  scheduledAt: Date;
}): string {
  const time = params.scheduledAt.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  const when = params.hoursBefore >= 24 ? "amanhã" : `em ${params.hoursBefore}h`;

  return `Oi, ${params.leadFirstName}! Passando para lembrar que seu horário é ${when}, às ${time}. Te esperamos! 💙`;
}
