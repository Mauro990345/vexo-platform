import { prisma } from "@/lib/prisma";
import {
  classifyConversation,
  classifyAttendanceReply,
  generateLeadReply,
  summarizeOlderTurns,
  type AgentTools,
  type ChatTurn,
  type AttendanceReplyDecision,
} from "@/lib/anthropic";
import { buildConversationContext, withOlderSummary } from "@/lib/conversation-context";
import {
  checkAvailability,
  createCalendarEvent,
  updateCalendarEvent,
  updateCalendarEventDescription,
  getRawBusyPeriods,
  BUSINESS_HOURS_START_UTC,
  BUSINESS_HOURS_END_UTC,
} from "@/lib/google-calendar";
import {
  getInstagramUserProfile,
  getInstagramConversationParticipantUsername,
  getInstagramProfilePicture,
} from "@/lib/instagram";
import { PROFILE_PICTURE_REFRESH_WINDOW_MS } from "@/lib/lead-profile-picture-backfill";
import { decryptToken } from "@/lib/crypto";
import { computeAdaptiveDelaySeconds, FAST_REPLY_DELAY_SECONDS } from "@/lib/scheduler";
import { DEFAULT_CONVERSATION_SYSTEM_PROMPT } from "@/lib/default-prompt";
import {
  formatAppointmentConfirmationMessage,
  validateBrazilianPhone,
  formatBrazilianPhoneForDisplay,
  formatDateTimeLabel,
} from "@/lib/whatsapp";
import { cancelPendingFollowUp, getSilenceHours, applyTemplateVariables, getFollowUpWindowSettings } from "@/lib/follow-up";
import { nextValidSendTime } from "@/lib/follow-up-window";
import { toChatHistory } from "@/lib/chat-history";
import { buildResultPhotoMessages, type ResultPhotoInput } from "@/lib/result-photo-message";
import { detectStagnation, STAGNATION_SIMILARITY_THRESHOLD, STAGNATION_WINDOW_SIZE } from "@/lib/loop-guard";
import { parseBrazilLocalDateTime, formatAsBrazilLocalDateTime, startOfBrazilDay } from "@/lib/timezone";
import { resolveBatchTimestamps } from "@/lib/message-batch-timestamps";

export { toChatHistory } from "@/lib/chat-history";

// Usado quando Clinic.confirmationVideoCaption está vazio (editável em
// /crm/clinicas/[id]/agente-ia) — ver a ferramenta scheduleAppointment mais abaixo.
const DEFAULT_CONFIRMATION_VIDEO_CAPTION = "Vou te mandar um vídeo rápido mostrando como é o nosso atendimento 🙂";

// Textos fixos do cartão de contato da clínica (Generic Template, ver
// sendInstagramGenericTemplateCard, instagram.ts) mandado ao lead que pede
// pra falar com humano, no lugar do link cru de WhatsApp em texto — pedido
// explícito: subtítulo e texto do botão sempre iguais, só o título (nome
// da clínica) e a URL do botão mudam por clínica/conversa.
export const CLINIC_CONTACT_CARD_SUBTITLE = "Fale com a equipe pelo WhatsApp";
export const CLINIC_CONTACT_CARD_BUTTON_TITLE = "Abrir WhatsApp";

// Bug real em produção: o cartão saía DE NOVO num turno sem nenhum pedido
// novo de humano (classificador reagindo a um pedido antigo que nunca
// "saiu" do histórico — ver classifierCutoff/clinicContactCardSentAt,
// mais abaixo). Mesmo com esse corte corrigido, um pedido LEGÍTIMO e novo
// dentro de uma janela curta (ex.: o lead insiste, ou pede de novo por
// impaciência) não deveria gerar um SEGUNDO cartão — a conversa já tem um
// válido por essa janela. Nomeada (não um número solto) pra deixar
// explícito o que esse intervalo significa.
export const CLINIC_CONTACT_CARD_RESEND_COOLDOWN_MS = 60 * 60 * 1000;

// Mesma validação de Lead.phone (ver validateBrazilianPhone/saveLeadPhone)
// aplicada a Clinic.clientWhatsappNumber — null/vazio/inválido (ex.:
// faltando DDD) devolve null, o que mantém o comportamento de sempre
// (escalar pra NEEDS_HUMAN) no branch de needsHuman, mais abaixo. Exportada
// só pra teste (mesmo padrão de buildAvailabilityCheck, acima) — é usada
// dentro de handleInboundInstagramMessage, que não dá pra testar direto.
export function resolveClinicWhatsappLink(clientWhatsappNumber: string | null | undefined): string | null {
  const validation = validateBrazilianPhone(clientWhatsappNumber ?? "");
  return validation.valid ? validation.e164 : null;
}

// Até onde cortar a janela do classificador (classifyConversation julga a
// conversa INTEIRA, não só a mensagem nova — ver comentário grande em
// handleInboundInstagramMessage) — usa o corte mais recente entre
// Conversation.humanReviewedAt (escalonamento resolvido manualmente por
// um humano) e Conversation.clinicContactCardSentAt (cartão de contato já
// enviado pra esse mesmo pedido). CAUSA RAIZ do bug real corrigido aqui:
// o cartão nunca escalona pra NEEDS_HUMAN (esse é o ponto dele), então
// humanReviewedAt nunca era marcado nesse caminho — sem
// clinicContactCardSentAt, o pedido de humano que gerou o cartão nunca
// "saía" do transcript, e a primeira mensagem comercial normal de um
// turno seguinte reclassificava needsHuman=true de novo, reenviando o
// cartão sem nenhum pedido novo. Função pura, extraída e exportada só
// pra teste (mesmo padrão de buildAvailabilityCheck, acima) — usada
// dentro de handleInboundInstagramMessage, que não dá pra testar direto.
export function resolveClassifierHistoryCutoff(params: {
  humanReviewedAt: Date | null;
  clinicContactCardSentAt: Date | null;
}): Date | null {
  return [params.humanReviewedAt, params.clinicContactCardSentAt].reduce<Date | null>(
    (latest, d) => (d && (!latest || d > latest) ? d : latest),
    null
  );
}

// Decide, pro turno atual, se o cartão de contato deve ser mandado e se a
// escalação pra NEEDS_HUMAN deve ser suprimida — separado do corte do
// classificador acima porque resolve um problema DIFERENTE: mesmo com o
// corte corrigindo a causa raiz (classificador não resuscita mais um
// pedido antigo), um pedido NOVO e legítimo de humano, repetido pelo lead
// dentro de uma janela curta (ex.: insistência, impaciência), ainda não
// deveria gerar um SEGUNDO cartão — ver CLINIC_CONTACT_CARD_RESEND_COOLDOWN_MS,
// acima. Em cooldown, a escalação continua suprimida mesmo assim (nunca
// escala só porque está em cooldown — a resposta certa é a IA responder
// normalmente, sem cartão novo e sem nenhuma instrução especial). Função
// pura, exportada só pra teste.
export function resolveClinicContactCardDecision(params: {
  needsHuman: boolean;
  hasValidClinicWhatsapp: boolean;
  clinicContactCardSentAt: Date | null;
  now: Date;
}): { suppressHumanEscalation: boolean; wantsHumanWithClinicWhatsapp: boolean } {
  const cardSentRecently = Boolean(
    params.clinicContactCardSentAt &&
      params.now.getTime() - params.clinicContactCardSentAt.getTime() < CLINIC_CONTACT_CARD_RESEND_COOLDOWN_MS
  );
  const suppressHumanEscalation = params.needsHuman && params.hasValidClinicWhatsapp;
  const wantsHumanWithClinicWhatsapp = suppressHumanEscalation && !cardSentRecently;
  return { suppressHumanEscalation, wantsHumanWithClinicWhatsapp };
}

// Monta o bloco de contexto pra IA quando o cartão de contato vai sair
// neste mesmo turno (ver clinicContactContext/wantsHumanWithClinicWhatsapp,
// mais abaixo) — ao contrário da versão anterior, a IA não recebe mais
// nenhum link ou número pra repassar: o cartão (com o botão "Abrir
// WhatsApp") é montado e enviado inteiramente pelo sistema, numa Message
// separada (ver buildClinicContactCardMessage e o bloco logo depois de
// generateLeadReply). Pedido explícito: a IA nunca deve escrever link nem
// número nesta resposta — só responder normalmente ao pedido do lead.
// Exportada só pra teste.
export function buildClinicContactContext(clinicName: string): string {
  return (
    `[O lead pediu para falar com a equipe/um humano. O sistema vai enviar, junto com esta sua ` +
    `resposta, um cartão clicável com o contato da ${clinicName} pelo WhatsApp — você NÃO deve ` +
    `escrever nenhum link, número de telefone ou instrução de como entrar em contato nesta ` +
    `resposta; o cartão já resolve isso. Só responda normalmente ao lead (ex.: confirmando que vai ` +
    `passar o contato da equipe), sem mencionar WhatsApp, número ou link nenhum.]`
  );
}

// Dados do cartão de contato guardados em Message.clinicContactCard (JSON)
// — mesmo padrão de PendingAttendanceStep/encodePendingAttendanceStep, mais
// abaixo: dispatchOneMessage (dispatch.ts) decodifica isso na hora de
// enviar pra montar o Generic Template (sendInstagramGenericTemplateCard,
// instagram.ts). clinicId só serve pra log/diagnóstico em caso de erro — a
// URL do botão já vem pronta em whatsappE164.
export type ClinicContactCard = { clinicId: string; clinicName: string; whatsappE164: string };

export function encodeClinicContactCard(card: ClinicContactCard): string {
  return JSON.stringify(card);
}

// null em qualquer JSON inválido/inesperado — mesmo espírito defensivo de
// decodePendingAttendanceStep, mais abaixo: um valor corrompido não pode
// travar o despacho da mensagem, só forçar o fallback em texto (ver
// dispatchOneMessage, dispatch.ts).
export function decodeClinicContactCard(raw: string): ClinicContactCard | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.clinicId === "string" &&
      typeof parsed.clinicName === "string" &&
      typeof parsed.whatsappE164 === "string"
    ) {
      return parsed as ClinicContactCard;
    }
  } catch {
    // ignora — JSON inválido cai no null abaixo
  }
  return null;
}

// Texto de fallback mandado como mensagem de texto normal no lugar do
// cartão, só quando a Graph API rejeita o cartão (ver dispatchOneMessage,
// dispatch.ts) — nunca mostra o número da clínica, só o link de redirect
// do próprio VEXO (rota pública /c/[id], src/app/c/[id]/route.ts), que
// resolve pra https://wa.me/<dígitos> sem expor nenhum outro dado da
// clínica. Mesma convenção de process.env.APP_URL usada em
// src/app/acesso/[token]/route.ts (nunca inferida da requisição). Exportada
// só pra teste.
export function buildClinicContactFallbackText(clinicName: string, clinicId: string): string {
  const appUrl = process.env.APP_URL ?? "";
  return `Pra falar direto com a equipe da ${clinicName} pelo WhatsApp, é só clicar aqui: ${appUrl}/c/${clinicId}`;
}

// Sequência de confirmação de presença (apresentação -> vídeo institucional
// -> cafezinho -> frase final) — ver fireAttendanceConfirmationSequence,
// PendingAttendanceStep e dispatch.ts. Constantes nomeadas de propósito
// (antes eram números soltos dentro da função) — ajuste aqui pra mudar o
// timing sem precisar caçar literais pelo arquivo.
//
// Intervalo entre o fim do turno (ou o disparo do job de timeout) e a
// frase que anuncia o vídeo — a API do Instagram não deixa combinar texto
// + mídia numa única mensagem, então vídeo e apresentação saem sempre como
// dois envios separados.
//
// 10s -> 15s (ajuste anterior): o gap entre a resposta da IA (confirmação
// do agendamento) e a apresentação do vídeo era MENOR que o intervalo do
// worker de despacho (dispatchDueMessages, a cada 15s — ver
// DISPATCH_INTERVAL_MS, src/worker/index.ts) — mesmo com a âncora corrigida
// (afterScheduledFor buscado no banco, nunca no passado — ver
// fireAttendanceConfirmationSequence), ainda existia uma janela estrutural
// em que as duas mensagens caíam no MESMO ciclo de 15s e saíam coladas, sem
// pausa real entre elas. 15s elimina essa janela por completo: o gap
// agendado nunca é menor que o próprio intervalo do worker. Mantida nesse
// valor no ajuste atual (pedido explícito).
const ATTENDANCE_VIDEO_INTRO_DELAY_MS = 15_000;
// Vídeo, cafezinho e frase final: cada um ancorado no ENVIO REAL (sentAt,
// confirmado por dispatchDueMessages) do elo ANTERIOR — nunca num
// scheduledFor calculado adiantado no momento da criação de um elo mais
// cedo na cadeia. Mesmo motivo sempre: a Meta aceita o pedido de um vídeo
// rápido, mas busca/processa a mídia de forma assíncrona do lado deles —
// um elo de texto puro (entrega quase instantânea) agendado num relógio
// cego podia chegar ANTES do elo anterior mesmo com os scheduledFor/sentAt
// na ordem certa dos dois lados nossos. Ver PendingAttendanceStep,
// encodePendingAttendanceStep/decodePendingAttendanceStep e o uso em
// dispatch.ts — cada elo só é criado depois de CONFIRMAR o SENT do
// anterior, nunca em lote junto com ele (o que também garante, por
// construção, que dois elos consecutivos nunca saem no mesmo ciclo do
// dispatch: a Message do próximo elo não existe ainda quando o `due` do
// ciclo atual foi lido — só entra na consulta do ciclo seguinte).
//
// 10s -> 5s (ajuste pedido): investigação mostrou que o intervalo REAL
// entre apresentação e vídeo chegava a ~30s, bem acima deste valor
// nominal — não por ele estar errado, mas porque o elo criado aqui só era
// pego pelo PRÓXIMO ciclo do cron de 15s (dispatchDueMessages), somando
// até 15s de espera adicional + o próprio tempo de envio. A partir desta
// mudança, dispatch.ts agenda um despacho antecipado (scheduleEagerDispatch)
// pra este elo logo depois de criado, em vez de esperar o próximo ciclo —
// o intervalo real passa a bater perto deste valor nominal.
export const ATTENDANCE_VIDEO_DELAY_AFTER_INTRO_MS = 5_000;
// Exportada pra dispatch.ts reaproveitar o mesmo número, sem duplicar a
// constante. 20s -> 10s (ajuste pedido: toda a cadeia unificada em +10s
// por elo).
export const ATTENDANCE_TIP_DELAY_AFTER_VIDEO_MS = 10_000;
// Frase final ("Perfeito, até [dia].") — mesmo intervalo dos outros elos.
export const ATTENDANCE_FINAL_DELAY_AFTER_TIP_MS = 10_000;
// Tempo de espera pela resposta do lead à pergunta de presença antes do
// job de timeout disparar a sequência sozinho (ver
// processAttendanceConfirmationTimeouts) — respeitando a janela de envio
// do follow-up (FollowUpSettings): se vencer fora da janela, adia pro
// próximo ciclo em que a janela estiver aberta, nunca descarta.
const ATTENDANCE_AUTO_SEND_AFTER_MS = 60 * 60 * 1000; // 1h
// Usado quando Clinic.attendanceTipMessage está vazio (editável em
// /crm/clinicas/[id]/agente-ia) — mesmo padrão de
// DEFAULT_CONFIRMATION_VIDEO_CAPTION acima. Antes esse texto era escrito
// livremente pela própria IA a cada vez; agora é fixo (por clínica), pra
// garantir ordem (sempre depois do vídeo) e permitir disparo sem
// depender de uma mensagem nova do lead (ver timeout de 1h acima).
const DEFAULT_ATTENDANCE_TIP_MESSAGE =
  "Se puder, chegue uns 15 minutinhos antes, teremos um cafezinho te esperando.";

// Última mensagem da cadeia (ver ATTENDANCE_FINAL_DELAY_AFTER_TIP_MS acima)
// — mesmo padrão de DEFAULT_ATTENDANCE_TIP_MESSAGE: texto fixo por clínica
// (Clinic.attendanceFinalMessage), nunca escrito pela IA. "{{dia}}" é
// substituído por describeAppointmentDay (abaixo) — "amanhã", "hoje" ou o
// dia da semana, calculado a partir de Appointment.scheduledAt no momento
// em que a sequência começa (ver fireAttendanceConfirmationSequence). Sem
// exclamação/emoji/travessão (pedido explícito) — tom neutro, mesma família
// das outras mensagens fixas da sequência.
const DEFAULT_ATTENDANCE_FINAL_MESSAGE = "Perfeito, até {{dia}}.";

const WEEKDAY_NAMES_PT_BR = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// "amanhã"/"hoje"/dia da semana, comparando o DIA em Brasília (startOfBrazilDay,
// src/lib/timezone.ts) do agendamento contra o de "agora" — nunca a
// diferença em horas corridas (um agendamento às 23h50 de "hoje" não pode
// virar "amanhã" só porque faltam poucas horas, e um às 00h10 de "amanhã"
// não pode virar "hoje" só por estar a poucas horas de distância).
function describeAppointmentDay(scheduledAt: Date, now: Date): string {
  const diffDays = Math.round(
    (startOfBrazilDay(scheduledAt).getTime() - startOfBrazilDay(now).getTime()) / (24 * 60 * 60 * 1000)
  );
  if (diffDays === 0) return "hoje";
  if (diffDays === 1) return "amanhã";
  // startOfBrazilDay devolve o instante UTC correspondente à meia-noite em
  // Brasília daquele dia — como o deslocamento fixo (+3h) nunca atravessa
  // a virada de dia em UTC partindo de 00:00 BRT, getUTCDay() já é o dia da
  // semana certo em Brasília, sem precisar de mais nenhuma conversão.
  return WEEKDAY_NAMES_PT_BR[startOfBrazilDay(scheduledAt).getUTCDay()]!;
}

