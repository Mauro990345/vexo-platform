// Integração com WhatsApp via Evolution API (self-hosted).
// Usada para: lembretes de agendamento (fallback), resumo semanal e
// notificação de escalonamento — cada clínica tem sua própria instância
// (ver Clinic.whatsappInstanceName e src/lib/whatsapp-connection.ts), então
// quem envia sempre informa qual instância usar.

// Bug real reportado: link de WhatsApp no Painel abrindo "esse usuário não
// está no WhatsApp" pra um lead que TEM WhatsApp de verdade. Causa raiz:
// Lead.phone é gravado exatamente como o lead digitou na conversa (ver
// saveLeadPhone, conversation-pipeline.ts — nenhuma normalização
// acontecia ali, só um trim) — e convenção comum no Brasil é digitar SEM
// o código do país ("11987654321", "(11) 98765-4321"), já que ninguém
// fala o próprio número assim no dia a dia. Sem o "55" na frente, tanto um
// link wa.me quanto o envio via Evolution API (sendWhatsappMessage, mais
// abaixo — MESMO bug, parâmetro nomeado phoneE164 mas nada garantia isso)
// tratam o número como internacional inválido — WhatsApp não confunde com
// o número certo, simplesmente rejeita.
//
// Só cobre o formato brasileiro (DDD + número, com ou sem o "55" na
// frente) — é o único país que este produto atende hoje (ver também
// src/lib/timezone.ts, que assume Brasília pelo mesmo motivo). Números já
// fora desses formatos esperados (nem 10/11 dígitos locais, nem 12/13 já
// com 55) voltam como vieram, sem adivinhar — melhor um número que ainda
// pode falhar do que um que a gente corrompeu tentando "consertar".
export function normalizeBrazilianWhatsappNumber(rawPhone: string): string {
  const result = validateBrazilianPhone(rawPhone);
  // Mantém o comportamento best-effort de sempre pra quem já chama esta
  // função hoje (sendWhatsappMessage — envio pra um telefone JÁ salvo,
  // nunca deveria travar um envio por causa de um dado legado gravado
  // antes de validateBrazilianPhone existir): se não validar, devolve só
  // os dígitos, sem adivinhar. A validação de verdade (rejeitar e nunca
  // salvar) é responsabilidade de quem CAPTURA o telefone agora — ver
  // validateBrazilianPhone, usada em saveLeadPhone (conversation-pipeline.ts).
  return result.valid ? result.e164 : rawPhone.replace(/\D/g, "");
}

// Bug real reportado: "998223038" (9 dígitos, sem DDD) era salvo direto em
// Lead.phone e na descrição do evento do Google Calendar — o código antigo
// só sabia ADICIONAR o "55" quando o número já vinha com DDD (10/11
// dígitos); qualquer outro tamanho (8/9 dígitos, sem DDD) caía no fallback
// "devolve como veio", sem nenhuma validação de verdade. DDD é sempre
// obrigatório pro WhatsApp funcionar — esta função é a validação de
// verdade, usada só no momento de CAPTURAR o telefone (saveLeadPhone),
// nunca no envio (que precisa continuar best-effort pra não quebrar
// clínicas com dado legado já salvo antes desta correção existir).
//
// Ordem importa: remove dígito 0 inicial ANTES de checar o prefixo "55" —
// é o que faz "021998223038" (DDD com 0 na frente, erro comum de digitação)
// virar "21998223038" (11 dígitos, válido) em vez de ficar com 12 dígitos
// e cair no caminho errado. Só remove o "55" quando o resultado tiver 12
// ou 13 dígitos — em 10 ou 11 dígitos "55" pode ser o PRÓPRIO DDD (Rio de
// Janeiro/Niterói), então removê-lo ali destruiria um número válido.
export function validateBrazilianPhone(
  rawPhone: string
): { valid: true; localDigits: string; e164: string } | { valid: false; reason: string } {
  let digits = rawPhone.replace(/\D/g, "");
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }

  if (digits.length === 10 || digits.length === 11) {
    return { valid: true, localDigits: digits, e164: `55${digits}` };
  }

  return {
    valid: false,
    reason:
      `Telefone inválido: "${rawPhone}" tem ${digits.length} dígito(s) depois de limpar (DDD + número precisa ` +
      `ter 10 ou 11 dígitos) — provavelmente falta o DDD. Peça o número completo, com DDD, antes de salvar.`,
  };
}

