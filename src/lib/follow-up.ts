import { prisma } from "@/lib/prisma";
import type { ConversationStatus } from "@prisma/client";
import { classifyConversation } from "@/lib/anthropic";
import { toChatHistory } from "@/lib/chat-history";
import { nextValidSendTime } from "@/lib/follow-up-window";
import { getLLMProvider } from "@/lib/llm/provider";

// Duas sequências de follow-up independentes (ver FollowUpTrigger no schema):
//
//  - SILENCE: automático — o lead para de responder. Detectado sozinho pela
//    última mensagem da conversa, sem ação manual de ninguém. Só vale ANTES
//    do agendamento: a query abaixo olha só conversas com status
//    IN_CONVERSATION, então some da lista assim que o lead agenda (status
//    vira SCHEDULED) — dali em diante é só o fluxo de lembrete/no-show.
//    A decisão final usa Haiku para não reabrir follow-up em conversas que
//    já chegaram a uma conclusão natural (ex: recusa explícita).
//
//  - NO_SHOW: manual — só a secretária sabe se o paciente compareceu, o
//    sistema não tem como saber sozinho. Disparado pela chave "Compareceu /
//    Não compareceu" na tela do agendamento (ver src/lib/appointments.ts) —
//    não há nenhuma detecção automática por tempo decorrido.
//
// As mensagens enviadas seguem a sequência configurável em FollowUpStep
// (editável em /crm/follow-up, uma lista por trigger), e só saem dentro da
// janela de envio configurável (ver follow-up-window.ts) — fora da janela,
// o horário de envio é adiado pra próxima ocorrência válida em vez de
// disparar na hora.
//
// Cada log de follow-up avança pela sequência do seu próprio trigger a cada
// execução do worker, e para de avançar assim que o lead responde: ver
// cancelPendingFollowUp, chamada tanto por conversation-pipeline.ts (lead
// respondeu) quanto por appointments.ts (secretária desmarcou "não
// compareceu").

const DEFAULT_SILENCE_HOURS = 24;
const DEFAULT_WINDOW_DAYS = [1, 2, 3, 4, 5];
const DEFAULT_WINDOW_START_MINUTE = 8 * 60;
const DEFAULT_WINDOW_END_MINUTE = 18 * 60;

async function getSettings() {
  const settings = await prisma.followUpSettings.findUnique({ where: { id: "singleton" } });
  return {
    silenceHours: settings?.silenceHours ?? DEFAULT_SILENCE_HOURS,
    windowDays: settings?.windowDays?.length ? settings.windowDays : DEFAULT_WINDOW_DAYS,
    windowStartMinute: settings?.windowStartMinute ?? DEFAULT_WINDOW_START_MINUTE,
    windowEndMinute: settings?.windowEndMinute ?? DEFAULT_WINDOW_END_MINUTE,
  };
}

// Exportado pra conversation-pipeline.ts reconhecer reengajamento (lead
// voltando depois de sumir por muito tempo) com o MESMO limiar usado aqui
// pra disparar follow-up automático — evita um segundo número mágico
// desencontrado do primeiro.
export async function getSilenceHours(): Promise<number> {
  return (await getSettings()).silenceHours;
}

// Move a conversa pra FOLLOW_UP e abre um log — chamada tanto pela detecção
// automática de silêncio quanto pela marcação manual de "não compareceu"
// (src/lib/appointments.ts). `previousStatus` é opcional e só usado pelo
// caminho de não-comparecimento: guarda em que coluna do Pipeline a
// conversa estava antes de mover, pra dar pra desfazer depois voltando pra
// lá em vez de assumir uma coluna fixa — ver setAppointmentAttendance.
//
// O prazo da sequência conta a partir do momento em que este log é criado
// (triggeredAt usa o default now() do schema) — inclusive pro NO_SHOW, ou
// seja, a partir do CLIQUE da secretária em "Não compareceu", não do
// horário agendado da consulta. Isso é proposital: o lead pode ter avisado
// por fora (telefone) que vai atrasar ou remarcar, e a secretária só marca
// "não compareceu" depois de confirmar que é o caso — contar a partir do
// horário agendado faria a primeira mensagem de reengajamento disparar
// imediatamente ao clicar (prazo já vencido), confundindo um lead que já
// tinha avisado que estava a caminho.
export async function triggerFollowUp(
  conversationId: string,
  trigger: "SILENCE" | "NO_SHOW",
  previousStatus?: ConversationStatus
) {
  await prisma.$transaction([
    prisma.conversation.update({
      where: { id: conversationId },
      data: { status: "FOLLOW_UP", ...(previousStatus ? { previousStatus } : {}) },
    }),
    prisma.followUpLog.create({ data: { conversationId, trigger } }),
  ]);
}