function resolveAttendanceFinalMessage(clinicTemplate: string | null | undefined, scheduledAt: Date, now: Date): string {
  const template = clinicTemplate?.trim() || DEFAULT_ATTENDANCE_FINAL_MESSAGE;
  return template.replaceAll("{{dia}}", describeAppointmentDay(scheduledAt, now));
}

// Carregado no campo Message.pendingAttendanceStep (JSON) — descreve o
// PRÓXIMO elo da cadeia de confirmação de presença e tudo que ele precisa
// pra ser criado, mais o que os elos SEGUINTES vão precisar (appointmentId/
// scheduledAtMs/finalText viajam por toda a cadeia, não só pro elo
// imediatamente seguinte). Ver dispatch.ts — só é consumido depois de
// confirmar o SENT do elo atual.
export type PendingAttendanceStep =
  | { next: "video"; mediaUrl: string; tipText: string; finalText: string; appointmentId: string; scheduledAtMs: number }
  | { next: "tip"; tipText: string; finalText: string; appointmentId: string; scheduledAtMs: number }
  | { next: "final"; finalText: string; appointmentId: string; scheduledAtMs: number };

export function encodePendingAttendanceStep(step: PendingAttendanceStep): string {
  return JSON.stringify(step);
}

// null em qualquer JSON inválido/inesperado — defensivo (nunca deveria
// acontecer, já que só este arquivo escreve este campo), mas um valor
// corrompido não pode travar o despacho da mensagem em si, só pular o
// próximo elo (mesmo espírito de "falha num elo nunca envia o próximo
// sozinho", ver comentário grande em fireAttendanceConfirmationSequence).
export function decodePendingAttendanceStep(raw: string): PendingAttendanceStep | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      (parsed.next === "video" || parsed.next === "tip" || parsed.next === "final")
    ) {
      return parsed as PendingAttendanceStep;
    }
  } catch {
    // ignora — JSON inválido cai no null abaixo
  }
  return null;
}

export type InboundInstagramEvent = {
  igUserId: string; // ID da conta profissional do Instagram da clínica (destinatária)
  leadIgScopedId: string;
  leadIgUsername?: string;
  // Em ordem cronológica, sempre com pelo menos 1 item. Mais de 1 quando o
  // debounce (ver src/lib/inbound-debounce.ts) agrupa mensagens do MESMO
  // lead chegando em sequência rápida — bug real reportado: o lead mandou
  // "Oi" e, poucos segundos depois, "Ainda não pensei nisso"; como cada
  // mensagem virava sua PRÓPRIA chamada desta função, a IA respondia "Oi"
  // isoladamente (um cumprimento solto) antes de sequer ter visto a
  // segunda mensagem, em vez de responder as duas juntas com o contexto
  // completo. Cada mensagem do lote ainda vira sua PRÓPRIA linha em
  // Message (preserva o igMessageId de cada uma pra proteção de
  // reentrega, e mostra no CRM exatamente o que o lead mandou, como
  // mandou) — só a geração da resposta da IA que passa a considerar o
  // lote inteiro de uma vez, não mensagem por mensagem.
  messages: { text: string; igMessageId?: string; timestamp: Date }[];
};