// Formata pra exibição legível (ex.: na descrição do evento do Google
// Calendar) — "(21) 99822-3038" em vez do E.164 cru ("5521998223038").
// Só formata o que já bate com um celular (DDD + 9 dígitos) ou fixo (DDD +
// 8 dígitos) brasileiro válido; qualquer outra coisa volta como veio, sem
// adivinhar (mesmo princípio de normalizeBrazilianWhatsappNumber acima).
export function formatBrazilianPhoneForDisplay(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    digits = digits.slice(2);
  }
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  if (rest.length === 9) {
    return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  }
  if (rest.length === 8) {
    return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }
  return phone;
}

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

  // Apesar do nome do parâmetro, nada garantia até aqui que phoneE164
  // realmente vinha em E.164 — ver normalizeBrazilianWhatsappNumber acima
  // pro bug real que isso corrige.
  const number = normalizeBrazilianWhatsappNumber(phoneE164);

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

// Alerta de NÍVEL DE CONEXÃO (não de uma conversa/lead específico) — a
// clínica inteira precisa reconectar o Google Calendar (invalid_grant, ver
// markGoogleCalendarNeedsReconnect em src/lib/google-calendar.ts). Mandado
// só UMA vez por falha (não repete a cada nova tentativa de agendar/checar
// disponibilidade enquanto a reconexão não acontece) — diferente de
// formatEscalationAlert, que é por conversa e não tem conceito de "só uma
// vez".
export function formatGoogleCalendarReconnectAlert(params: { clinicName: string; reason: string }): string {
  return [
    `*VEXO — Google Calendar desconectado*`,
    `Clínica: ${params.clinicName}`,
    `A conexão com o Google Calendar caiu e precisa ser refeita — agendamentos não estão sendo criados/consultados na agenda real até isso ser resolvido.`,
    `Motivo técnico: ${params.reason}`,
    `Reconecte em Conexões > Google Calendar (botão "Reconectar").`,
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

// Confirmação IMEDIATA do agendamento — diferente de formatReminderMessage
// (lembrete de véspera, 12h/3h antes, ver ReminderConfig/reminders.ts):
// esta sai assim que o horário é confirmado E o WhatsApp do lead fica
// disponível, não numa janela fixa antes da consulta. Bug real reportado:
// nenhuma mensagem chegava por WhatsApp confirmando o agendamento — só o
// vídeo institucional (Instagram) e os lembretes de véspera existiam; um
// lead que nunca mais abrisse o Instagram não tinha nenhuma confirmação
// por escrito de que o horário foi marcado.
export function formatAppointmentConfirmationMessage(params: {
  leadFirstName: string;
  scheduledAt: Date;
  clinicAddress?: string | null;
}): string {
  const dataHorario = formatDateTimeLabel(params.scheduledAt, new Date());
  const addressLine = params.clinicAddress?.trim() ? `\n📍 ${params.clinicAddress.trim()}` : "";

  return (
    `Oi, ${params.leadFirstName}! Seu horário está confirmado para ${dataHorario}.${addressLine}\n` +
    `Qualquer imprevisto, é só me chamar por aqui. Até lá! 💙`
  );
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
// Exportada (não só usada aqui dentro) pra formatAppointmentConfirmationMessage
// reaproveitar a mesma formatação, em vez de duplicar a lógica.
export function formatDateTimeLabel(date: Date, now: Date): string {
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