// Interrompe qualquer follow-up em andamento numa conversa: fecha os logs
// abertos (o dispatcher para de avançá-los) e cancela mensagens já
// enfileiradas (status PENDING) que ainda não saíram de fato — sem isso,
// uma mensagem que já tinha sido posta na fila pelo worker ainda seria
// enviada mesmo depois do lead responder ou da secretária desmarcar.
export async function cancelPendingFollowUp(
  conversationId: string,
  at: Date = new Date(),
  newConversationStatus?: ConversationStatus
) {
  await prisma.$transaction([
    prisma.followUpLog.updateMany({
      where: { conversationId, respondedAt: null },
      data: { respondedAt: at },
    }),
    prisma.message.deleteMany({
      where: { conversationId, status: "PENDING", sender: "AI" },
    }),
    ...(newConversationStatus
      ? [prisma.conversation.update({ where: { id: conversationId }, data: { status: newConversationStatus } })]
      : []),
  ]);
}

// Teto por ciclo — mesmo racional de dispatchDueMessages (dispatch.ts,
// take: 50): sem isso, esta função processava TODAS as conversas
// silenciosas de uma vez, uma por uma, cada uma com uma chamada de IA
// (classifyConversation) real. Ver diagnóstico de capacidade (avaliação
// de escala pra 100 clínicas) — esse era o candidato mais forte a
// estourar o intervalo de 30min entre ciclos conforme o volume de
// conversas silenciosas crescesse, sem nenhum limite pra segurar isso.
// Prioriza as conversas silenciosas HÁ MAIS TEMPO (lastLeadMessageAt
// ascendente) — se o lote não cobrir tudo num ciclo só, as mais atrasadas
// são tentadas primeiro, e o resto entra no próximo ciclo (30min depois),
// nunca ficando pra trás indefinidamente enquanto o volume não passar
// consistentemente da capacidade deste teto.
const SILENT_CONVERSATION_BATCH_SIZE = 50;