// Fronteira entre a IA (que só fala em horário de Brasília, sem nenhuma
// conversão — ver src/lib/timezone.ts) e checkAvailability (que trabalha
// inteiramente em UTC, formato exigido pela API do Google Calendar). Toda
// a matemática de fuso fica aqui, nunca do lado do modelo.
//
// Bug real em produção, investigado a fundo depois de descartar o PR #33
// como causa: o lead questionou um horário JÁ CONFIRMADO ("tem certeza que
// às 10h está ocupado?"), a IA rechamou check_availability, viu esse
// horário como ocupado — CORRETO, o evento existe mesmo, foi a própria IA
// quem criou — e concluiu, errado, que havia um conflito de verdade,
// dizendo ao lead que o agendamento não era válido. Não é bug de fuso
// horário nem de escrita/leitura inconsistente no Google Calendar
// (confirmado: createCalendarEvent e checkAvailability sempre usam
// .toISOString() puro, sempre UTC, nunca há um campo timeZone separado
// pra divergir) — é a ausência de qualquer sinal dizendo à IA "esse
// horário ocupado é a SUA PRÓPRIA reserva". A ferramenta em si (freebusy
// do Google) não distingue "ocupado por mim" de "ocupado por outra
// pessoa" — nunca distinguiu — então essa distinção precisa ser feita
// aqui, cruzando o horário consultado com o Appointment ativo desta
// conversa, e devolvida explicitamente pra IA em vez de depender dela
// adivinhar pela ausência do horário em `slots`.
// onGoogleFailure: chamado só quando checkAvailability (a chamada de
// verdade ao Google) falha de fato — nunca em erro de parsing das datas
// (isso é a IA passando algo inválido, não uma falha de sistema). Bug real
// corrigido aqui: antes, QUALQUER erro dentro deste try (incluindo
// invalid_grant/token revogado/5xx do Google) virava só `{error:
// err.message}` devolvido pra IA — que podia acabar dizendo ao lead algo
// como "esse horário não está disponível", uma causa inventada pra um
// problema que não tinha nada a ver com a agenda estar ocupada. Agora esse
// caso é sinalizado pro chamador (handleInboundInstagramMessage) via este
// callback, que decide separadamente escalar pra revisão humana e mandar
// uma mensagem neutra ao lead — nunca "indisponível", nunca "confirmado".
// Exportado (só pra teste, ver conversation-pipeline.test.ts) — reaproveita
// o mesmo padrão já usado por toChatHistory (re-exportado no topo deste
// arquivo): expõe uma função internamente pura o bastante pra testar
// isolada, sem precisar montar todo o resto de handleInboundInstagramMessage.
export function buildAvailabilityCheck(
  clinicId: string,
  conversationId: string,
  onGoogleFailure: (reason: string) => void
): AgentTools["checkAvailability"] {
  return async ({ dateFromLocal, dateToLocal }) => {
    let dateFrom: string;
    let dateTo: string;
    try {
      dateFrom = parseBrazilLocalDateTime(dateFromLocal).toISOString();
      dateTo = parseBrazilLocalDateTime(dateToLocal).toISOString();
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Datas inválidas." };
    }

    // Bug real corrigido (caso Mauro Camargo, 06/10 ~19:38): nada aqui
    // comparava dateFrom com dateTo antes de repassar os dois pro Google
    // como timeMin/timeMax — ao reconfirmar um horário específico ("9h
    // fica bom"), o modelo chamou check_availability com dateFromLocal ==
    // dateToLocal (tratando como um instante, não uma janela), gerando um
    // intervalo de largura ZERO. O Google rejeita isso com "The specified
    // time range is empty", que virava uma falha "real" de sistema
    // (NEEDS_HUMAN) pra um lead que só confirmou um horário normalmente.
    //
    // dateTo === dateFrom não é tratado como erro — é a forma mais comum
    // de o modelo pedir "esse horário específico está livre?", então
    // estende a janela sozinho pra 1h (mesma duração de todo agendamento,
    // ver createCalendarEvent) e segue a consulta normalmente, sem nunca
    // devolver isso como problema pra IA. Só dateTo < dateFrom (datas
    // realmente invertidas — sem leitura razoável) vira erro de
    // ferramenta, do mesmo jeito que qualquer outro argumento inválido já
    // tratado aqui (ex.: Datas inválidas acima) — o modelo corrige e tenta
    // de novo no mesmo turno, sem precisar de nenhuma instrução nova de
    // prompt.
    if (dateTo < dateFrom) {
      return {
        error:
          "dateToLocal não pode ser antes de dateFromLocal (intervalo invertido) — confira as duas datas e " +
          "tente de novo.",
      };
    }
    if (dateTo === dateFrom) {
      dateTo = new Date(new Date(dateFrom).getTime() + 60 * 60 * 1000).toISOString();
    }

    let slots: string[];
    try {
      slots = await checkAvailability(clinicId, dateFrom, dateTo);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao consultar o Google Calendar.";
      onGoogleFailure(`Falha ao consultar disponibilidade no Google Calendar (check_availability): ${message}`);
      return {
        error:
          "Sistema de agenda temporariamente indisponível — isto é uma falha real do sistema, NÃO diga ao lead " +
          "que algum horário está confirmado ou indisponível; isso será resolvido manualmente pela equipe.",
      };
    }

    const ownAppointment = await prisma.appointment.findFirst({
      where: {
        conversationId,
        status: { in: ["SCHEDULED", "CONFIRMED"] },
        scheduledAt: { gte: new Date(dateFrom), lt: new Date(dateTo) },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = {
      slots: slots.map((iso) => formatAsBrazilLocalDateTime(new Date(iso))),
      ...(ownAppointment ? { ownAppointmentLocal: formatAsBrazilLocalDateTime(ownAppointment.scheduledAt) } : {}),
    };

    console.log(
      `[vexo:calendar] check_availability conversationId=${conversationId} ` +
        `dateFromLocal=${dateFromLocal} dateToLocal=${dateToLocal} dateFromUtc=${dateFrom} dateToUtc=${dateTo} ` +
        `slots=${JSON.stringify(result.slots)} ownAppointmentLocal=${result.ownAppointmentLocal ?? "n/a"} ` +
        `ownAppointmentUtc=${ownAppointment?.scheduledAt.toISOString() ?? "n/a"}`
    );

    return result;
  };
}

// Decisão pura (sem chamada de rede/banco) usada dentro de scheduleAppointment
// pra decidir se start/end estão realmente livres, ignorando especificamente
// o período ocupado que corresponde ao evento GOOGLE ATUAL do agendamento já
// ativo desta conversa (se houver um, via ownAppointmentWindow) — bug real
// corrigido: remarcar pra um horário que se sobrepõe ao horário ATUAL do
// próprio agendamento (ex.: 14:00 -> 14:30) era recusado como "não está
// livre", porque o evento antigo ainda está no Google até ser movido (mais
// abaixo, se este passo passar) e o freebusy do Google não distingue
// "ocupado por mim mesmo" de "ocupado por outra pessoa". Só ignora o período
// que bate EXATAMENTE com ownAppointmentWindow (mesmo start/end) — qualquer
// outro período ocupado na janela (evento de outra pessoa, ou algo que não
// bate exatamente) continua bloqueando normalmente.
// Exportada só pra teste (mesmo padrão de buildAvailabilityCheck, acima).
export function isSlotFreeIgnoringOwnAppointment(params: {
  start: Date;
  end: Date;
  rawBusy: { start?: string | null; end?: string | null }[];
  ownAppointmentWindow?: { start: Date; end: Date };
}): boolean {
  const { start, end, rawBusy, ownAppointmentWindow } = params;
  return !rawBusy.some((b) => {
    if (!b.start || !b.end) return false;
    const busyStart = new Date(b.start).getTime();
    const busyEnd = new Date(b.end).getTime();
    if (
      ownAppointmentWindow &&
      busyStart === ownAppointmentWindow.start.getTime() &&
      busyEnd === ownAppointmentWindow.end.getTime()
    ) {
      return false;
    }
    return start.getTime() < busyEnd && end.getTime() > busyStart;
  });
}

export async function handleInboundInstagramMessage(
  event: InboundInstagramEvent,
  // ID da linha em WebhookLog dessa requisição (ver
  // api/webhooks/instagram/route.ts) — só usado pra gravar de volta nela o
  // motivo do descarte quando a conta não é encontrada, tornando isso
  // visível na tela /crm/webhook-logs em vez de só um console.warn
  // perdido nos logs do Railway (sem acesso). Opcional pra não quebrar
  // quem já chamava essa função sem esse contexto.
  webhookLogId?: string
) {
  // Diagnóstico TEMPORÁRIO (ver comentário grande mais abaixo, junto do log
  // de timing do delay artificial) — marca o início do processamento deste
  // evento pra medir quanto tempo a classificação + geração da resposta da
  // IA consomem ANTES do delay artificial (computeAdaptiveDelaySeconds)
  // sequer entrar em jogo — separa "tempo de processamento real" de "delay
  // configurado", que são coisas diferentes mas se somam no tempo total que
  // o lead observa.
  const pipelineStartedAt = Date.now();

  // Resolve timestamp ausente/inválido/muito fora do horário atual (cai pro
  // horário atual) e garante ordem estritamente crescente dentro do lote
  // mesmo quando duas mensagens vêm com o MESMO timestamp (a Meta só reporta
  // em segundos) — ver comentário grande em resolveBatchTimestamps,
  // message-batch-timestamps.ts, pro bug real que isso corrige (createdAt
  // empatado dentro da mesma transação, ORDER BY sem desempate, histórico
  // mesclado fora de ordem pro modelo). Calculado UMA vez aqui, no topo, e
  // reaproveitado em TUDO que precisaria do timestamp cru do Instagram
  // daqui pra baixo (marcar lastLeadMessageAt, checar silêncio, janela do
  // loop guard, leadResponseTimeSeconds etc.) — nunca lido de novo direto
  // de event.messages[...].timestamp nesta função. firstResolvedAt: quando
  // o lead começou a responder, sem inflar leadResponseTimeSeconds pelo
  // tempo que o debounce esperou por possíveis mensagens seguintes.
  // lastResolvedAt: a mais recente do lote, por ser o timestamp mais
  // próximo de "agora".
  const resolvedBatchTimestamps = resolveBatchTimestamps(event.messages.map((m) => m.timestamp));
  const firstResolvedAt = resolvedBatchTimestamps[0]!.sentAt;
  const lastResolvedAt = resolvedBatchTimestamps[resolvedBatchTimestamps.length - 1]!.sentAt;

  let igAccount = await prisma.instagramAccount.findFirst({
    where: { igUserId: event.igUserId },
    include: { clinic: true },
  });

  if (!igAccount) {
    // Auto-correção (era o botão manual "Corrigir ID do webhook") —
    // nenhum endpoint de OAuth desse produto devolve de antemão o ID que
    // a Meta manda de verdade nos eventos de webhook (ver comentário
    // grande em exchangeInstagramCode, src/lib/instagram.ts), então o
    // primeiro evento real de uma conta recém-conectada SEMPRE bate aqui.
    // Sem essa correção automática, isso exigia alguém abrir
    // /crm/webhook-logs, copiar o ID reportado e colar manualmente em
    // Conexões antes da primeira mensagem real ser respondida — pra toda
    // clínica nova, sempre. Só corrige sozinho quando existe EXATAMENTE
    // UMA conta ainda não confirmada (webhookIdVerified=false) — se houver
    // mais de uma (duas clínicas conectadas em sequência antes de
    // qualquer uma receber sua primeira mensagem real), a ambiguidade cai
    // pro fluxo manual de sempre, pra nunca arriscar corrigir a conta
    // errada.
    const unverified = await prisma.instagramAccount.findMany({
      where: { webhookIdVerified: false },
      include: { clinic: true },
    });

    const [onlyUnverified] = unverified;
    if (unverified.length === 1 && onlyUnverified) {
      const previousId = onlyUnverified.igUserId;
      igAccount = await prisma.instagramAccount.update({
        where: { id: onlyUnverified.id },
        data: { igUserId: event.igUserId, webhookIdVerified: true },
        include: { clinic: true },
      });
      const reason =
        `ID do webhook corrigido automaticamente pra clínica "${igAccount.clinic.name}": ` +
        `${previousId} → ${event.igUserId} (primeiro evento real confirmou o valor).`;
      console.warn(`[vexo] ${reason}`);
      if (webhookLogId) {
        await prisma.webhookLog
          .update({ where: { id: webhookLogId }, data: { matchFailureReason: reason } })
          .catch((err) => console.error("[vexo] Falha ao gravar correção automática de ID no WebhookLog:", err));
      }
    } else {
      const knownAccounts = await prisma.instagramAccount.findMany({
        select: { igUserId: true, igUsername: true },
      });
      const reason =
        `Nenhuma InstagramAccount encontrada pra igUserId="${event.igUserId}" (vindo do webhook) — ` +
        `${unverified.length === 0 ? "nenhuma" : unverified.length} conta(s) não confirmada(s), auto-correção pulada ` +
        `por ambiguidade. Contas conhecidas no banco: ${
          knownAccounts.length
            ? knownAccounts.map((a) => `${a.igUsername ?? "?"}=${a.igUserId}`).join(", ")
            : "(nenhuma)"
        }.`;
      console.warn(`[vexo] ${reason}`);
      if (webhookLogId) {
        await prisma.webhookLog
          .update({ where: { id: webhookLogId }, data: { matchFailureReason: reason } })
          .catch((err) => console.error("[vexo] Falha ao gravar motivo do descarte no WebhookLog:", err));
      }
      return;
    }
  }
  const clinic = igAccount.clinic;

  const lead = await prisma.lead.upsert({
    where: { clinicId_igScopedId: { clinicId: clinic.id, igScopedId: event.leadIgScopedId } },
    update: { igUsername: event.leadIgUsername ?? undefined },
    create: {
      clinicId: clinic.id,
      igScopedId: event.leadIgScopedId,
      igUsername: event.leadIgUsername,
    },
  });

  // O payload do webhook (event.sender.id) NUNCA traz nome/username do
  // lead — só o ID opaco (ver leadIgUsername acima, que na prática nunca
  // é preenchido por quem chama esta função a partir do webhook real).
  // Sem essa busca extra, Lead.name/igUsername ficam null pra sempre, e
  // {{primeiro_nome}} (ver applyTemplateVariables mais abaixo) substitui
  // certinho por uma string vazia — não é bug de substituição, é falta de
  // dado.
  //
  // Só tenta UMA VEZ por lead (nameLookupAttempted) — bug real em produção
  // encontrado ao investigar por que a busca "tentava de novo em toda
  // mensagem": pra uma conta pública normal, sem nada de privado, a busca
  // voltava vazia (sem "name" na resposta) EM TODA mensagem da conversa,
  // gastando uma chamada de API à toa a cada turno pra sempre, sem nunca
  // ter chance de dar certo (resultado consistente, não uma falha
  // transitória). @default(false) preserva a autocorreção pra leads já
  // existentes antes deste campo — a primeira mensagem seguinte ainda
  // tenta uma vez. Best effort, uma falha aqui não pode impedir a
  // conversa de continuar — mas registra o resultado (sucesso, falha ou
  // "sem nome retornado") em WebhookLog.processingError, senão uma falha
  // nessa chamada específica ficaria invisível pra sempre (só no console
  // do Railway, sem acesso), indistinguível de "a Meta genuinamente não
  // devolveu nome".
  if (!lead.name && !lead.nameLookupAttempted) {
    try {
      const profile = await getInstagramUserProfile(decryptToken(igAccount.accessTokenEnc), lead.igScopedId);
      if (profile.name) {
        await prisma.lead.update({ where: { id: lead.id }, data: { name: profile.name, nameLookupAttempted: true } });
        lead.name = profile.name;
      } else {
        await prisma.lead.update({ where: { id: lead.id }, data: { nameLookupAttempted: true } });
        if (webhookLogId) {
          await prisma.webhookLog
            .update({
              where: { id: webhookLogId },
              data: { processingError: `getInstagramUserProfile não devolveu "name" pra igScopedId=${lead.igScopedId} (resposta sem esse campo).` },
            })
            .catch((updateErr) => console.error("[vexo] Falha ao gravar diagnóstico de perfil do lead:", updateErr));
        }
      }
    } catch (err) {
      // NÃO marca nameLookupAttempted aqui — um erro pode ser transitório
      // (timeout, instabilidade da API), diferente de uma resposta válida
      // sem "name" (que é definitivo). Tenta de novo na próxima mensagem.
      console.error("[vexo] Falha ao buscar nome do perfil do lead:", err);
      if (webhookLogId) {
        const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
        await prisma.webhookLog
          .update({ where: { id: webhookLogId }, data: { processingError: `Falha ao buscar nome do lead: ${detail}`.slice(0, 4000) } })
          .catch((updateErr) => console.error("[vexo] Falha ao gravar diagnóstico de perfil do lead:", updateErr));
      }
    }
  }

  // Mesmo padrão do lookup de nome acima, endpoint diferente (Conversations
  // API, não o lookup de perfil por IGSID — ver comentário grande em
  // getInstagramConversationParticipantUsername, instagram.ts, pro porquê:
  // é o único jeito encontrado de obter o @ real do lead, já que o payload
  // do webhook nunca traz e o lookup de perfil só expõe "name"). Log
  // [vexo:username-lookup] permanente — sem acesso a log de produção neste
  // ambiente, é o único jeito de confirmar se esse endpoint está
  // funcionando de verdade contra uma conta real, e com qual resultado.
  if (!lead.igUsername && !lead.usernameLookupAttempted) {
    try {
      const { username } = await getInstagramConversationParticipantUsername(
        decryptToken(igAccount.accessTokenEnc),
        igAccount.igUserId,
        lead.igScopedId
      );
      if (username) {
        await prisma.lead.update({ where: { id: lead.id }, data: { igUsername: username, usernameLookupAttempted: true } });
        lead.igUsername = username;
        console.log(`[vexo:username-lookup] lead=${lead.id} igScopedId=${lead.igScopedId} -> @${username}`);
      } else {
        await prisma.lead.update({ where: { id: lead.id }, data: { usernameLookupAttempted: true } });
        console.log(`[vexo:username-lookup] lead=${lead.id} igScopedId=${lead.igScopedId} -> sem username na resposta`);
        if (webhookLogId) {
          await prisma.webhookLog
            .update({
              where: { id: webhookLogId },
              data: { processingError: `getInstagramConversationParticipantUsername não devolveu "username" pra igScopedId=${lead.igScopedId} (resposta sem esse campo, ou sem conversa encontrada).` },
            })
            .catch((updateErr) => console.error("[vexo] Falha ao gravar diagnóstico de username do lead:", updateErr));
        }
      }
    } catch (err) {
      // NÃO marca usernameLookupAttempted aqui — mesmo racional do lookup
      // de nome: um erro pode ser transitório, diferente de uma resposta
      // válida sem username (definitivo). Tenta de novo na próxima mensagem.
      console.error("[vexo:username-lookup] Falha ao buscar username do lead:", err);
      if (webhookLogId) {
        const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
        await prisma.webhookLog
          .update({ where: { id: webhookLogId }, data: { processingError: `Falha ao buscar username do lead: ${detail}`.slice(0, 4000) } })
          .catch((updateErr) => console.error("[vexo] Falha ao gravar diagnóstico de username do lead:", updateErr));
      }
    }
  }

  // Lookup automático da foto de perfil (por mensagem nova) — direto no
  // node do usuário por IGSID, MESMO produto/token já conectado (Instagram
  // Login), campo "profile_pic" (CONFIRMADO por teste real — ver
  // comentário grande em getInstagramProfilePicture, instagram.ts).
  // Substituiu o lookup via Business Discovery (produto SEPARADO, exigia
  // conexão própria E o lead ter conta Business/Creator E já ter @
  // descoberto) — esse aqui só precisa de um igScopedId real (guard
  // isRealIgScopedId, dentro de getInstagramProfilePicture), sem nenhum
  // dos outros pré-requisitos. Só a janela de refresh continua (ver
  // PROFILE_PICTURE_REFRESH_WINDOW_MS): URL de foto de perfil da Meta
  // costuma ser assinada/temporária.
  if (!lead.profilePictureFetchedAt || lead.profilePictureFetchedAt.getTime() < Date.now() - PROFILE_PICTURE_REFRESH_WINDOW_MS) {
    try {
      const { profilePictureUrl } = await getInstagramProfilePicture(decryptToken(igAccount.accessTokenEnc), lead.igScopedId);
      await prisma.lead.update({
        where: { id: lead.id },
        data: { profilePictureUrl: profilePictureUrl ?? null, profilePictureFetchedAt: new Date() },
      });
      lead.profilePictureUrl = profilePictureUrl ?? null;
      console.log(
        `[vexo:profile-picture-lookup] lead=${lead.id} igScopedId=${lead.igScopedId} -> ${profilePictureUrl ? "foto atualizada" : "sem foto na resposta"}`
      );
    } catch (err) {
      // NÃO marca profilePictureFetchedAt aqui — erro pode ser transitório
      // (rede, token expirado), tenta de novo na próxima mensagem.
      console.error("[vexo:profile-picture-lookup] Falha ao buscar foto de perfil do lead:", err);
      if (webhookLogId) {
        const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
        await prisma.webhookLog
          .update({ where: { id: webhookLogId }, data: { processingError: `Falha ao buscar foto de perfil do lead: ${detail}`.slice(0, 4000) } })
          .catch((updateErr) => console.error("[vexo] Falha ao gravar diagnóstico de foto de perfil do lead:", updateErr));
      }
    }
  }

  let conversation = await prisma.conversation.findFirst({
    where: {
      leadId: lead.id,
      status: { in: ["NEW", "IN_CONVERSATION", "SCHEDULED", "FOLLOW_UP", "NEEDS_HUMAN"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { clinicId: clinic.id, leadId: lead.id, status: "NEW" },
    });
  }

  // Conversa já escalonada para humano: a IA não retoma sozinha.
  if (conversation.status === "NEEDS_HUMAN") {
    // Captura o id numa const antes do closure do .map() — mesmo motivo de
    // sempre: `conversation` é `let` (pode ser null antes do bloco acima),
    // e o TypeScript não carrega o narrowing pra dentro de uma closure.
    const needsHumanConversationId = conversation.id;
    await prisma.message.createMany({
      data: event.messages.map((m, index) => ({
        conversationId: needsHumanConversationId,
        direction: "INBOUND" as const,
        sender: "LEAD" as const,
        content: m.text,
        igMessageId: m.igMessageId,
        sentAt: resolvedBatchTimestamps[index]!.sentAt,
        createdAt: resolvedBatchTimestamps[index]!.createdAt,
      })),
    });
    return;
  }

  const reopeningFromFollowUp = conversation.status === "FOLLOW_UP";

  // Reengajamento: o lead esfriou (entrou numa sequência de follow-up, OU
  // simplesmente ficou calado por mais tempo que o limiar de silêncio —
  // mesmo limiar que dispara o follow-up automático, ver silenceHours em
  // follow-up.ts, pra não ter dois números diferentes definindo "esfriou")
  // e voltou a interagir. Isso encerra o "fôlego" anterior da conversa —
  // reseta a trava de resultPhotoSentAt logo abaixo, liberando a IA pra
  // mandar outra foto de resultado se fizer sentido de novo, já que a trava
  // de 1 foto só vale dentro do mesmo fôlego, não pra vida inteira da
  // conversa.
  const silenceHours = await getSilenceHours();
  const wentSilent =
    Boolean(conversation.lastLeadMessageAt) &&
    firstResolvedAt.getTime() - conversation.lastLeadMessageAt!.getTime() > silenceHours * 60 * 60 * 1000;
  const reengaged = reopeningFromFollowUp || wentSilent;

  // Desempate por id (ver resolveBatchTimestamps acima) — ties de createdAt
  // continuam possíveis entre mensagens de TURNOS diferentes desta mesma
  // conversa (ex.: duas respostas da IA no mesmo $transaction, caso do
  // envio de foto de resultado com legenda — buildResultPhotoMessages), não
  // só dentro de um lote do lead. id é gerado no processo Node (cuid) na
  // mesma ordem de criação, então serve como desempate estável.
  const previousAiMessage = await prisma.message.findFirst({
    where: { conversationId: conversation.id, sender: "AI", direction: "OUTBOUND" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  // Mesmo motivo de sempre pra capturar numa const antes dos closures do
  // .map() abaixo — `conversation` é `let` e o TypeScript não carrega o
  // narrowing (já non-null aqui) pra dentro de uma função aninhada.
  const activeConversationId = conversation.id;
  await prisma.$transaction([
    ...event.messages.map((m, index) =>
      prisma.message.create({
        data: {
          conversationId: activeConversationId,
          direction: "INBOUND",
          sender: "LEAD",
          content: m.text,
          igMessageId: m.igMessageId,
          sentAt: resolvedBatchTimestamps[index]!.sentAt,
          createdAt: resolvedBatchTimestamps[index]!.createdAt,
        },
      })
    ),
    prisma.conversation.update({
      where: { id: activeConversationId },
      data: {
        lastLeadMessageAt: lastResolvedAt,
        lastMessageAt: lastResolvedAt,
        status: conversation.status === "NEW" || reopeningFromFollowUp ? "IN_CONVERSATION" : conversation.status,
        ...(reengaged ? { resultPhotoSentAt: null } : {}),
      },
    }),
  ]);

  // Lead respondeu durante uma sequência de follow-up ativa: fecha o(s) log(s)
  // aberto(s) e cancela qualquer mensagem de follow-up já enfileirada (mas
  // ainda não enviada de fato) — sem isso, um passo que o worker já tinha
  // colocado na fila segundos antes ainda sairia mesmo com o lead já tendo
  // respondido.
  if (reopeningFromFollowUp) {
    await cancelPendingFollowUp(conversation.id, lastResolvedAt);
  }

  // Proteção contra loop automático: sem isso, se o "lead" do outro lado
  // for na verdade outra conta comercial (a própria, ou qualquer bot
  // externo) respondendo automaticamente, cada resposta da IA vira uma
  // nova mensagem recebida pro outro lado, que responde de volta, e assim
  // indefinidamente — sem nenhuma trava natural pra parar sozinho (visto
  // em produção: dezenas de rodadas só interrompidas ao desconectar a
  // conta manualmente). Risco real de custo (cada rodada consome tokens
  // da API) além de péssima experiência. NÃO tenta identificar se o
  // remetente é outra InstagramAccount conectada — o ID que chega no
  // webhook (event.sender.id) é escopado por app/conversa, não dá pra
  // comparar com segurança contra o igUserId de outra clínica. Em vez
  // disso, um limite simples e independente de quem é o remetente: se a
  // IA já respondeu demais nesta conversa numa janela de tempo curta, para
  // e escalona pra humano revisar (@setConversationStatus é o único jeito
  // de devolver a conversa pra IA depois), em vez de continuar
  // respondendo automaticamente sem fim.
  //
  // Limiar calibrado pra pegar um loop de bot de verdade, não "muitas
  // mensagens" — bug real em produção: uma conversa de vendas normal, bem
  // engajada (8 mensagens da IA em 10 minutos, ~25s de latência média por
  // resposta — nada anormalmente rápido) disparava o escalonamento à toa
  // com o limiar antigo (8 msgs / 10 min). A partir da migração pro Luna
  // (via OpenRouter, bem mais barato que Sonnet/Haiku), o custo de uma
  // conversa longa deixou de ser uma preocupação real — o que passou a
  // importar de verdade é NUNCA interromper um lead engajado avançando
  // rumo ao agendamento, porque esse é um lead perdido silenciosamente
  // (ele só para de receber resposta, sem nenhum alerta de que algo deu
  // errado). Por isso este contador virou só a REDE DE SEGURANÇA FINAL —
  // a proteção principal contra loop de bot de verdade agora é o detector
  // de estagnação/repetição logo abaixo, que não depende de nenhum número
  // fixo de mensagens. 50 mensagens em 30 minutos (cadência de disparo: 1
  // a cada 36s sustentado) é generoso o bastante pra nunca incomodar
  // mesmo um lead humano bem falante — mas ainda existe caso o detector de
  // estagnação tenha algum furo.
  const LOOP_GUARD_WINDOW_MINUTES = 30;
  const LOOP_GUARD_MAX_AI_MESSAGES = 50;

  // Escalonamento compartilhado pelas duas proteções de loop abaixo (contagem
  // e estagnação) — mesmo efeito nos dois casos: pausa a conversa pra revisão
  // humana e avisa a clínica por WhatsApp, só muda o texto do motivo.
  //
  // Recebe conversationId em vez de fechar sobre `conversation` (que é `let`
  // e pode ser `null` antes do bloco acima) — dentro de uma closure como
  // esta o TypeScript não carrega a checagem de nulo já feita, então captura
  // o id já validado numa const logo abaixo em vez disso.
  const conversationId = conversation.id;
  async function escalateToHuman(reason: string): Promise<void> {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "NEEDS_HUMAN", needsHumanReason: reason },
    });
    // Cancela o timer de 1h da sequência de confirmação de presença (ver
    // ATTENDANCE_AUTO_SEND_AFTER_MS) — sem isso, um agendamento escalado
    // pra humano podia, dias depois, voltar a ser elegível pro job de
    // timeout se a conversa voltasse pra IN_CONVERSATION ("Devolver para a
    // IA") sem passar por um novo schedule_appointment (que é o único
    // outro ponto que reseta este campo). Nunca falha a escalada por isso
    // — se não houver agendamento pendente, é um no-op.
    await prisma.appointment.updateMany({
      where: { conversationId, status: { in: ["SCHEDULED", "CONFIRMED"] }, confirmationVideoSentAt: null },
      data: { attendancePromptSentAt: null },
    });
    // Aviso à secretária por WhatsApp REMOVIDO (regra de produto: o
    // WhatsApp da clínica serve só pra confirmação de agendamento ao lead
    // — ver maybeSendWhatsappConfirmation). Status NEEDS_HUMAN e o card
    // "Humano" (NeedsHumanBanner) continuam exatamente como estavam —
    // só o aviso por WhatsApp em si saiu.
  }

  const recentAiMessageCount = await prisma.message.count({
    where: {
      conversationId: conversation.id,
      sender: "AI",
      direction: "OUTBOUND",
      createdAt: { gte: new Date(lastResolvedAt.getTime() - LOOP_GUARD_WINDOW_MINUTES * 60 * 1000) },
    },
  });

  if (recentAiMessageCount >= LOOP_GUARD_MAX_AI_MESSAGES) {
    await escalateToHuman(
      `Possível loop automático: a IA já enviou ${recentAiMessageCount} mensagens nesta conversa nos ` +
        `últimos ${LOOP_GUARD_WINDOW_MINUTES} minutos — pausada para revisão humana em vez de continuar ` +
        `respondendo automaticamente (proteção contra loop com outro bot/conta conectada).`
    );
    return;
  }

  // Detector de estagnação/repetição — proteção PRINCIPAL contra loop de
  // bot de verdade (ver src/lib/loop-guard.ts pra a lógica de similaridade
  // por trás disso). Só avalia enquanto a conversa está ativamente em
  // atendimento pela IA (NEW/IN_CONVERSATION) — durante FOLLOW_UP as
  // mensagens são templates propositalmente parecidos entre si (não é
  // sinal de loop), e SCHEDULED/NEEDS_HUMAN nem chegam aqui de novo com a
  // IA respondendo automaticamente.
  //
  // MODO SOMBRA (combinado com o usuário): por enquanto só calcula e loga
  // a similaridade — NÃO pausa a conversa por esse motivo ainda. Roda
  // assim por alguns dias pra confirmar com dados reais se
  // STAGNATION_SIMILARITY_THRESHOLD/STAGNATION_WINDOW_SIZE (src/lib/loop-guard.ts)
  // são os valores certos antes de virar STAGNATION_GUARD_SHADOW_MODE pra
  // false e ativar de verdade.
  const STAGNATION_GUARD_SHADOW_MODE = true;
  const conversationActivelyInAi = conversation.status === "NEW" || conversation.status === "IN_CONVERSATION";
  if (conversationActivelyInAi) {
    const recentAiTexts = await prisma.message.findMany({
      where: {
        conversationId: conversation.id,
        sender: "AI",
        direction: "OUTBOUND",
        channel: "INSTAGRAM",
        mediaUrl: null,
      },
      // Desempate por id — ver comentário grande em resolveBatchTimestamps,
      // message-batch-timestamps.ts: duas respostas da IA no MESMO
      // $transaction (ex.: texto + foto de resultado com legenda) têm
      // createdAt empatado, e sem desempate a ordem "mais recente primeiro"
      // fica indefinida.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: STAGNATION_WINDOW_SIZE,
      select: { content: true },
    });

    if (recentAiTexts.length >= STAGNATION_WINDOW_SIZE) {
      const texts = recentAiTexts.map((m) => m.content).reverse();
      const { stuck, avgSimilarity, pairSimilarities } = detectStagnation(texts, {
        threshold: STAGNATION_SIMILARITY_THRESHOLD,
      });
      console.log(
        `[vexo:loop-guard-shadow] conversationId=${conversation.id} avgSimilarity=${avgSimilarity.toFixed(3)} ` +
          `threshold=${STAGNATION_SIMILARITY_THRESHOLD} stuck=${stuck} ` +
          `pairSimilarities=${pairSimilarities.map((s) => s.toFixed(2)).join(",")} textos=${JSON.stringify(texts)}`
      );

      if (stuck && !STAGNATION_GUARD_SHADOW_MODE) {
        await escalateToHuman(
          `Possível loop automático: as últimas ${STAGNATION_WINDOW_SIZE} respostas da IA nesta conversa estão ` +
            `muito parecidas entre si (similaridade média ${(avgSimilarity * 100).toFixed(0)}%, limiar ` +
            `${(STAGNATION_SIMILARITY_THRESHOLD * 100).toFixed(0)}%) — sem progressão real, pausada para revisão humana.`
        );
        return;
      }
    }
  }

  // Desempate por id — É A QUERY do bug real investigado: duas (ou mais)
  // mensagens do lead do MESMO lote (debounce) são criadas no MESMO
  // $transaction, com createdAt empatado (now()/CURRENT_TIMESTAMP é
  // congelado por transação no Postgres); "ORDER BY createdAt ASC" sem
  // nenhuma chave de desempate não garante NADA sobre a ordem relativa de
  // linhas empatadas. Sem o `id` aqui, toChatHistory (abaixo) podia mesclar
  // as duas mensagens do lead FORA de ordem no texto que vai pro modelo —
  // ele via as duas, só que embaralhadas, e respondia como se tivesse
  // ignorado uma delas. resolveBatchTimestamps (acima, na criação) já evita
  // o empate em mensagens NOVAS a partir de agora; isto aqui é a segunda
  // camada de defesa, pra qualquer linha antiga já empatada ou outro ponto
  // que ainda não passou por essa correção.
  const history = await prisma.message.findMany({
    where: { conversationId: conversation.id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const chatHistory = toChatHistory(history);

  // classifyConversation julga a conversa INTEIRA que recebe, não só a
  // mensagem nova — então, sem esse corte, o motivo que causou um
  // escalonamento anterior continua no transcript pra sempre (a reclamação
  // do lead não "deixa de ter acontecido" só porque um humano clicou
  // "Devolver para a IA"), e a primeira mensagem seguinte reescalona de
  // novo, mesmo sendo um assunto comercial normal e não repetitivo. Depois
  // que humanReviewedAt é marcado (setConversationStatus, único caller que
  // leva status pra IN_CONVERSATION), só as mensagens A PARTIR DESSE PONTO
  // entram na classificação — o histórico completo (chatHistory, acima)
  // continua indo pra geração da resposta da IA, que se beneficia do
  // contexto inteiro; só o classificador de bastidor precisa desse corte.
  //
  // BUG REAL em produção: o mesmo problema acontecia com o cartão de
  // contato da clínica (ver wantsHumanWithClinicWhatsapp, mais abaixo) —
  // esse caminho NUNCA escala pra NEEDS_HUMAN (é o ponto dele: a IA segue
  // respondendo normalmente), então humanReviewedAt nunca era marcado, e
  // o pedido de humano que disparou o cartão ficava no transcript pra
  // sempre. Resultado: um lead que pediu humano às 15:48 (recebeu o
  // cartão) e voltou às 18:57 com uma pergunta comercial normal recebia o
  // cartão DE NOVO — classifyConversation via o "quero falar com a
  // secretária" antigo ainda dentro da janela e reclassificava
  // needsHuman=true, mesmo sem nenhum pedido novo naquele turno. Corrigido
  // com o MESMO mecanismo: Conversation.clinicContactCardSentAt (marcado
  // junto da criação do cartão, mais abaixo) também corta a janela do
  // classificador — usa o corte mais recente entre os dois marcadores,
  // já que qualquer um dos dois significa "esse pedido antigo já foi
  // tratado, não julgue a conversa por causa dele de novo".
  const classifierCutoff = resolveClassifierHistoryCutoff({
    humanReviewedAt: conversation.humanReviewedAt,
    clinicContactCardSentAt: conversation.clinicContactCardSentAt,
  });
  const classifierHistory = classifierCutoff
    ? toChatHistory(history.filter((m) => m.createdAt > classifierCutoff))
    : chatHistory;

  const signal = await classifyConversation(classifierHistory);
  console.log(`[vexo:timing] classifyConversation levou ${Date.now() - pipelineStartedAt}ms (desde o início do processamento deste evento)`);

  // Enxugamento do atendimento humano: lead pedindo humano (needsHuman)
  // com o WhatsApp da própria clínica configurado E válido (mesma
  // validação de Lead.phone, ver validateBrazilianPhone/saveLeadPhone) não
  // escalona mais pra NEEDS_HUMAN — a IA responde normalmente neste mesmo
  // turno, com o cartão enviado separadamente (ver clinicContactContext/
  // wantsHumanWithClinicWhatsapp, mais abaixo). Sem número configurado, ou
  // configurado mas inválido (ex.: faltando DDD), mantém EXATAMENTE o
  // comportamento de sempre: escala, manda a mensagem fixa, avisa a
  // secretária conforme o interruptor — nunca falha silenciosamente pra
  // nenhum lado.
  const clinicWhatsappE164 = resolveClinicWhatsappLink(clinic.clientWhatsappNumber);

  const { suppressHumanEscalation, wantsHumanWithClinicWhatsapp } = resolveClinicContactCardDecision({
    needsHuman: signal.needsHuman,
    hasValidClinicWhatsapp: Boolean(clinicWhatsappE164),
    clinicContactCardSentAt: conversation.clinicContactCardSentAt,
    now: new Date(),
  });

  if (signal.needsHuman && !suppressHumanEscalation) {
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { status: "NEEDS_HUMAN", needsHumanReason: signal.needsHumanReason ?? "Não especificado" },
    });
    // Mesmo cancelamento do timer de 1h de confirmação de presença feito
    // em escalateToHuman, mais abaixo — este branch não reaproveita aquela
    // função (motivo histórico: também manda a mensagem "vou repassar"
    // pro lead, que escalateToHuman não manda), mas precisa do mesmo
    // efeito. Ver comentário grande lá.
    await prisma.appointment.updateMany({
      where: { conversationId: conversation.id, status: { in: ["SCHEDULED", "CONFIRMED"] }, confirmationVideoSentAt: null },
      data: { attendancePromptSentAt: null },
    });

    // Bug crítico real em produção: escalonar pra NEEDS_HUMAN nunca mandava
    // NENHUMA mensagem de volta pro lead — só atualizava o status e (se
    // configurado) avisava a clínica por WhatsApp, em silêncio. Do lado do
    // lead isso é indistinguível de "a IA parou de responder": ele mandou
    // uma mensagem nova (ex.: uma dúvida ou pedido relacionado à saúde,
    // motivo legítimo de escalonamento pelo CLASSIFIER_SYSTEM_PROMPT) e
    // simplesmente nunca recebeu nada de volta. Isso vale pra QUALQUER
    // escalonamento, não só depois de agendamento confirmado — só ficou
    // mais visível nesse teste porque a pergunta veio logo depois de
    // marcar o horário. Mensagem curta e neutra, igual pra todo motivo de
    // escalonamento (não tenta explicar o motivo específico ao lead) —
    // só pra confirmar que a mensagem chegou e alguém vai continuar a
    // conversa, em vez de deixar a conversa parecendo "morta".
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "OUTBOUND",
        sender: "SYSTEM",
        content: "Entendi! Vou repassar isso pra nossa equipe te dar mais detalhes por aqui, tá bom? 🙂",
        status: "PENDING",
        scheduledFor: new Date(Date.now() + FAST_REPLY_DELAY_SECONDS * 1000),
      },
    });

    // Aviso à secretária por WhatsApp REMOVIDO (regra de produto: o
    // WhatsApp da clínica serve só pra confirmação de agendamento ao lead
    // — ver maybeSendWhatsappConfirmation). Status NEEDS_HUMAN, a mensagem
    // "Entendi! Vou repassar..." ao lead (acima) e o card "Humano"
    // continuam exatamente como estavam — só o aviso por WhatsApp em si
    // saiu.
    return;
  }

  // Calculado ANTES de generateLeadReply (não só no fim do turno, como
  // antes) — ver comentário grande em checkPendingAttendanceReply pro
  // motivo: a resposta deste turno precisa saber de antemão se a sequência
  // de confirmação de presença vai disparar, pra não escrever sua própria
  // despedida (ver attendanceConfirmedContext, mais abaixo) e duplicar a
  // frase final. Reaproveitado no fim do turno (applyAttendanceReplyDecision)
  // — nunca reclassifica.
  const pendingAttendanceCheck = await checkPendingAttendanceReply({
    conversationId: conversation.id,
    recentHistory: chatHistory.slice(-6),
  });

  // Janela de mensagens recentes mandadas por inteiro pra IA de
  // conversação (generateLeadReply, mais abaixo) — o que ficar de fora
  // vira um resumo curto (ver buildConversationContext/withOlderSummary em
  // conversation-context.ts, e summarizeOlderTurns em anthropic.ts). Bug
  // real de custo: sem isso, `chatHistory` (a conversa INTEIRA desde o
  // primeiro dia) ia por completo pro Sonnet em toda mensagem nova, pra
  // sempre — sem nenhum teto, o custo de input só cresce numa conversa
  // longa. Calculado só aqui (depois do "return" de needsHuman acima) pra
  // não gastar a chamada de resumo (Haiku) à toa quando a conversa
  // escalona antes de gerar qualquer resposta. Só afeta a geração da
  // resposta; o classificador acima continua vendo o histórico completo
  // (classifierHistory), sem mudança nenhuma.
  const conversationContext = await buildConversationContext(history, summarizeOlderTurns);
  const windowedHistory = withOlderSummary(conversationContext);

  // Preenchido dentro de scheduleAppointment/checkAvailability (ferramentas
  // abaixo) quando uma chamada de verdade ao Google Calendar falha (não
  // "horário ocupado" — falha real de sistema, ver comentário grande em
  // buildAvailabilityCheck). Usado depois de generateLeadReply pra
  // DESCARTAR o texto que a IA gerou neste turno (que respondeu ao erro da
  // ferramenta sem saber que a política aqui é nunca confirmar nem dizer
  // "indisponível" nesse caso) e escalar pra revisão humana com uma
  // mensagem neutra — ver o bloco logo depois de generateLeadReply.
  let googleCalendarFailureReason: string | undefined;
  let capturedLeadPhone: string | undefined;
  let capturedLeadName: string | undefined;
  let capturedResultPhoto: ResultPhotoInput | undefined;
  let resultPhotoAlreadySent = reengaged ? false : Boolean(conversation.resultPhotoSentAt);

  // Captura ANTES do objeto `tools` (mesmo motivo de sempre — `conversation`
  // é `let`, closures abaixo não carregam narrowing). Ao contrário do nome
  // do lead (cuja trava em scheduleAppointment aceita `lead.name` de uma
  // conversa anterior — a pessoa é a mesma, o nome não muda), o telefone
  // NUNCA pode aceitar Lead.phone bruto: quem está agendando pode ser
  // outra pessoa usando a mesma conta de Instagram (ex.: filha agendando
  // com o telefone da mãe). Por isso este flag olha só pra ESTA conversa
  // (Conversation.leadPhoneConfirmedAt), nunca pro Lead.phone entre contas.
  const leadPhoneAlreadyConfirmedThisConversation = Boolean(conversation.leadPhoneConfirmedAt);

  // Mesma variável {{primeiro_nome}} já suportada nos templates de
  // lembrete/follow-up (ver applyTemplateVariables em follow-up.ts) — sem
  // aplicar aqui também, um prompt customizado escrito com essa convenção
  // (razoável de esperar, já que é a mesma sintaxe usada nos outros dois
  // lugares) sai literal na resposta da IA em vez de virar o nome do lead.
  const basePrompt = applyTemplateVariables(clinic.aiSystemPrompt || DEFAULT_CONVERSATION_SYSTEM_PROMPT, lead);

  // Bug real encontrado em produção: um agendamento pra "amanhã" saiu
  // registrado com uma data completamente errada (mês diferente, não só
  // fuso). Causa raiz: nada em lugar nenhum do prompt jamais disse ao
  // modelo que dia é hoje — nem o prompt padrão (default-prompt.ts) nem
  // o prompt customizado por clínica têm como saber disso sozinhos, então
  // "hoje"/"amanhã" vira um chute do modelo sem nenhuma referência real.
  // Esse bloco é gerado a cada mensagem (nunca fica desatualizado, ao
  // contrário de um valor fixo no prompt customizado) e é sempre anexado,
  // independente do que a clínica escreveu — nenhum prompt customizado
  // deveria precisar se preocupar com isso por conta própria.
  //
  // Outro bug real, mais sério, encontrado depois: agendamentos em
  // horários GENUINAMENTE livres (confirmado direto no Google Calendar)
  // sendo rejeitados por schedule_appointment como "não disponível". Causa
  // raiz: até aqui, o prompt exigia que o modelo convertesse o horário pra
  // UTC de cabeça ("14h de Brasília = 17:00 UTC") EM TODO turno que
  // confirmava um agendamento — e essa conta tinha que ser refeita do zero
  // a cada turno, porque o histórico persistido (Message.content) guarda
  // só o texto final mandado ao lead ("temos 9h, 10h ou 11h"), nunca o ISO
  // exato que a ferramenta devolveu. Uma conta errada (ex.: esquecer de
  // somar 3h, tratando "9h" como se já fosse "09:00Z") derruba
  // schedule_appointment silenciosamente — e a IA lê esse erro genérico
  // como "alguém pegou esse horário", quando na verdade foi o PRÓPRIO
  // sistema que mandou um horário errado pra checar. Ver src/lib/timezone.ts.
  // Correção: check_availability e schedule_appointment agora falam
  // SEMPRE em horário de Brasília, sem NENHUMA conversão — a IA só ecoa o
  // que o lead disse e o que a ferramenta devolveu, sem fazer conta de
  // fuso nenhuma; a conversão pra UTC (exigida pela API do Google
  // Calendar) acontece inteiramente do lado do servidor.
  const now = new Date();
  const dateTimeContext =
    `[Contexto automático — data/hora atual: ${now.toLocaleString("pt-BR", {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    })} (horário de Brasília, America/Sao_Paulo, UTC-3). Use isso como referência real ` +
    `pra "hoje", "amanhã", "essa semana" etc. — nunca assuma outra data. Em toda chamada de ` +
    `check_availability ou schedule_appointment, o horário é SEMPRE no horário de Brasília, no formato ` +
    `"AAAA-MM-DDTHH:mm" (ex.: 14h de hoje = "${formatAsBrazilLocalDateTime(now).slice(0, 10)}T14:00") ` +
    `— NUNCA converta pra UTC, NUNCA escreva sufixo "Z" nem faça qualquer conta de fuso horário; o sistema faz ` +
    `essa conversão sozinho. Pra confirmar um horário que o lead escolheu, use EXATAMENTE o mesmo valor que ` +
    `check_availability te devolveu pra aquele horário (ex.: se devolveu "2026-09-19T09:00" e o lead confirmou ` +
    `"9h", chame schedule_appointment com startTimeLocal="2026-09-19T09:00" — não recalcule, não arredonde, não ` +
    `troque de formato). NUNCA diga ao lead que um horário está reservado/confirmado antes ` +
    `de check_availability confirmar que está livre E schedule_appointment ter sido chamado com ` +
    `sucesso, nessa ordem — não confirme adiantado, mesmo que pareça óbvio que vai dar certo. Se ` +
    `depois de oferecer um horário você descobrir que ele não está mais livre, deixe claro pro ` +
    `lead que aquele horário específico não está confirmado e pergunte qual dos horários ` +
    `alternativos ele prefere — só chame schedule_appointment depois que ele responder claramente ` +
    `qual dos horários quer; se a resposta dele ficar ambígua entre mais de um horário oferecido, ` +
    `pergunte de novo pra confirmar qual exatamente, em vez de escolher um sozinho. Se o lead ` +
    `perguntar sobre o horário marcado (ex.: "esqueci meu horário", "quando é minha consulta?"), ` +
    `questionar ou duvidar de um horário JÁ confirmado (ex.: "tem certeza que está ocupado?", ` +
    `"mas você não tinha confirmado esse horário pra mim?") ou pedir pra remarcar, chame ` +
    `check_current_appointment antes de responder — não confie só no histórico da conversa, e nunca ` +
    `use só o resultado de check_availability pra responder uma dúvida sobre o agendamento do lead ` +
    `(ver ownAppointmentLocal na descrição de check_availability). Remarcação usa a MESMA schedule_appointment, com o horário novo (as ` +
    `mesmas regras de confirmação valem); o sistema identifica sozinho que já existe um ` +
    `agendamento e move ele em vez de criar outro. Quando o lead pedir pra agendar sem dizer ` +
    `qual dia, SEMPRE confirme o DIA específico primeiro (ex.: "quinta-feira", "dia 20", ` +
    `"amanhã") antes de perguntar ou oferecer período do dia (manhã/tarde) — nunca pergunte só ` +
    `"manhã ou tarde?" sem já saber (ou ter perguntado) em qual dia; sem o dia definido, ` +
    `check_availability não tem como saber que intervalo consultar. Nome do lead: ` +
    `${lead.name ? `já sabido ("${lead.name}") — não precisa perguntar de novo` : "AINDA NÃO informado"}. ` +
    `Se ainda não souber, pergunte o nome dele em algum momento natural da conversa, antes de confirmar ` +
    `qualquer agendamento — pode ser junto com o pedido do WhatsApp, ou um pouco antes; assim que ele ` +
    `informar, chame save_lead_name imediatamente. schedule_appointment recusa confirmar sem um nome real ` +
    `salvo — nunca tente agendar sem ter perguntado e salvo o nome primeiro. WhatsApp do lead NESTA conversa: ` +
    `${leadPhoneAlreadyConfirmedThisConversation ? "já confirmado — não precisa perguntar de novo" : "AINDA NÃO confirmado"}. ` +
    `SEMPRE pergunte o WhatsApp antes de confirmar um agendamento, mesmo que o lead já tenha informado um número ` +
    `em outra conversa antiga — a pessoa do outro lado pode ser diferente (ex.: filha usando o Instagram da mãe), ` +
    `então um número de conversa anterior NUNCA dispensa perguntar de novo nesta. Assim que ele informar, chame ` +
    `save_lead_phone imediatamente. schedule_appointment recusa confirmar sem o WhatsApp confirmado nesta mesma ` +
    `conversa — nunca tente agendar sem ter perguntado e salvo o WhatsApp primeiro (pode ser na mesma mensagem ` +
    `em que você pergunta o nome, ou logo antes/depois). Depois que schedule_appointment confirmar o horário, ` +
    `pergunte "posso contar com sua presença?" (ou equivalente) e siga a conversa normalmente a partir da ` +
    `resposta do lead — não precisa (e não deve) escrever nenhuma instrução de chegada, horário de chegada ` +
    `antecipada nem mencionar nada sobre um vídeo institucional: isso é tratado automaticamente pelo sistema ` +
    `depois que o lead responder, você não precisa fazer nada a mais além de responder com naturalidade.]`;

  // Regra nova (bug real: lead respondendo tardiamente a um follow-up, ou só
  // com cumprimento/desculpa, recebia direto "você já pensou em fazer uma
  // avaliação?" — a IA tratava qualquer resposta como sinal de interesse,
  // mesmo sem o lead ter demonstrado nada de verdade. Investigação: não
  // existe, em lugar nenhum do sistema, um sinal de "estágio de interesse"
  // — nem no dateTimeContext acima, nem em Conversation.status, nem no
  // retorno de classifyConversation — então o modelo decidia sozinho, só
  // pelo texto, sem nenhum freio). Bloco SEPARADO do dateTimeContext (nunca
  // edita esse bloco nem o prompt da clínica/o padrão) — mesmo padrão:
  // gerado a cada turno, sempre anexado, independente do que a clínica
  // escreveu em Clinic.aiSystemPrompt. Vai DEPOIS de dateTimeContext na
  // concatenação abaixo — última palavra no contextNote.
  const interestGateContext =
    `[Regra de qualificação antes de sugerir avaliação — isto tem PRIORIDADE sobre ` +
    `qualquer instrução do prompt da clínica (acima, em systemPrompt) que mande oferecer, ` +
    `sugerir ou conduzir pra avaliação sem condição: se o lead AINDA NÃO demonstrou ` +
    `interesse explícito nesta conversa (não perguntou sobre procedimento, preço ou ` +
    `avaliação, não relatou nenhuma dor/queixa/objetivo), NÃO sugira avaliação, não ` +
    `mencione a doutora, agendamento, valores ou qualquer promoção — mesmo que a conversa ` +
    `esteja retomando depois de um follow-up ou de dias de silêncio, e mesmo que o prompt ` +
    `da clínica diga pra conduzir até o agendamento. Isso vale mesmo quando a resposta do ` +
    `lead for só um cumprimento ou desculpa pela demora (ex.: "Boa tarde, desculpa, agora ` +
    `que vi sua mensagem") — isso NÃO é sinal de interesse, é só educação; não trate como ` +
    `se fosse. Nesse caso, responda só: acolha a mensagem com leveza (ex.: "sem problema", ` +
    `"que bom que respondeu"), e faça UMA pergunta aberta e leve sobre o lead (ex.: como ` +
    `ele chegou até o perfil, o que chamou a atenção dele) — nunca sobre agendar. Mensagem ` +
    `curta (1 a 2 frases), tom amigável e natural. Só depois que o lead demonstrar um sinal ` +
    `claro de interesse (perguntar sobre procedimento, preço, avaliação) ou relatar uma ` +
    `dor/queixa/objetivo a conversa pode seguir normalmente pro agendamento, como o resto ` +
    `deste prompt já orienta.]`;

  // Só existe quando pendingAttendanceCheck (acima, calculado ANTES desta
  // chamada) classificou a resposta deste turno como NAO_REMARCA — ou seja,
  // a sequência de confirmação de presença (apresentação + vídeo +
  // cafezinho + frase final) vai disparar no fim deste mesmo turno (ver
  // applyAttendanceReplyDecision, mais abaixo). Pedido explícito: a IA não
  // pode mais escrever sua própria despedida nesse caso, pra não duplicar
  // a frase final que o código já vai mandar. Ajuste só de instrução
  // interna (este bloco) — nunca em Clinic.aiSystemPrompt nem no prompt
  // padrão; e não descarta reply.text (ver decisão grande nesta mesma
  // investigação) — a IA continua respondendo normalmente a qualquer outra
  // coisa que o lead tenha dito junto da confirmação, só sem a despedida.
  const attendanceConfirmedContext =
    pendingAttendanceCheck?.decision === "NAO_REMARCA"
      ? `[O lead acabou de confirmar presença. Responda de forma breve e natural (ex.: ` +
        `agradecendo, confirmando que anotou) — mas NÃO inclua nenhuma despedida ou frase de ` +
        `encerramento (ex.: "até amanhã", "até mais", "nos vemos", "até sexta"): o sistema vai ` +
        `enviar uma mensagem de encerramento separada automaticamente, junto do vídeo ` +
        `institucional. Se o lead tiver dito mais alguma coisa junto da confirmação (uma ` +
        `pergunta, um aviso — ex.: "vou chegar atrasada"), responda essa parte normalmente.]`
      : null;

  // Só existe quando wantsHumanWithClinicWhatsapp (calculado bem acima,
  // junto de signal.needsHuman) for true nesse turno — lead pediu humano E
  // a clínica tem um WhatsApp próprio válido configurado, então a
  // escalada pra NEEDS_HUMAN foi suprimida ali (ver o bloco logo depois
  // de classifyConversation) a favor deste link.
  const clinicContactContext = wantsHumanWithClinicWhatsapp ? buildClinicContactContext(clinic.name) : null;

  const reply = await generateLeadReply({
    // Separados (não mais concatenados numa string só) pra permitir prompt
    // caching: basePrompt é estável por clínica, dateTimeContext muda a
    // cada mensagem — ver cache_control em generateLeadReply, anthropic.ts.
    systemPrompt: basePrompt,
    // interestGateContext vai DEPOIS de dateTimeContext de propósito — ver
    // comentário grande acima (tem prioridade sobre qualquer instrução de
    // agendamento incondicional no prompt da clínica). attendanceConfirmedContext
    // e clinicContactContext (quando existem) vão por último — as mais
    // específicas/recentes.
    contextNote: [dateTimeContext, interestGateContext, attendanceConfirmedContext, clinicContactContext]
      .filter(Boolean)
      .join("\n\n"),
    history: windowedHistory,
    tools: {
      checkAvailability: buildAvailabilityCheck(clinic.id, conversation.id, (reason) => {
        googleCalendarFailureReason = reason;
      }),
      // Leitura pura (sem side effect) — mesma consulta que scheduleAppointment
      // já faz pra decidir criar vs. mover um agendamento, exposta aqui pra
      // IA poder responder "esqueci meu horário"/"quando é minha consulta?"
      // e servir de primeiro passo antes de uma remarcação.
      async checkCurrentAppointment() {
        const active = await prisma.appointment.findFirst({
          where: { conversationId: conversation.id, status: { in: ["SCHEDULED", "CONFIRMED"] } },
          orderBy: { createdAt: "desc" },
        });
        if (!active) return { none: true as const };
        return { scheduledAtLocal: formatAsBrazilLocalDateTime(active.scheduledAt) };
      },
      // Nunca confia no que a conversa "disse" ter confirmado — bug real em
      // produção: a IA ofereceu um horário sem checar disponibilidade de
      // verdade, o lead confirmou, só DEPOIS a IA descobriu que estava
      // ocupado, e mesmo com a contradição nunca resolvida (não ficou
      // claro se o lead escolheu 11h ou 12h), um agendamento foi criado
      // mesmo assim. Essa é a trava de fato: reverifica a disponibilidade
      // real (Google Calendar) bem na hora de gravar, não importa quantas
      // vezes check_availability já rodou antes na conversa — pode ter
      // passado tempo, ou o modelo pode simplesmente não ter checado.
      // Rejeita (força o modelo a chamar check_availability de novo e
      // reoferecer) se o horário não estiver genuinamente livre.
      async scheduleAppointment(args) {
        let start: Date;
        try {
          start = parseBrazilLocalDateTime(args.startTimeLocal);
        } catch (err) {
          return { error: err instanceof Error ? err.message : "startTimeLocal inválido." };
        }
        // Exige um nome real do lead ANTES de agendar — bug real em
        // produção: o evento do Google Calendar saía com "lead" genérico
        // sempre que o lead nunca se apresentava espontaneamente na
        // conversa (a IA só perguntava o nome por iniciativa própria,
        // nunca por exigência do sistema). capturedLeadName cobre o nome
        // salvo NESTE MESMO turno (save_lead_name chamado antes desta
        // ferramenta, no mesmo turno em que o lead confirma o horário);
        // lead.name cobre um nome já salvo em turno anterior (ou vindo do
        // lookup best-effort do perfil do Instagram). Rejeitar aqui, e não
        // só orientar por prompt, é o que garante que "lead" genérico
        // nunca mais vira fallback silencioso no evento criado abaixo.
        if (!capturedLeadName?.trim() && !lead.name?.trim()) {
          return {
            error:
              "Nome do lead ainda não confirmado. Pergunte o nome dele e chame save_lead_name antes de " +
              "tentar agendar de novo — nunca confirme um agendamento sem um nome real salvo.",
          };
        }
        // Exige o WhatsApp CONFIRMADO NESTA CONVERSA antes de agendar — bug
        // real em produção: uma conversa nova, na mesma conta de Instagram
        // de um teste anterior, pulou a pergunta do WhatsApp inteiramente
        // (foi direto de "escolher horário" pra "confirmar reserva") porque
        // Lead.phone já vinha preenchido de uma conversa antiga, e nada
        // aqui distinguia "telefone confirmado por ESTA pessoa, agora" de
        // "telefone que sobrou de uma conversa antiga". Ao contrário do
        // nome (ver acima — lead.name de conversa anterior é aceito, a
        // pessoa é a mesma), o telefone NUNCA aceita lead.phone bruto:
        // só capturedLeadPhone (save_lead_phone chamado NESTE turno) ou
        // leadPhoneAlreadyConfirmedThisConversation (save_lead_phone já
        // chamado em turno anterior DESTA MESMA conversa) contam — porque
        // quem está do outro lado da mesma conta de Instagram pode ser
        // outra pessoa (ex.: filha agendando com o telefone da mãe).
        if (!capturedLeadPhone && !leadPhoneAlreadyConfirmedThisConversation) {
          return {
            error:
              "WhatsApp do lead ainda não confirmado NESTA conversa. Pergunte o WhatsApp dele e chame " +
              "save_lead_phone antes de tentar agendar de novo — mesmo que já exista um número salvo de uma " +
              "conversa anterior desta mesma conta do Instagram, ele pode ser de outra pessoa, então não conta: " +
              "sempre peça e confirme de novo dentro desta conversa.",
          };
        }
        // Consentimento explícito do lead pra ESSE horário específico não dá
        // pra verificar por código sozinho (entender linguagem natural) —
        // mas exigir uma citação da mensagem real do lead reduz bastante
        // confirmação inventada: sem uma frase de verdade pra citar, fica
        // mais difícil o modelo simplesmente afirmar que foi confirmado.
        if (!args.leadConfirmationQuote?.trim()) {
          return {
            error:
              "Inclua leadConfirmationQuote com a mensagem exata em que o lead confirmou ESSE horário específico " +
              "antes de chamar esta ferramenta.",
          };
        }
        const end = new Date(start.getTime() + 60 * 60 * 1000);

        // Buscado JÁ AQUI (não só mais abaixo, na hora de criar/mover o
        // evento) pra também servir de isenção na re-checagem de
        // disponibilidade a seguir — ver o bloco "Bug real corrigido" logo
        // depois do catch abaixo.
        const existingAppointment = await prisma.appointment.findFirst({
          where: { conversationId: conversation.id, status: { in: ["SCHEDULED", "CONFIRMED"] } },
          orderBy: { createdAt: "desc" },
        });

        let freeSlots: string[];
        try {
          freeSlots = await checkAvailability(clinic.id, start.toISOString(), end.toISOString());
        } catch (err) {
          // Falha REAL da API do Google (token revogado, 5xx, rede — nunca
          // "horário ocupado") — bug real corrigido aqui: antes, isto
          // virava `.catch(() => [])`, e a ausência do horário resultante
          // em `freeSlots` fazia o bloco abaixo dizer ao lead "esse horário
          // não está livre", uma causa inventada pra um problema que não
          // tinha nada a ver com a agenda estar ocupada. Sinaliza pro
          // chamador via googleCalendarFailureReason (ver o bloco depois de
          // generateLeadReply, em handleInboundInstagramMessage) em vez de
          // deixar a IA decidir o que dizer com base num erro genérico.
          googleCalendarFailureReason =
            `Falha ao consultar disponibilidade no Google Calendar ao tentar confirmar ${args.startTimeLocal} ` +
            `(Brasília): ${err instanceof Error ? err.message : String(err)}`;
          return {
            error:
              "Não foi possível confirmar a disponibilidade agora (falha real do sistema, não é sobre o horário) " +
              "— NÃO diga ao lead que está confirmado nem que está indisponível; isso será resolvido manualmente.",
          };
        }

        let isFree = freeSlots.includes(start.toISOString());

        // Bug real corrigido aqui: remarcar pra um horário que se sobrepõe
        // ao horário ATUAL do próprio agendamento desta conversa (ex.:
        // 14:00 -> 14:30) era recusado como "não está livre" — o evento
        // antigo ainda está no Google (só é movido/atualizado DEPOIS, mais
        // abaixo, se este passo passar) e checkAvailability não distingue
        // "ocupado por mim mesmo" de "ocupado por outra pessoa" (mesma
        // limitação documentada em buildAvailabilityCheck, bem acima). Só
        // entra aqui quando a checagem normal rejeitou E existe um evento
        // próprio de verdade pra verificar (googleEventId) — sem isso,
        // continua recusando exatamente como antes.
        if (!isFree && existingAppointment?.googleEventId) {
          // withinBusinessHours reproduz a MESMA condição usada por
          // checkAvailability pra gerar slots (google-calendar.ts) —
          // precisa ser checado aqui separadamente porque, sem isso, um
          // horário fora do funcionamento que por acaso caísse dentro da
          // janela do próprio agendamento atual seria liberado por engano
          // pela isenção abaixo (que só sabe reconhecer "ocupado por mim",
          // não "fora do horário").
          const hour = start.getUTCHours();
          const withinBusinessHours = hour >= BUSINESS_HOURS_START_UTC && hour <= BUSINESS_HOURS_END_UTC;

          if (withinBusinessHours) {
            try {
              const raw = await getRawBusyPeriods(clinic.id, start.toISOString(), end.toISOString());
              const ownWindowStart = existingAppointment.scheduledAt;
              const ownWindowEnd = new Date(ownWindowStart.getTime() + 60 * 60 * 1000); // evento sempre de 1h, ver createCalendarEvent
              isFree = isSlotFreeIgnoringOwnAppointment({
                start,
                end,
                rawBusy: raw.busy,
                ownAppointmentWindow: { start: ownWindowStart, end: ownWindowEnd },
              });
            } catch (err) {
              googleCalendarFailureReason =
                `Falha ao consultar disponibilidade no Google Calendar (2ª checagem, ignorando o evento atual ` +
                `da própria conversa) ao tentar confirmar ${args.startTimeLocal} (Brasília): ` +
                `${err instanceof Error ? err.message : String(err)}`;
              return {
                error:
                  "Não foi possível confirmar a disponibilidade agora (falha real do sistema, não é sobre o " +
                  "horário) — NÃO diga ao lead que está confirmado nem que está indisponível; isso será " +
                  "resolvido manualmente.",
              };
            }
          }
        }

        if (!isFree) {
          // Diagnóstico: registra o que o Google devolveu de verdade (conta,
          // calendário, períodos ocupados crus do dia inteiro) em
          // WebhookLog.processingError — sem isso, uma rejeição "estranha"
          // (ex.: horário que deveria estar livre) fica sem forma de
          // confirmar se é um evento genuíno na agenda conectada ou um bug
          // na lógica de disponibilidade. Best effort — falha aqui não pode
          // impedir a resposta normal ao lead.
          if (webhookLogId) {
            const dayStart = new Date(start);
            dayStart.setUTCHours(0, 0, 0, 0);
            const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
            await getRawBusyPeriods(clinic.id, dayStart.toISOString(), dayEnd.toISOString())
              .then((raw) =>
                prisma.webhookLog.update({
                  where: { id: webhookLogId },
                  data: {
                    processingError:
                      `schedule_appointment rejeitou ${args.startTimeLocal} horário de Brasília ` +
                      `(${start.toISOString()} UTC — não está em freeSlots). ` +
                      `Conta Google: ${raw.googleAccountEmail} (calendarId=${raw.calendarId}). ` +
                      `Períodos ocupados crus do dia (UTC): ${JSON.stringify(raw.busy)}`.slice(0, 4000),
                  },
                })
              )
              .catch((err) => console.error("[vexo] Falha ao gravar diagnóstico de disponibilidade:", err));
          }
          return {
            error:
              `O horário ${args.startTimeLocal} (Brasília) não está livre (ou está fora do horário de ` +
              `funcionamento). Chame check_availability de novo e ofereça outro horário — não confirme este ao lead.`,
          };
        }

        // Cria/move o evento de verdade no Google Calendar e persiste o
        // Appointment AQUI, ANTES de devolver confirmed:true — bug crítico
        // corrigido: antes, confirmed:true só significava "o horário
        // estava livre nesta checagem", e a IA já escrevia a confirmação
        // pro lead com base só nisso; a criação real do evento (então numa
        // função separada, confirmAppointment, chamada só depois que
        // generateLeadReply já tinha terminado e a resposta já estava na
        // fila) podia falhar e ficar só num console.error — o lead já
        // tinha recebido "confirmado" sem o evento existir de verdade em
        // lugar nenhum. Mover a criação pra dentro da própria ferramenta,
        // ANTES do "return confirmed:true", é a única forma de garantir
        // que essa mensagem só sai quando o evento realmente existe.
        //
        // Mesma trava de idempotência de sempre (nunca duplicar): usa o
        // MESMO existingAppointment já buscado acima — se existir e o
        // horário for diferente, MOVE o evento existente (remarcação); se
        // for igual, é só uma reconfirmação, não toca no Google de novo;
        // se não existir nenhum, cria um evento novo.
        const leadNameForEvent = capturedLeadName?.trim() || lead.name!;
        const leadPhoneForEvent = capturedLeadPhone ?? lead.phone;

        try {
          if (existingAppointment) {
            if (existingAppointment.scheduledAt.getTime() !== start.getTime()) {
              if (existingAppointment.googleEventId) {
                await updateCalendarEvent(clinic.id, existingAppointment.googleEventId, start.toISOString());
              }
              await prisma.appointment.update({
                where: { id: existingAppointment.id },
                data: {
                  scheduledAt: start,
                  // Reinicia a espera pela pergunta de presença pro horário
                  // NOVO — ver ATTENDANCE_AUTO_SEND_AFTER_MS e
                  // fireAttendanceConfirmationSequence, mais abaixo. Seguro
                  // escrever isto incondicionalmente mesmo quando o vídeo
                  // já saiu pro horário antigo: confirmationVideoSentAt
                  // (nunca tocado aqui) é a trava real de "nunca mais" —
                  // ela sozinha impede a sequência de disparar de novo,
                  // então não precisa condicionar esta escrita a ela.
                  attendancePromptSentAt: new Date(),
                },
              });
            }
            // Senão: mesmo horário já confirmado antes nesta conversa —
            // reaproveita sem mexer no Google Calendar nem duplicar, e sem
            // reiniciar a espera de presença (nada mudou de verdade).
          } else {
            const googleEventId = await createCalendarEvent(
              clinic.id,
              start.toISOString(),
              `VEXO — Avaliação: ${leadNameForEvent}`,
              clinic.address ?? undefined,
              buildCalendarEventDescription({ leadName: leadNameForEvent, leadPhone: leadPhoneForEvent })
            );
            await prisma.appointment.create({
              data: {
                clinicId: clinic.id,
                conversationId: conversation.id,
                leadId: lead.id,
                scheduledAt: start,
                googleEventId,
                status: "SCHEDULED",
                attendancePromptSentAt: new Date(),
              },
            });
          }
        } catch (err) {
          googleCalendarFailureReason =
            `Falha ao criar/mover o evento no Google Calendar pro horário ${args.startTimeLocal} (Brasília): ` +
            `${err instanceof Error ? err.message : String(err)}`;
          return {
            error:
              "Não foi possível confirmar o agendamento agora (falha ao gravar no Google Calendar) — NÃO diga ao " +
              "lead que está confirmado; isso será resolvido manualmente pela equipe.",
          };
        }

        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { status: "SCHEDULED" },
        });

        return { confirmed: true, startTimeLocal: args.startTimeLocal };
      },
      async saveLeadPhone(args) {
        const phone = args.phone.trim();
        if (!phone) return { error: "Número vazio." };
        // Valida JÁ na captura (não só normaliza) — bug real: um número
        // sem DDD (ex.: "998223038", 9 dígitos) era salvo direto em
        // Lead.phone e na descrição do evento do Google Calendar, porque a
        // normalização antiga só sabia ADICIONAR o 55 quando o número já
        // vinha com DDD — qualquer outro tamanho caía num fallback que
        // devolvia o número como veio, sem avisar que faltava o DDD. DDD é
        // sempre obrigatório. Ver validateBrazilianPhone, src/lib/whatsapp.ts.
        // Em caso de erro, NADA é salvo aqui (capturedLeadPhone continua
        // undefined) — isso já basta pra schedule_appointment continuar
        // bloqueado por "WhatsApp ainda não confirmado" mais abaixo, sem
        // precisar de nenhuma checagem nova lá.
        //
        // Salva localDigits (DDD + número, SEM o 55) — não e164. Lead.phone
        // guarda o formato "de exibição" (ex.: usado cru no link wa.me do
        // Painel e na descrição do evento, ver buildCalendarEventDescription
        // mais abaixo); o 55 só é acrescentado na hora de ENVIAR de verdade
        // pela Evolution API, dentro de normalizeBrazilianWhatsappNumber
        // (chamada por sendWhatsappMessage) — nunca aqui na captura.
        const validation = validateBrazilianPhone(phone);
        if (!validation.valid) {
          return { error: validation.reason };
        }
        capturedLeadPhone = validation.localDigits;
        return { saved: true };
      },
      async saveLeadName(args) {
        const name = args.name.trim();
        if (!name) return { error: "Nome vazio." };
        capturedLeadName = name;
        return { saved: true };
      },
      async sendResultPhoto(args) {
        if (resultPhotoAlreadySent) {
          return { error: "Já foi enviada uma foto de resultado nesta conversa — não envie outra." };
        }
        const category = args.category.trim();
        if (!category) return { error: "Categoria vazia." };
        const photo = await prisma.resultPhoto.findFirst({
          where: { clinicId: clinic.id, category: { contains: category, mode: "insensitive" } },
          orderBy: { createdAt: "desc" },
        });
        if (!photo) {
          return { error: `Nenhuma foto de resultado cadastrada para a categoria "${category}".` };
        }
        capturedResultPhoto = { imageUrl: photo.imageUrl, caption: photo.caption };
        resultPhotoAlreadySent = true;
        return { sent: true };
      },
    },
  });
  console.log(`[vexo:timing] generateLeadReply levou ${Date.now() - pipelineStartedAt}ms no total (desde o início do processamento deste evento, inclui classifyConversation)`);

  // firstMessage (não lastMessage) de propósito: reflete o tempo real que o
  // lead levou pra reagir à última resposta da IA, sem inflar esse número
  // pelo tempo que o debounce esperou por possíveis mensagens seguintes no
  // mesmo lote (ver InboundInstagramEvent.messages).
  const leadResponseTimeSeconds = previousAiMessage?.sentAt
    ? Math.max(0, Math.round((firstResolvedAt.getTime() - previousAiMessage.sentAt.getTime()) / 1000))
    : null;

  const aiSettings = await prisma.aiSettings.findUnique({ where: { id: "singleton" } });
  const delaySeconds = aiSettings?.adaptiveDelayEnabled === false
    ? FAST_REPLY_DELAY_SECONDS
    : computeAdaptiveDelaySeconds(leadResponseTimeSeconds, clinic.firstBandDelaySeconds);
  // Bug real em produção: o loop de chamadas de ferramenta esgotou as
  // iterações disponíveis sem o modelo terminar de responder (ver
  // maxToolIterations em generateLeadReply, anthropic.ts) — reply.text
  // nesse caso é só o fallbackText genérico ("Só um momento, já te
  // retorno com os detalhes."), NUNCA uma resposta de verdade (ver
  // `truncated` abaixo). Nesse caso usa FAST_REPLY_DELAY_SECONDS (sai
  // rápido) em vez do delay adaptativo normal, que não faz sentido pra
  // uma mensagem de espera/escalonamento.
  // googleCalendarFailureReason (setado dentro de checkAvailability/
  // scheduleAppointment, ver comentário grande logo abaixo) usa o mesmo
  // FAST_REPLY_DELAY_SECONDS de reply.truncated — mesmo raciocínio: não é
  // uma resposta de conversação normal, o delay adaptativo não se aplica.
  const scheduledFor = reply.truncated || googleCalendarFailureReason
    ? new Date(Date.now() + FAST_REPLY_DELAY_SECONDS * 1000)
    : new Date(Date.now() + delaySeconds * 1000);

  // Diagnóstico TEMPORÁRIO (remover depois de confirmar o comportamento em
  // produção) — investigação do relato de que o delay da faixa "até 1h"
  // (Clinic.firstBandDelaySeconds, ajustável em Agente de IA) não muda o
  // tempo de resposta observado, mesmo configurando valores bem diferentes,
  // de forma consistente ao longo de várias semanas/deploys. Mostra, no
  // exato momento do cálculo: o valor CRU lido do banco agora mesmo
  // (firstBandDelaySecondsDb — descarta de vez a hipótese de cache/deploy
  // desatualizado se bater com o configurado) e o valor que
  // computeAdaptiveDelaySeconds efetivamente devolveu (delaySeconds) — se
  // os dois baterem com o configurado na tela mas o lead ainda receber a
  // resposta fora desse intervalo, o problema está em outro lugar (ex:
  // tempo de geração da IA antes daqui, ou o worker de despacho), não
  // nesse cálculo.
  console.log(
    `[vexo:timing] clinicId=${clinic.id} clinicName=${JSON.stringify(clinic.name)} ` +
      `adaptiveDelayEnabled=${aiSettings?.adaptiveDelayEnabled ?? true} ` +
      `leadResponseTimeSeconds=${leadResponseTimeSeconds} ` +
      `firstBandDelaySecondsDb=${clinic.firstBandDelaySeconds} ` +
      `delaySeconds(usado)=${delaySeconds} truncated=${Boolean(reply.truncated)} ` +
      `now=${new Date().toISOString()} scheduledFor=${scheduledFor.toISOString()}`
  );

  // googleCalendarFailureReason TEM PRIORIDADE sobre o texto que a IA
  // gerou neste turno — mesmo que o modelo tenha produzido uma resposta
  // normal depois de ver o erro da ferramenta (ela não tem garantia
  // nenhuma de seguir a instrução "não diga X nem Y" à risca), essa
  // resposta é DESCARTADA e substituída por uma mensagem neutra: é a única
  // forma de garantir que o lead NUNCA recebe uma confirmação falsa quando
  // o evento real no Google Calendar não existe. Mesmo princípio de "não
  // confia no texto do modelo, decide no código" que reply.truncated já
  // usa abaixo — só que aqui o motivo é uma falha de sistema, não o loop
  // de ferramentas ter esgotado.
  const isGoogleCalendarFailure = Boolean(googleCalendarFailureReason);

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "OUTBOUND",
      sender: reply.truncated || isGoogleCalendarFailure ? "SYSTEM" : "AI",
      content: isGoogleCalendarFailure
        ? "Só um instante — vou confirmar esse horário direto com a nossa equipe e te aviso em seguida, tá bom? 🙂"
        : reply.truncated
          ? "Entendi! Vou repassar isso pra nossa equipe te dar mais detalhes por aqui, tá bom? 🙂"
          : reply.text,
      status: "PENDING",
      scheduledFor,
    },
  });

  // Cartão de contato da clínica — Message SEPARADA da resposta em texto
  // acima (ver clinicContactContext/buildClinicContactContext, mais acima:
  // a IA foi instruída a não escrever link nem número nesta resposta
  // porque o sistema cuida disso aqui). `content` já vem pronto com o
  // texto de FALLBACK (link /c/<id>, nunca o número cru — ver
  // buildClinicContactFallbackText) — dispatchOneMessage (dispatch.ts)
  // tenta mandar o cartão (Generic Template) primeiro e só usa esse
  // `content` como mensagem de texto normal se a Graph API rejeitar o
  // cartão; nunca manda os dois. +2s pra chegar depois da resposta em
  // texto, nunca antes/junto dela.
  //
  // Conversation.clinicContactCardSentAt marcado ATOMICAMENTE junto da
  // criação da Message (mesma transação) — é o que alimenta tanto o
  // corte da janela do classificador (resolveClassifierHistoryCutoff,
  // acima) quanto o cooldown contra um segundo cartão
  // (resolveClinicContactCardDecision/CLINIC_CONTACT_CARD_RESEND_COOLDOWN_MS,
  // acima) na mesma hora.
  if (wantsHumanWithClinicWhatsapp && clinicWhatsappE164) {
    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: "OUTBOUND",
          sender: "SYSTEM",
          content: buildClinicContactFallbackText(clinic.name, clinic.id),
          clinicContactCard: encodeClinicContactCard({
            clinicId: clinic.id,
            clinicName: clinic.name,
            whatsappE164: clinicWhatsappE164,
          }),
          status: "PENDING",
          scheduledFor: new Date(scheduledFor.getTime() + 2_000),
        },
      }),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { clinicContactCardSentAt: new Date() },
      }),
    ]);
  }

  // Mandar a mensagem de espera genérica como se fosse a resposta final
  // deixava a conversa "travada": o lead via essa frase e nunca recebia
  // mais nada, porque nada tentava de novo sozinho — só voltava a
  // responder quando o LEAD mandava outra mensagem. Escalona pra revisão
  // humana (mesmo padrão de toda outra escalonagem) — mas, ao contrário
  // da versão anterior desta correção, NÃO retorna aqui: qualquer
  // telefone/nome que a IA já tinha CONFIRMADO via ferramenta antes de
  // travar (ex.: save_lead_phone/save_lead_name numa iteração anterior do
  // mesmo turno) precisa continuar sendo processado normalmente logo
  // abaixo (persistência de nome/telefone, vídeo institucional, confirmação
  // por WhatsApp) — um `return` aqui descartava esse progresso real em
  // silêncio, mesmo quando ele já tinha sido salvo no banco. Agendamento em
  // si não faz mais parte dessa lista: schedule_appointment já persiste o
  // evento (e só devolve confirmed:true) dentro da própria ferramenta,
  // antes de generateLeadReply terminar — nunca fica pendurado esperando
  // este bloco rodar.
  if (reply.truncated) {
    await escalateToHuman(
      "A IA não conseguiu concluir a resposta dentro do limite de chamadas de ferramenta neste turno " +
        "(sequência de ações mais longa que o normal — ex.: agendar horário + salvar telefone + salvar nome " +
        "no mesmo turno) — pausada para revisão humana em vez de deixar só a mensagem de espera genérica " +
        "sem nunca responder de verdade. Qualquer agendamento/telefone/nome que a IA já tinha CONFIRMADO via " +
        "ferramenta antes de travar foi salvo normalmente — confira o card de agendamento antes de continuar " +
        "manualmente."
    );
  }

  // Falha real do Google Calendar durante check_availability/schedule_appointment
  // neste turno (ver comentário grande acima) — a mensagem neutra já saiu
  // pro lead acima; aqui só falta garantir que um humano saiba que precisa
  // confirmar esse agendamento manualmente, com o motivo técnico registrado.
  if (isGoogleCalendarFailure) {
    await escalateToHuman(
      `Falha ao confirmar agendamento no Google Calendar — o lead NÃO recebeu uma confirmação de verdade ` +
        `(mensagem neutra enviada em vez disso), o horário combinado precisa ser confirmado manualmente com ` +
        `ele. Detalhe técnico: ${googleCalendarFailureReason}`
    );
  }

  if (capturedLeadPhone) {
    await prisma.$transaction([
      prisma.lead.update({ where: { id: lead.id }, data: { phone: capturedLeadPhone } }),
      // Marca que ESTA conversa já teve o WhatsApp confirmado — é o que
      // libera schedule_appointment a aceitar "já sabido" num turno
      // FUTURO desta mesma conversa (ex.: remarcação) sem reperguntar; ver
      // leadPhoneAlreadyConfirmedThisConversation e o comentário grande no
      // gate de scheduleAppointment, acima, pro bug real que motivou isso
      // nunca poder confiar em Lead.phone bruto (entre conversas/contas).
      prisma.conversation.update({
        where: { id: activeConversationId },
        data: { leadPhoneConfirmedAt: new Date() },
      }),
    ]);
    // Mantém o objeto em memória atualizado — mesmo motivo do bloco
    // análogo de capturedLeadName logo abaixo: outras chamadas neste MESMO
    // turno, depois deste ponto (ex.: fireAttendanceConfirmationSequence/
    // maybeSendWhatsappConfirmation abaixo), leem lead.phone; sem isso, um
    // telefone salvo NESTE MESMO turno só apareceria a partir da PRÓXIMA
    // mensagem. (schedule_appointment, mais acima, já leu o telefone certo
    // pra este turno direto de capturedLeadPhone, sem depender disto.)
    lead.phone = capturedLeadPhone;
  }

  if (capturedLeadName) {
    await prisma.lead.update({ where: { id: lead.id }, data: { name: capturedLeadName } });
    // Mantém o objeto em memória atualizado — mesmo motivo do bloco acima
    // (fireAttendanceConfirmationSequence/maybeSendWhatsappConfirmation,
    // abaixo, leem lead.name). schedule_appointment já não depende mais disto (ver
    // comentário no bloco de telefone, acima).
    lead.name = capturedLeadName;
  }

  if (capturedResultPhoto) {
    // +5s pra chegar logo depois da resposta em texto, não junto/antes dela
    // — a legenda cadastrada (ResultPhoto.caption), quando existe, sai
    // ainda mais alguns segundos antes da própria foto (ver
    // buildResultPhotoMessages, src/lib/result-photo-message.ts); sem
    // legenda, comportamento idêntico ao de antes desse campo existir.
    const photoMessages = buildResultPhotoMessages(capturedResultPhoto, new Date(scheduledFor.getTime() + 5_000));
    await prisma.$transaction([
      ...photoMessages.map((draft) =>
        prisma.message.create({
          data: {
            conversationId: conversation.id,
            direction: "OUTBOUND",
            sender: "AI",
            content: draft.content,
            mediaUrl: draft.mediaUrl,
            status: "PENDING",
            scheduledFor: draft.scheduledFor,
          },
        })
      ),
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { resultPhotoSentAt: new Date() },
      }),
    ]);
  }

  // Agendamento (criação/remarcação do evento no Google Calendar +
  // Appointment) não roda mais aqui — schedule_appointment (ferramenta,
  // bem mais acima) já faz isso sozinha, ANTES de devolver confirmed:true
  // pra IA, e só devolve isso depois que o evento realmente existe. Ver o
  // comentário grande lá pro bug crítico que motivou essa mudança.

  // Sequência de confirmação de presença (apresentação + vídeo + cafezinho
  // + frase final) — aplicada num ÚNICO ponto, sempre no final de
  // handleInboundInstagramMessage, depois que TUDO mais deste turno
  // (resposta em texto, agendamento e foto de resultado, se houver) já foi
  // decidido. Reaproveita pendingAttendanceCheck, calculado ANTES de
  // generateLeadReply (ver comentário grande lá) — nunca chama
  // classifyAttendanceReply de novo pra este turno. Não precisa passar um
  // scheduledFor rastreado localmente aqui — fireAttendanceConfirmationSequence
  // busca a referência direto no banco (última Message OUTBOUND ainda
  // PENDING da conversa), a mesma lógica pros dois chamadores (resposta do
  // lead neste turno e o job de timeout de 1h). Ver comentário grande lá.
  if (pendingAttendanceCheck) {
    await applyAttendanceReplyDecision({
      clinicId: clinic.id,
      conversationId: conversation.id,
      appointmentId: pendingAttendanceCheck.appointmentId,
      decision: pendingAttendanceCheck.decision,
    });
  }

  // Confirmação IMEDIATA do agendamento — diferente da sequência acima
  // (que só sai depois da resposta do lead à pergunta de presença, ou do
  // timeout de 1h): esta é só "agendamento existe", sem esperar mais
  // nada. SÓ por WhatsApp (decisão de produto, ver
  // INSTAGRAM_CONFIRMATION_CARD_ENABLED acima de
  // maybeSendInstagramConfirmationCard) — a chamada abaixo pro Instagram
  // continua aqui só porque a função sai sozinha, sem fazer nada, antes
  // de tocar no banco (mesmo padrão de REMINDERS_ENABLED); try/catch
  // separado pra cada, mesmo assim, igual a antes.
  try {
    await maybeSendWhatsappConfirmation({ clinicId: clinic.id, conversationId: conversation.id });
  } catch (err) {
    console.error("[vexo] Falha ao enfileirar confirmação de agendamento por WhatsApp:", err);
  }
  try {
    await maybeSendInstagramConfirmationCard({ clinicId: clinic.id, conversationId: conversation.id, scheduledFor });
  } catch (err) {
    console.error("[vexo] Falha ao enfileirar confirmação de agendamento por Instagram:", err);
  }
}

