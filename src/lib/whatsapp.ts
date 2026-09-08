// Integração com WhatsApp via Evolution API (self-hosted).
// Usada para: lembretes de agendamento (fallback), resumo semanal e
// notificação de escalonamento — cada clínica tem sua própria instância
// (ver Clinic.whatsappInstanceName e src/lib/whatsapp-connection.ts), então
// quem envia sempre informa qual instância usar.

export function evolutionBaseConfig() {
  const baseUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new Error("Evolution API não configurada (EVOLUTION_API_URL/EVOLUTION_API_KEY).");
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), apiKey };
}

export async function sendWhatsappMessage(instanceName: string | null | undefined, phoneE164: string, text: string): Promise<void> {
  if (!instanceName) {
    throw new Error("Clínica sem WhatsApp conectado (nenhuma instância configurada).");
  }

  const { baseUrl, apiKey } = evolutionBaseConfig();

  const number = phoneE164.replace(/\D/g, "");

  const res = await fetch(`${baseUrl}/message/sendText/${instanceName}`, {
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
  leadPhone?: string | null;
  leadIgUsername?: string | null;
  reason: string;
  conversationUrl: string;
}): string {
  // Sem isso, a secretária vê o aviso mas não tem como iniciar contato fora
  // da plataforma — telefone é preferido (permite ligar/chamar no WhatsApp
  // direto), caindo pro @ do Instagram quando o lead nunca informou telefone.
  const contact = params.leadPhone
    ? params.leadPhone
    : params.leadIgUsername
      ? `@${params.leadIgUsername} (Instagram)`
      : "não informado";

  return [
    `*VEXO — conversa precisa de atenção humana*`,
    `Clínica: ${params.clinicName}`,
    `Lead: ${params.leadName}`,
    `Contato: ${contact}`,
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

// "Hoje"/"amanhã" com base na data civil em America/Sao_Paulo (não em
// diferença de milissegundos, que erraria perto da virada do dia) — usa a
// convenção en-CA (YYYY-MM-DD) só como formato estável pra comparar datas,
// nunca exibido ao lead. Além desses dois casos (únicos alcançáveis hoje,
// já que processReminders só considera agendamentos até 48h à frente), cai
// pro nome do dia da semana como reforço, sem quebrar se isso mudar no futuro.
function relativeDayLabel(date: Date, now: Date): string {
  const civilDate = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const target = civilDate(date);
  if (target === civilDate(now)) return "hoje";
  if (target === civilDate(new Date(now.getTime() + 24 * 60 * 60 * 1000))) return "amanhã";
  return date.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" });
}

// Data + horário legível, tipo "amanhã (05/09) às 15h" — combina o dia
// relativo, a data numérica (pra não deixar dúvida de qual dia é "amanhã")
// e a hora (sem minutos quando exatos, ex: "15h" em vez de "15h00").
function formatDateTimeLabel(date: Date, now: Date): string {
  const dayLabel = relativeDayLabel(date, now);
  const dayMonth = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const [hour, minute] = date
    .toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" })
    .split(":");
  const hourLabel = minute === "00" ? `${hour}h` : `${hour}h${minute}`;

  return `${dayLabel} (${dayMonth}) às ${hourLabel}`;
}

// Texto customizado de lembrete (ReminderConfig.firstMessageTemplate /
// secondMessageTemplate, editável por clínica em Automações) — aceita
// {{primeiro_nome}} e {{data_horario}}. Usado no lugar de
// formatReminderMessage quando a clínica personalizou o texto daquele
// lembrete específico.
export function applyReminderTemplate(template: string, params: { leadFirstName: string; scheduledAt: Date }): string {
  const dataHorario = formatDateTimeLabel(params.scheduledAt, new Date());

  return template.replaceAll("{{primeiro_nome}}", params.leadFirstName).replaceAll("{{data_horario}}", dataHorario);
}