async function processSilentConversations(): Promise<number> {
  const { silenceHours } = await getSettings();
  const silenceThreshold = new Date(Date.now() - silenceHours * 60 * 60 * 1000);

  // status: IN_CONVERSATION exclui de propósito quem já agendou (SCHEDULED)
  // — o gatilho de silêncio só vale antes do agendamento acontecer.
  const staleConversations = await prisma.conversation.findMany({
    where: { status: "IN_CONVERSATION", lastLeadMessageAt: { lt: silenceThreshold } },
    include: { messages: { orderBy: { createdAt: "asc" } } },
    orderBy: { lastLeadMessageAt: "asc" },
    take: SILENT_CONVERSATION_BATCH_SIZE,
  });

  let triggered = 0;
  for (const conv of staleConversations) {
    // Bug real em produção: FollowUpLog SEMPRE vazia, mesmo com conversas
    // claramente elegíveis (silenceHours ultrapassado há horas) e a
    // janela de envio liberada — o sistema nunca sequer TENTAVA disparar.
    // Causa raiz: nada neste `for` estava protegido por try/catch. Se
    // classifyConversation lançasse uma exceção pra UMA conversa (ex:
    // provider.complete() falhando — candidato concreto: OPENROUTER_API_KEY
    // não configurada no serviço WORKER especificamente, depois da troca
    // de LLM_PROVIDER pra "openrouter" — ver PR anterior sobre Luna no
    // classificador), o `for` inteiro abortava ali: nem as conversas
    // SEGUINTES desta mesma leva eram tentadas, nem dispatchFollowUpSteps()
    // (chamado depois, em processFollowUps, só DEPOIS deste loop terminar)
    // chegava a rodar naquele ciclo — derrubando também NO_SHOW e
    // qualquer log SILENCE já aberto anteriormente, que nem dependem de
    // classifyConversation. Isso explica "sempre vazia": se a causa for
    // determinística (uma variável de ambiente faltando, não uma falha
    // intermitente), TODO ciclo (a cada 30min) falha da mesma forma, pra
    // sempre, sem nenhum follow-up jamais sendo tentado. Isola por
    // conversa agora: uma falha aqui nunca mais pode impedir as outras
    // nem o passo de despacho.
    try {
      const alreadyPending = await prisma.followUpLog.findFirst({
        where: { conversationId: conv.id, respondedAt: null },
      });
      if (alreadyPending) continue;

      const signal = await classifyConversation(toChatHistory(conv.messages));
      const activeProvider = getLLMProvider();
      const modelLabel = `${process.env.LLM_PROVIDER ?? "anthropic"}:${activeProvider.modelForTier("backstage")}`;
      // Diagnóstico PERMANENTE (não temporário — este é o único ponto de
      // decisão de todo o gatilho SILENCE, e até agora não deixava nenhum
      // rastro CONSULTÁVEL em lugar nenhum quando decidia NÃO disparar —
      // só um console.log, invisível sem acesso a log do Railway. Bug
      // real reportado: uma conversa claramente elegível, travada há
      // muito mais que um ciclo, sem NENHUM registro do motivo em
      // FollowUpLog nem em Conversation (needsHumanReason, previousStatus
      // — nenhum dos dois é sobre isso). Persiste direto na conversa
      // agora (lastSilenceCheckAt/Suggested/Reason/Model), visível em
      // /crm/dispatch-status sem precisar de log nenhum — cobre aceito e
      // recusado, sempre, não só quando dá erro.
      await prisma.conversation.update({
        where: { id: conv.id },
        data: {
          lastSilenceCheckAt: new Date(),
          lastSilenceCheckSuggested: signal.suggestedFollowUp,
          lastSilenceCheckReason: signal.suggestedFollowUpReason || null,
          lastSilenceCheckModel: modelLabel,
        },
      });
      console.log(
        `[vexo:followup] conversationId=${conv.id} silenceHours=${silenceHours} model=${modelLabel} ` +
          `suggestedFollowUp=${signal.suggestedFollowUp} suggestedFollowUpReason=${JSON.stringify(signal.suggestedFollowUpReason)} ` +
          `summary=${JSON.stringify(signal.summary)}`
      );
      if (!signal.suggestedFollowUp) continue;

      await triggerFollowUp(conv.id, "SILENCE");
      triggered++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[vexo:followup] ERRO ao processar conversationId=${conv.id} — pulando pra próxima:`, err);
      // Mesmo diagnóstico persistido acima, agora pro caso de ERRO — sem
      // isso, uma falha específica desta conversa (não um problema
      // sistêmico do ciclo inteiro, já coberto por
      // FollowUpSettings.lastSilenceCheckError) ficava só no console,
      // igual ao caso que motivou esta correção inteira.
      await prisma.conversation
        .update({
          where: { id: conv.id },
          data: {
            lastSilenceCheckAt: new Date(),
            lastSilenceCheckSuggested: null,
            lastSilenceCheckReason: `[ERRO] ${message}`,
            lastSilenceCheckModel: null,
          },
        })
        .catch((updateErr) =>
          console.error(`[vexo:followup] Falha ao gravar diagnóstico de erro pra conversationId=${conv.id}:`, updateErr)
        );
    }
  }
  return triggered;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

// Suporte à variável {{primeiro_nome}} no texto dos passos de follow-up
// (editável em /crm/follow-up) — a clínica escreve o texto uma vez e cada
// lead recebe com o próprio nome no lugar. Prioriza Lead.name (preenchido
// na abordagem manual); cai pro igUsername quando não tem; string vazia se
// nenhum dos dois existir (a mensagem sai sem o nome nesse caso, em vez de
// deixar a variável sem substituir).
//
// Exportadas (não só usadas aqui): conversation-pipeline.ts também aplica
// em clinic.aiSystemPrompt antes de mandar pro modelo — sem isso, um
// prompt customizado escrito com essa mesma variável (convenção já usada
// nos templates de lembrete/follow-up) sai literal na resposta da IA
// ("Por nada, {{primeiro_nome}}...") em vez de virar o nome do lead.
export function leadFirstName(lead: { name: string | null; igUsername: string | null }): string {
  const raw = (lead.name ?? lead.igUsername ?? "").trim();
  return raw.split(/\s+/)[0] ?? "";
}

export function applyTemplateVariables(text: string, lead: { name: string | null; igUsername: string | null }): string {
  return text.replaceAll("{{primeiro_nome}}", leadFirstName(lead));
}

async function dispatchFollowUpSteps(): Promise<number> {
  const [silenceSteps, noShowSteps, settings] = await Promise.all([
    prisma.followUpStep.findMany({ where: { trigger: "SILENCE" }, orderBy: { order: "asc" } }),
    prisma.followUpStep.findMany({ where: { trigger: "NO_SHOW" }, orderBy: { order: "asc" } }),
    getSettings(),
  ]);

  const openLogs = await prisma.followUpLog.findMany({
    where: { respondedAt: null, conversation: { status: "FOLLOW_UP" } },
    include: {
      conversation: {
        select: {
          lastLeadMessageAt: true,
          lead: { select: { name: true, igUsername: true, phone: true } },
          appointments: {
            where: { status: { in: ["SCHEDULED", "CONFIRMED"] } },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  let dispatched = 0;
  const now = new Date();

  for (const log of openLogs) {
    // Sem passo configurado pra esse trigger: não envia nada — sem mensagem
    // padrão/fallback. Só sai o que a clínica configurou explicitamente em
    // /crm/follow-up.
    const steps = log.trigger === "NO_SHOW" ? noShowSteps : silenceSteps;

    const nextIndex = (log.lastStepIndex ?? -1) + 1;
    const nextStep = steps[nextIndex];
    if (!nextStep) continue; // sequência já concluída para este log

    const dueAt = log.lastStepSentAt
      ? addHours(log.lastStepSentAt, nextStep.offsetHours)
      : addHours(log.triggeredAt, nextStep.offsetHours);
    if (now < dueAt) continue;

    // Confere de novo, bem no momento de enviar, se o lead já respondeu ou
    // já tem agendamento marcado desde o último passo — normalmente isso já
    // teria cancelado o follow-up antes (ver cancelPendingFollowUp, chamada
    // assim que a resposta/o agendamento chega), mas essa segunda checagem
    // não confia cegamente nisso: cobre corrida entre o worker e o evento
    // que cancela, e qualquer forma futura de confirmar agendamento que não
    // passe por um dos pontos que já cancelam.
    const sinceRef = log.lastStepSentAt ?? log.triggeredAt;
    const leadReplied = Boolean(log.conversation.lastLeadMessageAt && log.conversation.lastLeadMessageAt > sinceRef);
    const rescheduled = log.conversation.appointments.length > 0;

    if (leadReplied || rescheduled) {
      await cancelPendingFollowUp(log.conversationId, now, rescheduled ? "SCHEDULED" : "IN_CONVERSATION");
      continue;
    }

    // O passo já venceu (dueAt <= now) — mas o envio de fato só acontece
    // dentro da janela configurada; fora dela, adia pra próxima ocorrência
    // válida em vez de disparar na hora.
    const sendAt = nextValidSendTime(now, settings.windowDays, settings.windowStartMinute, settings.windowEndMinute);

    const stepContent = nextStep.content ? applyTemplateVariables(nextStep.content, log.conversation.lead) : "";

    const messagesToCreate = [];

    // Passo WHATSAPP: canal extra de reengajamento (hoje só usado no fim da
    // sequência NO_SHOW, ver channel em FollowUpStep) — complementar às
    // mensagens por Instagram, nunca substituindo elas. Só existe se o lead
    // tiver telefone (capturado no agendamento, ver saveLeadPhone em
    // conversation-pipeline.ts); sem telefone, pula esse passo específico
    // (avança lastStepIndex normalmente) em vez de ficar reoferecendo pra
    // sempre — texto só, sem anexo (Evolution API só manda texto, ver
    // sendWhatsappMessage em src/lib/whatsapp.ts). O envio de fato acontece
    // em dispatchDueMessages (src/lib/dispatch.ts), que confere de novo se a
    // clínica tem WhatsApp conectado antes de mandar.
    if (nextStep.channel === "WHATSAPP") {
      if (stepContent && log.conversation.lead.phone) {
        messagesToCreate.push({
          conversationId: log.conversationId,
          direction: "OUTBOUND" as const,
          sender: "AI" as const,
          content: stepContent,
          status: "PENDING" as const,
          scheduledFor: sendAt,
          channel: "WHATSAPP" as const,
        });
      }
    } else {
      if (stepContent) {
        messagesToCreate.push({
          conversationId: log.conversationId,
          direction: "OUTBOUND" as const,
          sender: "AI" as const,
          content: stepContent,
          status: "PENDING" as const,
          scheduledFor: sendAt,
        });
      }
      if (nextStep.attachmentUrl) {
        messagesToCreate.push({
          conversationId: log.conversationId,
          direction: "OUTBOUND" as const,
          sender: "AI" as const,
          content: stepContent ? "[anexo]" : "",
          mediaUrl: nextStep.attachmentUrl,
          status: "PENDING" as const,
          // Se já existe uma mensagem de texto no mesmo passo, o anexo chega
          // logo em seguida, como duas mensagens separadas (limite da API do
          // Instagram: não dá pra combinar texto + anexo numa única mensagem).
          scheduledFor: stepContent ? new Date(sendAt.getTime() + 5_000) : sendAt,
        });
      }
    }

    await prisma.$transaction([
      ...messagesToCreate.map((data) => prisma.message.create({ data })),
      prisma.followUpLog.update({
        where: { id: log.id },
        // lastStepSentAt marca o momento em que o passo foi PROCESSADO (pra
        // contar o espaçamento até o próximo a partir daqui), não o horário
        // de envio real — assim o espaçamento entre passos não fica maior só
        // porque um deles teve que esperar a janela abrir.
        data: { lastStepIndex: nextIndex, lastStepSentAt: now },
      }),
    ]);
    dispatched++;
  }

  return dispatched;
}

export async function processFollowUps(): Promise<{ triggered: number; stepsDispatched: number }> {
  // Mesma proteção do try/catch por conversa dentro de processSilentConversations
  // (ver comentário grande lá pro bug real que motivou isso), só que num
  // nível acima: mesmo uma falha ANTES do loop (ex: getSettings() ou a
  // consulta de staleConversations em si) não pode impedir
  // dispatchFollowUpSteps() de rodar — ele processa NO_SHOW e qualquer log
  // SILENCE já aberto em ciclos anteriores, nenhum dos dois depende de
  // classifyConversation, então não faz sentido ficarem reféns de uma
  // falha que é específica da detecção de silêncio.
  let triggered = 0;
  let silenceCheckError: string | null = null;
  try {
    triggered = await processSilentConversations();
  } catch (err) {
    silenceCheckError = err instanceof Error ? err.message : String(err);
    console.error("[vexo:followup] ERRO em processSilentConversations (ciclo inteiro) — dispatchFollowUpSteps roda mesmo assim:", err);
  }

  // Grava o resultado deste ciclo em FollowUpSettings — sucesso limpa
  // lastSilenceCheckError (null), falha grava a mensagem — pra ficar
  // visível em /crm/dispatch-status sem precisar de acesso a log do
  // Railway (o worker é um processo separado, sem UI própria). Ver
  // comentário grande no try/catch acima e em processSilentConversations
  // pro bug real que motivou isso: até aqui, uma falha determinística
  // (ex: variável de ambiente faltando) fazia TODO ciclo falhar do mesmo
  // jeito, pra sempre, sem nenhum jeito de confirmar isso de fora.
  await prisma.followUpSettings
    .upsert({
      where: { id: "singleton" },
      update: { lastSilenceCheckAt: new Date(), lastSilenceCheckError: silenceCheckError },
      create: { id: "singleton", lastSilenceCheckAt: new Date(), lastSilenceCheckError: silenceCheckError },
    })
    .catch((err) => console.error("[vexo:followup] Falha ao gravar diagnóstico de execução:", err));

  const stepsDispatched = await dispatchFollowUpSteps();
  return { triggered, stepsDispatched };
}