// Descrição do evento do Google Calendar — separada do summary (que já
// leva o nome, ver "VEXO — Avaliação: ${leadName}" na ferramenta
// scheduleAppointment, bem mais acima) pra que o WhatsApp do lead apareça
// de forma legível assim que a secretária abrir o compromisso, sem
// precisar abrir o CRM interno (tela que ela não tem acesso) nem o Painel
// pra achar esse dado. Reaproveitada tanto na criação (dentro da própria
// ferramenta scheduleAppointment) quanto no "backfill" quando o telefone
// chega numa conversa DEPOIS do agendamento já confirmado (ver
// maybeSendWhatsappConfirmation, abaixo).
// Exportada só pra teste (mesmo padrão de buildAvailabilityCheck, acima).
export function buildCalendarEventDescription(params: { leadName: string; leadPhone?: string | null }): string {
  // formatBrazilianPhoneForDisplay (whatsapp.ts): mostra "(21) 99822-3038"
  // em vez do E.164 cru ("5521998223038") que fica salvo em Lead.phone —
  // só formatação, o valor já chega aqui validado (ver saveLeadPhone).
  const phoneLine = params.leadPhone
    ? `WhatsApp: ${formatBrazilianPhoneForDisplay(params.leadPhone)}`
    : "WhatsApp: ainda não informado.";
  return `Lead: ${params.leadName}\n${phoneLine}\n\nCriado automaticamente pelo VEXO.`;
}

// Avalia se existe uma pergunta de presença pendente pra esta conversa
// (Appointment.attendancePromptSentAt setado por scheduleAppointment,
// sequência ainda não disparada) e, se existir, classifica a resposta mais
// recente do lead (classifyAttendanceReply, anthropic.ts). Separada de
// applyAttendanceReplyDecision (abaixo) — e chamada ANTES de
// generateLeadReply, não só no fim do turno como antes — porque a resposta
// da IA pra este MESMO turno precisa saber, de antemão, se a sequência vai
// disparar (pra não escrever sua própria despedida e duplicar a frase
// final, ver attendanceConfirmedContext/contextNote em
// handleInboundInstagramMessage). O resultado é reaproveitado no fim do
// turno (applyAttendanceReplyDecision) — NUNCA chama classifyAttendanceReply
// de novo pra esse mesmo turno.
//
// Fora de um agendamento recém-confirmado isso é raro, então o lookup
// extra em toda mensagem nova é barato.
export async function checkPendingAttendanceReply(params: {
  conversationId: string;
  recentHistory: ChatTurn[];
}): Promise<{ appointmentId: string; decision: AttendanceReplyDecision } | null> {
  const pendingAttendanceAppointment = await prisma.appointment.findFirst({
    where: {
      conversationId: params.conversationId,
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      attendancePromptSentAt: { not: null },
      confirmationVideoSentAt: null,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!pendingAttendanceAppointment) return null;

  // classifyAttendanceReply (anthropic.ts) substitui a antiga tool
  // confirm_attendance — classifica a resposta do lead em
  // REMARCA/NAO_REMARCA/DUVIDA. Nunca lança (ver a função — qualquer erro
  // de chamada/parsing já cai em DUVIDA sozinho), e DUVIDA é tratado em
  // applyAttendanceReplyDecision exatamente como "nada pendente ainda":
  // nem dispara a sequência, nem cancela o timer de 1h, e (ver
  // handleInboundInstagramMessage) nem muda a instrução da IA pra esse
  // turno — o job de timeout (processAttendanceConfirmationTimeouts)
  // decide mais tarde, com mais contexto (ou nenhum, se o lead nunca mais
  // responder). Mesmo comportamento seguro de sempre, só que decidido mais
  // cedo no turno.
  const decision = await classifyAttendanceReply(params.recentHistory);
  return { appointmentId: pendingAttendanceAppointment.id, decision };
}

// Aplica a decisão já calculada por checkPendingAttendanceReply — nunca
// reclassifica. Separada só pra poder ser chamada depois de
// generateLeadReply, no fim do turno (mesmo ponto onde
// maybeHandlePendingAttendanceReply, versão anterior desta função, era
// chamada), sem duplicar a classificação feita mais cedo no mesmo turno.
export async function applyAttendanceReplyDecision(params: {
  clinicId: string;
  conversationId: string;
  appointmentId: string;
  decision: AttendanceReplyDecision;
}): Promise<void> {
  if (params.decision === "REMARCA") {
    // Cancela a espera — o fluxo de remarcação segue normal pelo resto da
    // conversa (schedule_appointment, se o lead der um horário novo, seta
    // attendancePromptSentAt de novo — ver comentário lá).
    await prisma.appointment.updateMany({
      where: { id: params.appointmentId, confirmationVideoSentAt: null },
      data: { attendancePromptSentAt: null },
    });
  } else if (params.decision === "NAO_REMARCA") {
    await fireAttendanceConfirmationSequence({
      appointmentId: params.appointmentId,
      clinicId: params.clinicId,
      conversationId: params.conversationId,
    });
  }
}

// Sequência de confirmação de presença (vídeo institucional + cafezinho) —
// histórico de três gerações de bug real reportadas em produção quando
// isto ainda era só o vídeo, resolvidas consolidando a chamada num ÚNICO
// ponto (ver o fim de handleInboundInstagramMessage): o vídeo saía
// IMEDIATAMENTE ao agendar, antes do WhatsApp sequer ter sido informado;
// depois, mesmo com essa trava, saía "no meio" da sequência por ser
// chamado de dois lugares diferentes no mesmo turno; depois, mesmo
// consolidado num único ponto, saía cedo demais — logo depois de
// schedule_appointment confirmar o horário, ANTES do lead responder "sim,
// posso ir" — porque nada no código sabia identificar o fim de verdade da
// sequência de confirmação de presença (que só existia como texto livre
// gerado pela IA).
//
// Correção atual (bug mais recente: vídeo e "cafezinho" saindo colados,
// o vídeo passando despercebido): a IA não escreve mais nenhum texto de
// cafezinho — só pergunta "posso contar com sua presença?" e segue a
// conversa (ver dateTimeContext, acima). Appointment.attendancePromptSentAt
// (setado por scheduleAppointment, mais acima) marca que essa pergunta
// está pendente; dois disparadores decidem o que fazer com a resposta:
//   1. A resposta do lead, classificada por classifyAttendanceReply
//      (anthropic.ts) — ver o bloco no fim de handleInboundInstagramMessage.
//   2. processAttendanceConfirmationTimeouts (mais abaixo), rodando no
//      worker a cada 3 minutos — se passar 1h sem resposta
//      (ATTENDANCE_AUTO_SEND_AFTER_MS), dispara a mesma sequência sozinho,
//      respeitando a janela de envio do follow-up.
//
// Esta função é o disparo de fato, chamada pelos dois — nunca direto pela
// IA. Trava por Appointment.confirmationVideoSentAt (reivindicada com um
// update condicional, mesmo padrão de claimMessage em dispatch.ts) garante
// que a sequência sai UMA ÚNICA VEZ por agendamento, mesmo que o job de
// timeout e a resposta do lead cheguem ao mesmo tempo — só uma das duas
// chamadas concorrentes vence a reivindicação; a outra devolve false sem
// mandar nada.
// Exportada só pra teste (mesmo padrão de buildAvailabilityCheck, acima).
export async function fireAttendanceConfirmationSequence(params: {
  appointmentId: string;
  clinicId: string;
  conversationId: string;
}): Promise<boolean> {
  const [clinic, conversation, appointment] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: params.clinicId } }),
    prisma.conversation.findUnique({ where: { id: params.conversationId }, include: { lead: true } }),
    // scheduledAt capturado AQUI, antes de qualquer envio — é o valor
    // contra o qual a frase final (último elo, ver dispatch.ts) confere se
    // o agendamento foi remarcado nesse meio-tempo, antes de decidir se
    // ainda faz sentido mandar "até [dia]".
    prisma.appointment.findUnique({ where: { id: params.appointmentId }, select: { scheduledAt: true } }),
  ]);
  // Sem vídeo configurado ou sem WhatsApp do lead ainda — não é erro, só
  // significa "ainda não é a hora"; a próxima chamada (job de 1h seguinte,
  // ou uma nova resposta do lead) tenta de novo. De propósito ANTES da
  // reivindicação abaixo — nada é marcado como "já enviado" se não havia
  // o que enviar de verdade.
  if (!clinic?.confirmationVideoUrl) return false;
  if (!conversation?.lead.phone) return false;
  if (!appointment) return false; // defensivo — appointmentId sempre vem de uma query que já filtra agendamento existente

  const claim = await prisma.appointment.updateMany({
    where: { id: params.appointmentId, confirmationVideoSentAt: null },
    data: { confirmationVideoSentAt: new Date() },
  });
  if (claim.count !== 1) return false; // outra chamada concorrente já disparou

  // Bug real reportado em produção (ver histórico grande acima): o vídeo
  // saía IMEDIATAMENTE (scheduledFor: agora), antes da própria mensagem de
  // texto deste turno (reply.text, com delay adaptativo — ver
  // computeAdaptiveDelaySeconds) ter saído.
  //
  // Segundo bug real reportado, mesma família: a mensagem de confirmação do
  // agendamento ("Sua avaliação está marcada para...") e a apresentação do
  // vídeo ("vou te mandar um vídeo rápido...") saindo COLADAS, sem
  // intervalo nenhum. Causa raiz: o valor antigo usado como âncora vinha de
  // um parâmetro (afterScheduledFor) calculado pelo CHAMADOR — uma variável
  // local em handleInboundInstagramMessage (o scheduledFor da própria
  // resposta deste turno, congelado no momento em que ela foi criada) ou um
  // "agora" literal no job de timeout de 1h. Nos dois casos, nada garantia
  // que esse valor ainda refletisse a realidade no momento em que este
  // código de fato rodava — bastava o processamento (classificação +
  // geração da IA) demorar um pouco mais que o próprio delay adaptativo da
  // resposta pendente pra esse valor já estar no passado, fazendo
  // introAt = valor_já_passado + 10s cair perto (ou dentro) do MESMO ciclo
  // de despacho (dispatchDueMessages roda a cada 15s) da resposta ainda
  // PENDING — as duas saíam juntas, sem qualquer intervalo real percebido
  // pelo lead.
  //
  // Corrigido buscando a referência direto no banco: o scheduledFor da
  // última Message OUTBOUND ainda PENDING desta conversa (normalmente a
  // própria resposta de texto deste turno, ou a foto de resultado, se
  // houver — mas também cobre qualquer outra mensagem pendente que o
  // chamador não soubesse rastrear, como no job de timeout) — nunca menor
  // que "agora" (Math.max), pra nunca ancorar num instante já passado. Essa
  // é a MESMA lógica pros dois chamadores (resposta do lead no mesmo turno
  // e o job de 1h) — elimina a dependência de cada um calcular/rastrear
  // isso por conta própria.
  const latestPendingOutbound = await prisma.message.findFirst({
    where: { conversationId: params.conversationId, direction: "OUTBOUND", status: "PENDING" },
    orderBy: [{ scheduledFor: "desc" }, { id: "desc" }],
    select: { scheduledFor: true },
  });
  const afterScheduledFor = new Date(Math.max(Date.now(), latestPendingOutbound?.scheduledFor?.getTime() ?? 0));

  const introAt = new Date(afterScheduledFor.getTime() + ATTENDANCE_VIDEO_INTRO_DELAY_MS);
  const introText = clinic.confirmationVideoCaption?.trim() || DEFAULT_CONFIRMATION_VIDEO_CAPTION;
  const tipText = clinic.attendanceTipMessage?.trim() || DEFAULT_ATTENDANCE_TIP_MESSAGE;
  const finalText = resolveAttendanceFinalMessage(clinic.attendanceFinalMessage, appointment.scheduledAt, new Date());

  // Só a apresentação é criada aqui — vídeo, cafezinho e frase final são
  // criados em CADEIA, cada um só depois que dispatch.ts confirma o SENT
  // do anterior (ver PendingAttendanceStep, no topo do arquivo, e o
  // comentário grande em ATTENDANCE_VIDEO_DELAY_AFTER_INTRO_MS). O que o
  // vídeo vai precisar (mediaUrl) e tudo que os elos seguintes vão
  // precisar (tipText/finalText/appointmentId/scheduledAtMs) já viaja
  // resolvido daqui — nenhum elo mais adiante recalcula nada por conta
  // própria, só repassa.
  await prisma.message.create({
    data: {
      conversationId: params.conversationId,
      direction: "OUTBOUND",
      sender: "SYSTEM",
      content: introText,
      status: "PENDING",
      scheduledFor: introAt,
      pendingAttendanceStep: encodePendingAttendanceStep({
        next: "video",
        mediaUrl: clinic.confirmationVideoUrl,
        tipText,
        finalText,
        appointmentId: params.appointmentId,
        scheduledAtMs: appointment.scheduledAt.getTime(),
      }),
    },
  });
  return true;
}

// Job do worker (ver src/worker/index.ts, a cada 3 minutos) — dispara a
// sequência vídeo+cafezinho sozinho quando o lead não respondeu à
// pergunta de presença dentro de ATTENDANCE_AUTO_SEND_AFTER_MS (1h).
//
// Respeita a janela de envio do follow-up (FollowUpSettings — mesma usada
// por dispatchFollowUpSteps, follow-up.ts): se a 1h vencer fora da janela,
// este ciclo não dispara nada — o próximo ciclo (3 min depois) tenta de
// novo, e assim sucessivamente até a janela abrir. Nunca descarta: o
// filtro é sempre "já venceu há mais de 1h", então o agendamento continua
// elegível em todo ciclo seguinte até finalmente disparar.
//
// `conversation: { status: { notIn: [...] } }` cobre o caso comum (conversa
// ainda no mesmo estado de quando a pergunta foi feita); NEEDS_HUMAN/LOST
// de verdade já têm o timer explicitamente cancelado em escalateToHuman e
// no branch needsHuman de handleInboundInstagramMessage (attendancePromptSentAt
// zerado ali) — este filtro aqui é só uma segunda trava, nunca a única.
export async function processAttendanceConfirmationTimeouts(): Promise<{ fired: number }> {
  const now = new Date();
  const threshold = new Date(now.getTime() - ATTENDANCE_AUTO_SEND_AFTER_MS);

  const pending = await prisma.appointment.findMany({
    where: {
      status: { in: ["SCHEDULED", "CONFIRMED"] },
      attendancePromptSentAt: { not: null, lte: threshold },
      confirmationVideoSentAt: null,
      conversation: { status: { notIn: ["NEEDS_HUMAN", "LOST"] } },
    },
    select: { id: true, clinicId: true, conversationId: true },
    orderBy: { attendancePromptSentAt: "asc" },
    take: 50,
  });

  if (pending.length === 0) return { fired: 0 };

  const { windowDays, windowStartMinute, windowEndMinute } = await getFollowUpWindowSettings();
  const windowOpenNow = nextValidSendTime(now, windowDays, windowStartMinute, windowEndMinute).getTime() === now.getTime();
  if (!windowOpenNow) return { fired: 0 }; // fora da janela — adia pro próximo ciclo, nunca descarta

  let fired = 0;
  for (const appt of pending) {
    if (!appt.conversationId) continue; // defesa — nunca deveria acontecer (attendancePromptSentAt só é setado por scheduleAppointment, que sempre tem conversationId)
    try {
      const sent = await fireAttendanceConfirmationSequence({
        appointmentId: appt.id,
        clinicId: appt.clinicId,
        conversationId: appt.conversationId,
      });
      if (sent) fired++;
    } catch (err) {
      // Mesmo isolamento por item de processSilentConversations
      // (follow-up.ts) — uma falha neste agendamento específico nunca pode
      // impedir os outros do mesmo lote de serem tentados.
      console.error(`[vexo:attendance] Falha ao disparar sequência (appointmentId=${appt.id}):`, err);
    }
  }
  return { fired };
}

// Confirmação IMEDIATA do agendamento por WhatsApp — bug relatado: nenhuma
// mensagem confirmava o agendamento por WhatsApp, mesmo com o número
// informado; só existiam o vídeo institucional (Instagram, gate bem mais
// rígido — ver fireAttendanceConfirmationSequence acima) e os lembretes de
// véspera (12h/3h antes, ReminderConfig/reminders.ts). Diferente dos dois:
// esta dispara assim que o agendamento existe E o telefone está
// disponível, sem esperar a sequência de confirmação de presença nem uma
// janela fixa antes da consulta.
//
// INDEPENDENTE de maybeSendInstagramConfirmationCard (mais abaixo), de
// propósito: os dois canais são enfileirados e despachados sem nenhuma
// dependência entre si — chamados do mesmo call site, mas cada um com sua
// própria trava (Appointment.whatsappConfirmationSentAt /
// instagramConfirmationSentAt). Se este (WhatsApp) não tiver o que mandar
// (clínica sem WhatsApp conectado, telefone ainda não informado) ou
// falhar depois de esgotar as tentativas (ver isAppointmentConfirmation,
// dispatch.ts), o Instagram sai normalmente do mesmo jeito — e vice-versa.
//
// Mesma arquitetura de despacho de tudo mais no VEXO: NÃO chama
// sendWhatsappMessage direto — só enfileira um Message (channel
// WHATSAPP, status PENDING), despachado de fato por dispatchDueMessages
// (src/lib/dispatch.ts), com o mesmo claim atômico contra envio em dobro
// (ver PR do bug de mensagem duplicada) e a mesma resiliência a
// crash/redeploy no meio do envio. isAppointmentConfirmation: true marca
// esta Message pra dispatchOneMessage aplicar até 3 tentativas com
// backoff crescente antes de desistir (ver comentário grande lá) —
// Follow-up (mesmo channel WHATSAPP, Message sem essa marca) continua com
// uma tentativa só, sem retry, exatamente como sempre foi.
//
// Idempotente (Appointment.whatsappConfirmationSentAt) e silenciosa
// quando ainda não há o que mandar (sem agendamento ativo, sem telefone,
// ou clínica sem WhatsApp conectado) — mesmo padrão de
// fireAttendanceConfirmationSequence, chamada do mesmo único call site.
async function maybeSendWhatsappConfirmation(params: { clinicId: string; conversationId: string }) {
  const appointment = await prisma.appointment.findFirst({
    where: { conversationId: params.conversationId, status: { in: ["SCHEDULED", "CONFIRMED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!appointment || appointment.whatsappConfirmationSentAt) return;

  const [clinic, conversation] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: params.clinicId } }),
    prisma.conversation.findUnique({ where: { id: params.conversationId }, include: { lead: true } }),
  ]);
  if (!clinic?.whatsappInstanceName) return;
  // Ainda sem WhatsApp — não é erro, só significa "ainda não é a hora"; a
  // próxima chamada (quando o telefone chegar) tenta de novo.
  if (!conversation?.lead.phone) return;

  // Nome já é garantido pela trava de schedule_appointment (ver
  // scheduleAppointment mais acima — nunca confirma sem um nome real
  // salvo), mas o "primeiro nome" em si (split) merece um fallback
  // defensivo caso o lead tenha informado só um nome de uma palavra
  // estranha ou algo inesperado.
  const leadFirstName = conversation.lead.name?.trim().split(/\s+/)[0] || "tudo bem";

  // "Backfill" do evento do Google Calendar — cobre o caso comum de
  // schedule_appointment ser confirmado ANTES do telefone chegar (a
  // ferramenta não exige telefone, só nome, ver scheduleAppointment mais
  // acima): sem isto, um evento criado sem telefone ainda nunca seria
  // atualizado depois, mesmo com o WhatsApp chegando numa conversa
  // seguinte. Best-effort (não pode impedir a mensagem de confirmação de
  // sair só porque o Google Calendar falhou) — roda só uma vez, protegido
  // pelo mesmo whatsappConfirmationSentAt gravado abaixo.
  if (appointment.googleEventId && conversation.lead.name) {
    try {
      await updateCalendarEventDescription(
        params.clinicId,
        appointment.googleEventId,
        buildCalendarEventDescription({ leadName: conversation.lead.name, leadPhone: conversation.lead.phone })
      );
    } catch (err) {
      console.error("[vexo] Falha ao atualizar descrição do evento no Google Calendar:", err);
    }
  }

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: params.conversationId,
        direction: "OUTBOUND",
        sender: "AI",
        channel: "WHATSAPP",
        content: formatAppointmentConfirmationMessage({
          leadFirstName,
          clinicName: clinic.name,
          scheduledAt: appointment.scheduledAt,
          clinicAddress: clinic.address,
        }),
        isAppointmentConfirmation: true,
        status: "PENDING",
        scheduledFor: new Date(),
      },
    }),
    prisma.appointment.update({
      where: { id: appointment.id },
      data: { whatsappConfirmationSentAt: new Date() },
    }),
  ]);
}

// Dados do cartão de confirmação de agendamento por Instagram, guardados
// em Message.instagramConfirmationCard (JSON) — mesmo padrão de
// ClinicContactCard, acima: dispatchOneMessage (dispatch.ts) decodifica
// isso na hora de enviar pra montar o Generic Template (sem botão, ao
// contrário do cartão de contato).
export type InstagramConfirmationCard = { title: string; subtitle: string };

export function encodeInstagramConfirmationCard(card: InstagramConfirmationCard): string {
  return JSON.stringify(card);
}

// null em qualquer JSON inválido/inesperado — mesmo espírito defensivo de
// decodeClinicContactCard, acima: um valor corrompido não pode travar o
// despacho da mensagem, só forçar o fallback em texto (ver
// dispatchOneMessage, dispatch.ts).
export function decodeInstagramConfirmationCard(raw: string): InstagramConfirmationCard | null {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.title === "string" && typeof parsed.subtitle === "string") {
      return parsed as InstagramConfirmationCard;
    }
  } catch {
    // ignora — JSON inválido cai no null abaixo
  }
  return null;
}

// Subtítulo do cartão de confirmação — dia/horário (ver formatDateTimeLabel,
// whatsapp.ts) + endereço da clínica, só se preenchido (senão omite por
// completo, nunca uma linha vazia ou "endereço não informado"). "·" em vez
// de quebra de linha de propósito — o subtítulo de um Generic Template do
// Instagram é um campo de UMA linha; diferente do texto corrido da
// confirmação por WhatsApp (formatAppointmentConfirmationMessage), que usa
// \n normalmente. Exportada só pra teste.
export function buildInstagramConfirmationCardSubtitle(scheduledAt: Date, clinicAddress?: string | null): string {
  const dataHorario = formatDateTimeLabel(scheduledAt, new Date());
  const address = clinicAddress?.trim();
  return address ? `${dataHorario} · ${address}` : dataHorario;
}

// Decisão de produto: a confirmação de agendamento sai SÓ por WhatsApp —
// o lead que acabou de agendar já recebe a frase da IA confirmando o
// horário na mesma conversa do Instagram (+ "posso contar com sua
// presença?"), uma segunda confirmação em cartão ali seria redundante.
// Desligada (não apagada), mesmo padrão de REMINDERS_ENABLED/
// WEEKLY_SUMMARY_WHATSAPP_ENABLED (reminders.ts/weekly-summary.ts):
// nenhuma coluna/tabela apagada, sem migration — Appointment.
// instagramConfirmationSentAt e Message.instagramConfirmationCard ficam
// no banco sem uso (isAppointmentConfirmation continua valendo, só pra
// retentativa da confirmação por WhatsApp, ver dispatch.ts). Guard dentro
// da própria função (abaixo) e em dispatchOneMessage (dispatch.ts, mesma
// flag importada) — fácil reverter (= true) se o produto decidir trazer
// o cartão de volta, sem precisar reescrever nada.
export const INSTAGRAM_CONFIRMATION_CARD_ENABLED = false;

// Confirmação IMEDIATA do agendamento por INSTAGRAM, via cartão (Generic
// Template, sem botão — ver sendInstagramGenericTemplateCard, instagram.ts)
// — MESMO conteúdo da confirmação por WhatsApp, acima (nome da clínica,
// dia/horário, endereço só se preenchido), só que como cartão (título =
// nome da clínica, subtítulo = dia/horário/endereço) em vez de texto
// corrido. Se a Graph API rejeitar o cartão, dispatchOneMessage (dispatch.ts)
// manda o MESMO texto da confirmação por WhatsApp em texto normal — por
// isso `content`, abaixo, já vem pronto com formatAppointmentConfirmationMessage,
// nunca usado de verdade quando o cartão é aceito, mas sempre disponível
// pro fallback. Nunca duas mensagens de confirmação no Instagram pro mesmo
// agendamento: Appointment.instagramConfirmationSentAt trava isso (mesmo
// padrão de whatsappConfirmationSentAt, acima).
//
// INDEPENDENTE de maybeSendWhatsappConfirmation de propósito (pedido
// explícito, ver comentário grande lá): não olha pro telefone do lead nem
// pro WhatsApp da clínica — só precisa do agendamento existir. Se o
// WhatsApp da clínica estiver desconectado (ou o telefone do lead ainda
// não tiver chegado), o Instagram sai normalmente do mesmo jeito.
//
// scheduledFor ANCORADO no scheduledFor da resposta principal deste turno
// (+2s) — NUNCA "agora" (ao contrário da confirmação por WhatsApp, que é
// outro canal/outra janela de chat e não tem esse risco): a resposta
// principal da IA neste mesmo turno (que inclui "posso contar com sua
// presença?", ver dateTimeContext) já está enfileirada com o delay
// adaptativo normal, que pode ser bem maior que instantâneo — sem ancorar
// nisso, o cartão de confirmação podia chegar ANTES da própria resposta
// no mesmo chat do Instagram. Mesmo padrão de clinicContactCard, acima.
// Nunca atrasa, duplica ou altera a sequência de confirmação de presença
// (apresentação -> vídeo -> cafezinho -> frase final, ver
// fireAttendanceConfirmationSequence): aquela só começa numa resposta
// FUTURA do lead (depois de "posso contar com sua presença?"), sempre
// depois desta Message já ter sido criada — mensagens independentes, sem
// nenhum ponto de contato entre as duas cadeias.
//
// DESLIGADA (ver INSTAGRAM_CONFIRMATION_CARD_ENABLED, acima) — sai antes
// de tocar no banco, mesmo padrão de processReminders (reminders.ts).
async function maybeSendInstagramConfirmationCard(params: {
  clinicId: string;
  conversationId: string;
  scheduledFor: Date;
}): Promise<void> {
  if (!INSTAGRAM_CONFIRMATION_CARD_ENABLED) return;

  const appointment = await prisma.appointment.findFirst({
    where: { conversationId: params.conversationId, status: { in: ["SCHEDULED", "CONFIRMED"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!appointment || appointment.instagramConfirmationSentAt) return;

  const [clinic, conversation] = await Promise.all([
    prisma.clinic.findUnique({ where: { id: params.clinicId } }),
    prisma.conversation.findUnique({ where: { id: params.conversationId }, include: { lead: true } }),
  ]);
  if (!clinic || !conversation) return;

  // Mesmo fallback defensivo de maybeSendWhatsappConfirmation, acima — o
  // nome em si já é garantido pela trava de scheduleAppointment.
  const leadFirstName = conversation.lead.name?.trim().split(/\s+/)[0] || "tudo bem";

  await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: params.conversationId,
        direction: "OUTBOUND",
        sender: "AI",
        content: formatAppointmentConfirmationMessage({
          leadFirstName,
          clinicName: clinic.name,
          scheduledAt: appointment.scheduledAt,
          clinicAddress: clinic.address,
        }),
        instagramConfirmationCard: encodeInstagramConfirmationCard({
          title: clinic.name,
          subtitle: buildInstagramConfirmationCardSubtitle(appointment.scheduledAt, clinic.address),
        }),
        status: "PENDING",
        scheduledFor: new Date(params.scheduledFor.getTime() + 2_000),
      },
    }),
    prisma.appointment.update({
      where: { id: appointment.id },
      data: { instagramConfirmationSentAt: new Date() },
    }),
  ]);
}
