import { prisma } from "@/lib/prisma";
import { sendInstagramMessage } from "@/lib/instagram";
import { sendWhatsappMessage } from "@/lib/whatsapp";
import { toPublicUploadUrl } from "@/lib/uploads";
import {
  ATTENDANCE_VIDEO_DELAY_AFTER_INTRO_MS,
  ATTENDANCE_TIP_DELAY_AFTER_VIDEO_MS,
  ATTENDANCE_FINAL_DELAY_AFTER_TIP_MS,
  decodePendingAttendanceStep,
  encodePendingAttendanceStep,
} from "@/lib/conversation-pipeline";

// Despacha mensagens OUTBOUND com status PENDING cujo horário de envio
// (timing adaptativo) já chegou. Chamado periodicamente pelo worker.
//
// Bug real em produção: o vídeo de confirmação de agendamento (e, em tese,
// qualquer mensagem) saindo em DOBRO sem nenhuma mensagem duplicada do
// lead envolvida — nada a ver com a corrida que o conversation-lock
// (PR #30) resolve, essa é do lado do DESPACHO, não do recebimento. Causa
// raiz: o cron que chama esta função roda a cada 15s (ver
// src/worker/index.ts) SEM esperar a execução anterior terminar — um lote
// de até 50 mensagens, cada uma com uma chamada de API externa
// (Instagram/WhatsApp), facilmente passa de 15s no total. Antes desta
// correção, a query abaixo só LIA mensagens PENDING e só marcava SENT
// DEPOIS de mandar — sem nenhuma "reserva" no meio, duas execuções
// sobrepostas liam a MESMA leva (nenhuma tinha status diferente de PENDING
// ainda) e mandavam a mesma mensagem duas vezes, cada uma sem saber da
// outra.
//
// Corrigido com um "claim" atômico antes de processar: PENDING -> SENDING
// via um UPDATE condicionado em WHERE status='PENDING' só afeta a linha
// pra UMA das execuções concorrentes (a outra, rodando o mesmo UPDATE
// depois que a primeira já commitou, encontra a linha já fora de PENDING e
// afeta zero linhas) — o mesmo padrão de "fila pobre sobre banco
// relacional" que já existia pro Appointment (idempotência por
// confirmationVideoSentAt, ver conversation-pipeline.ts), só que aqui
// precisa de um estado intermediário porque o "trabalho" (a chamada de
// envio) é o que demora, não uma escrita só.
const STALE_SENDING_THRESHOLD_MS = 2 * 60 * 1000;

// Reserva mensagens presas em SENDING que passaram do threshold — só
// acontece se o processo do worker foi derrubado (deploy, crash, OOM) no
// meio de um envio, antes de conseguir marcar SENT/FAILED. Sem isso, uma
// mensagem nessas condições ficaria travada em SENDING pra sempre, nunca
// mais tentada. Um "reset" simples pra PENDING (não um claim direto) —
// deixa o claim exclusivo de verdade (abaixo) cuidar de pegá-la de volta
// no ciclo seguinte, em vez de arriscar a MESMA corrida que este código
// inteiro existe pra evitar.
async function reclaimStaleSendingMessages(): Promise<void> {
  await prisma.message.updateMany({
    where: { status: "SENDING", updatedAt: { lte: new Date(Date.now() - STALE_SENDING_THRESHOLD_MS) } },
    data: { status: "PENDING" },
  });
}

// Claim atômico e exclusivo de UMA mensagem — ver comentário grande acima.
// count === 0 significa que outra execução concorrente já reivindicou (ou
// já processou) essa mensagem; o caller deve pular sem reenviar. É esse
// mesmo claim que arbitra a corrida entre o despacho antecipado (ver
// scheduleEagerDispatch, mais abaixo) e um ciclo normal do cron processando
// a MESMA linha ao mesmo tempo — qualquer um dos dois que chegar primeiro
// aqui ganha, o outro sai sem reenviar.
async function claimMessage(messageId: string): Promise<boolean> {
  const claim = await prisma.message.updateMany({
    where: { id: messageId, status: "PENDING" },
    data: { status: "SENDING" },
  });
  return claim.count === 1;
}

async function fetchDueMessages() {
  return prisma.message.findMany({
    where: { status: "PENDING", scheduledFor: { lte: new Date() } },
    include: {
      conversation: {
        include: {
          lead: true,
          clinic: {
            include: {
              // select explícito, não `instagramAccount: true` — esse
              // último traz TODAS as colunas do model, inclusive
              // facebookPageId (String? — legado do fluxo antigo de
              // Facebook Login, não preenchido nem lido em conexão
              // nenhuma criada pelo fluxo atual; ver comentário no
              // schema). Um Prisma Client gerado a partir de uma versão
              // ANTERIOR do schema — ex: serviço "worker" que ainda não
              // fez redeploy depois da migration que tornou essa coluna
              // opcional — valida esse campo como não-nulo e quebra a
              // query INTEIRA (P2032) assim que encontra uma linha com
              // valor null, mesmo esse campo nunca sendo usado abaixo.
              // Selecionar só os dois campos realmente lidos
              // (accessTokenEnc, igUserId) evita esse tipo de
              // incompatibilidade de client-desatualizado-vs-schema-atual
              // por completo, independente de dessincronia de deploy.
              instagramAccount: { select: { accessTokenEnc: true, igUserId: true } },
            },
          },
        },
      },
    },
    orderBy: { scheduledFor: "asc" },
    take: 50,
  });
}

// Formato de uma mensagem já carregada com tudo que dispatchOneMessage
// precisa (conversa, lead, clínica, conta do Instagram) — tanto a que vem
// da leva normal (fetchDueMessages) quanto o próximo elo da cadeia de
// confirmação de presença, criado em memória (mesma conversa, então
// reaproveita a MESMA relação já carregada, sem query nova).
type DueMessage = Awaited<ReturnType<typeof fetchDueMessages>>[number];

// Delay (ms) + a própria mensagem do próximo elo da cadeia de confirmação
// de presença (vídeo/cafezinho/frase final), quando dispatchOneMessage
// acabou de criar um — null quando a mensagem processada não faz parte da
// cadeia, ou é o último elo (frase final, sem próximo).
type NextChainLink = { message: DueMessage; delayMs: number } | null;

// Agenda o despacho antecipado de UM elo da cadeia de confirmação de
// presença, sem esperar o próximo ciclo do cron (15s, ver
// src/worker/index.ts) — é o que faz o intervalo REAL entre elos bater
// perto do configurado (ATTENDANCE_VIDEO_DELAY_AFTER_INTRO_MS/
// ATTENDANCE_TIP_DELAY_AFTER_VIDEO_MS/ATTENDANCE_FINAL_DELAY_AFTER_TIP_MS,
// conversation-pipeline.ts) em vez de herdar a espera de até 15s pelo
// próximo tick, somada ao próprio delay configurado (ver investigação
// anterior: o vídeo chegava ~30s depois da apresentação pra um delay
// configurado de 10s).
//
// FORA de qualquer transação de propósito — nunca dormir com uma conexão/
// transação aberta — e disparado como fire-and-forget (não é esperado por
// quem chama, nem pelo próprio ciclo do dispatchDueMessages): o ciclo que
// acabou de criar este elo não fica bloqueado pelos 3-10s de pausa, e
// outras mensagens (de outras conversas) na mesma leva continuam sendo
// despachadas sem atraso.
//
// Robustez a crash do worker (deploy, OOM) a qualquer momento ENTRE o
// agendamento deste timer e ele disparar: a mensagem já existe como
// PENDING no banco, criada atomicamente junto da marcação SENT do elo
// anterior (dispatchOneMessage, abaixo) — exatamente como antes desta
// mudança. Se o timer nunca chegar a rodar (processo morreu), a linha
// simplesmente fica PENDING; o próximo ciclo normal do cron (até 15s
// depois) a processa pelo caminho de sempre, sem nenhum código novo
// envolvido e sem duplicar (claimMessage, acima, garante isso tanto pro
// timer quanto pro ciclo normal, incluindo os dois tentando ao mesmo
// tempo).
function scheduleEagerDispatch(message: DueMessage, delayMs: number): void {
  setTimeout(() => {
    dispatchEagerly(message).catch((err) => {
      console.error(`[vexo] Despacho antecipado da mensagem ${message.id} falhou:`, err);
    });
  }, delayMs);
}

// Chamado pelo timer agendado em scheduleEagerDispatch — nunca pelo ciclo
// normal. Confere a MESMA condição que o avanço da cadeia já confere hoje
// (NEEDS_HUMAN/LOST, ver dispatchOneMessage) mas aqui ANTES de mandar este
// elo, não só antes de criar o próximo: já que o despacho antecipado só é
// agendado pra elos da própria cadeia de confirmação de presença (nunca
// pra nenhuma outra mensagem do sistema), essa checagem não muda nada do
// comportamento normal de envio de qualquer outro tipo de mensagem. Se a
// conversa virou NEEDS_HUMAN/LOST nesse meio-tempo, não envia — a mensagem
// continua PENDING pro ciclo normal decidir (mesmo comportamento de
// qualquer outra mensagem hoje, sem regressão nem mudança de escopo).
async function dispatchEagerly(message: DueMessage): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: message.conversationId },
    select: { status: true },
  });
  if (!conversation || conversation.status === "NEEDS_HUMAN" || conversation.status === "LOST") {
    console.log(
      `[vexo] Despacho antecipado da mensagem ${message.id} suprimido — conversa ${message.conversationId} ` +
        `está ${conversation?.status ?? "inexistente"}; o ciclo normal decide o que fazer.`
    );
    return;
  }

  const outcome = await dispatchOneMessage(message);
  if (outcome.nextChainLink) {
    scheduleEagerDispatch(outcome.nextChainLink.message, outcome.nextChainLink.delayMs);
  }
}

// Processa UMA mensagem due: reivindica, envia pelo canal certo, marca
// SENT e avança a cadeia de confirmação de presença, se for o caso.
// Extraída do corpo do `for` de dispatchDueMessages pra ser reaproveitada
// também pelo despacho antecipado (dispatchEagerly, acima) — mesma lógica,
// dois chamadores.
async function dispatchOneMessage(
  message: DueMessage
): Promise<{ status: "sent" | "failed" | "skipped"; nextChainLink: NextChainLink }> {
  // TUDO dentro do try — inclusive o acesso a message.conversation.clinic
  // e o update de "sem conta conectada", que antes ficavam FORA do
  // try/catch (só a chamada de sendInstagramMessage era protegida). Uma
  // exceção não tratada aqui (relação nula por inconsistência de dados,
  // falha no próprio update, etc.) abortava o `for` inteiro de
  // dispatchDueMessages — e como due vem ordenado por scheduledFor
  // ascendente, TODA mensagem depois da que quebrou (inclusive mensagens
  // mais novas) nunca chegava a ser tentada, ciclo após ciclo, sem nenhum
  // erro visível (a exceção só aparecia no catch de fora, em runSafely no
  // worker, direto pro log do Railway — sem acesso). Isso explica uma
  // mensagem específica ficar PENDING pra sempre enquanto mensagens mais
  // antigas na mesma fila são processadas normalmente: não é a query que
  // ignora a linha, é uma exceção anterior na mesma leva que trava o resto
  // atrás dela.
  try {
    // Reivindica ANTES de mandar qualquer coisa — se outra execução
    // concorrente (cron sobreposto, ou o despacho antecipado chegando ao
    // mesmo tempo que o ciclo normal) já pegou esta mensagem, pula sem
    // reenviar. Ver comentário grande no topo do arquivo.
    if (!(await claimMessage(message.id))) return { status: "skipped", nextChainLink: null };

    // Passo WHATSAPP de follow-up (ver channel em FollowUpStep e
    // dispatchFollowUpSteps, src/lib/follow-up.ts) — mesma fila/timing
    // adaptativo, mas via Evolution API pro telefone do lead em vez da API
    // do Instagram. Confere de novo aqui (telefone e instância podem ter
    // mudado entre a criação do passo e o envio de fato) em vez de confiar
    // só na checagem já feita na criação.
    if (message.channel === "WHATSAPP") {
      const phone = message.conversation.lead.phone;
      const instanceName = message.conversation.clinic.whatsappInstanceName;
      if (!phone || !instanceName) {
        await prisma.message.update({
          where: { id: message.id },
          data: {
            status: "FAILED",
            failReason: !phone ? "Lead sem telefone cadastrado." : "Clínica sem WhatsApp conectado.",
          },
        });
        return { status: "failed", nextChainLink: null };
      }

      await sendWhatsappMessage(instanceName, phone, message.content);

      const sentAtWhatsapp = new Date();
      await prisma.$transaction([
        prisma.message.update({ where: { id: message.id }, data: { status: "SENT", sentAt: sentAtWhatsapp } }),
        prisma.conversation.update({
          where: { id: message.conversationId },
          data: {
            lastMessageAt: sentAtWhatsapp,
            ...(message.sender === "AI" ? { lastAiMessageAt: sentAtWhatsapp } : {}),
          },
        }),
      ]);
      return { status: "sent", nextChainLink: null };
    }

    const igAccount = message.conversation.clinic.instagramAccount;
    if (!igAccount) {
      await prisma.message.update({
        where: { id: message.id },
        data: { status: "FAILED", failReason: "Clínica sem conta do Instagram conectada." },
      });
      return { status: "failed", nextChainLink: null };
    }

    const result = await sendInstagramMessage({
      accessTokenEnc: igAccount.accessTokenEnc,
      igUserId: igAccount.igUserId,
      recipientIgScopedId: message.conversation.lead.igScopedId,
      text: message.mediaUrl ? undefined : message.content,
      mediaUrl: message.mediaUrl ? toPublicUploadUrl(message.mediaUrl) : undefined,
    });

    const now = new Date();

    // Diagnóstico TEMPORÁRIO (ver comentário grande em conversation-pipeline.ts,
    // junto do log "[vexo:timing]" do cálculo do delay) — fecha o ciclo:
    // mostra o horário PRETENDIDO (scheduledFor, calculado lá) contra o
    // horário REAL de envio aqui, e o atraso do próprio despacho (deveria
    // ficar sempre bem abaixo de 15s, o intervalo do cron) — separa
    // "delay calculado errado" de "delay calculado certo, mas o worker
    // demorou pra despachar".
    if (message.sender === "AI") {
      console.log(
        `[vexo:timing] mensagem ${message.id} enviada — createdAt=${message.createdAt.toISOString()} ` +
          `scheduledFor=${message.scheduledFor?.toISOString()} sentAt=${now.toISOString()} ` +
          `atrasoDoDispatch(sentAt-scheduledFor)=${message.scheduledFor ? now.getTime() - message.scheduledFor.getTime() : "n/a"}ms`
      );
    }

    // Marcar SENT + avançar a cadeia de confirmação de presença (próximo
    // elo: apresentação -> vídeo -> cafezinho -> frase final, ver
    // PendingAttendanceStep em conversation-pipeline.ts) precisam ser
    // ATÔMICOS JUNTOS, não só cada um por si — bug real que isto evita:
    // se o worker fosse derrubado (deploy, crash) ENTRE marcar SENT e
    // criar o próximo elo (quando eram duas operações separadas), a
    // mensagem ficava SENT de verdade, mas pendingAttendanceStep nunca
    // era zerado nem o próximo elo criado — a cadeia morria ali, órfã,
    // sem nenhum jeito de retomar sozinha (nada mais no sistema procura
    // "mensagens SENT com pendingAttendanceStep ainda preenchido"). Uma
    // transação interativa (callback, não a forma de array) garante que
    // as duas coisas comitam juntas ou nenhuma comita: se cair antes do
    // commit, a mensagem continua SENDING, reclaimStaleSendingMessages
    // (topo do arquivo) devolve pra PENDING depois de 2min, e o ciclo
    // seguinte reprocessa do zero — reenvia pelo Instagram (mesmo risco
    // de duplicidade que já existia pra qualquer mensagem nesse cenário,
    // nada novo) e, dessa vez, com sucesso, cria o próximo elo
    // corretamente. Nunca fica "SENT mas sem o próximo elo".
    //
    // O próximo elo continua sendo criado como PENDING aqui dentro, igual
    // antes — o despacho ANTECIPADO (scheduleEagerDispatch) só é agendado
    // DEPOIS que esta transação comita (nunca dentro dela), a partir do
    // valor devolvido abaixo. Isso preserva 100% da garantia de crash-
    // safety acima: o que muda é só QUEM tenta enviar esse próximo elo
    // primeiro (o timer antecipado, momentos depois, ou o ciclo normal,
    // até 15s depois) — nunca SE ele existe de forma durável.
    const nextChainLink = await prisma.$transaction(async (tx): Promise<NextChainLink> => {
      await tx.message.update({
        where: { id: message.id },
        data: { status: "SENT", sentAt: now, igMessageId: result.messageId },
      });
      await tx.conversation.update({
        where: { id: message.conversationId },
        data: {
          lastMessageAt: now,
          ...(message.sender === "AI" ? { lastAiMessageAt: now } : {}),
        },
      });

      if (!message.pendingAttendanceStep) return null;
      const step = decodePendingAttendanceStep(message.pendingAttendanceStep);
      if (!step) return null;

      // Claim atômico (mesmo padrão de claimMessage, no topo do arquivo)
      // garante no máximo UMA criação do próximo elo por elo atual,
      // mesmo se este bloco rodar de novo pra essa mesma Message
      // (reprocessamento) — count === 1 quer dizer que ESTA execução foi
      // quem zerou o campo, nenhuma outra.
      const stepClaim = await tx.message.updateMany({
        where: { id: message.id, pendingAttendanceStep: { not: null } },
        data: { pendingAttendanceStep: null },
      });
      if (stepClaim.count !== 1) return null;

      // Status ATUAL da conversa, não o snapshot carregado no topo da
      // função — pode ter virado NEEDS_HUMAN/LOST enquanto este elo
      // esperava a vez no lote (due é uma leva de até 50 mensagens). Vale
      // pra TODOS os elos (vídeo, cafezinho e frase final), não só a
      // última.
      const conversation = await tx.conversation.findUnique({
        where: { id: message.conversationId },
        select: { status: true },
      });
      if (!conversation || conversation.status === "NEEDS_HUMAN" || conversation.status === "LOST") return null;

      if (step.next === "video") {
        const created = await tx.message.create({
          data: {
            conversationId: message.conversationId,
            direction: "OUTBOUND",
            sender: "SYSTEM",
            content: "[vídeo de confirmação de agendamento]",
            mediaUrl: step.mediaUrl,
            status: "PENDING",
            scheduledFor: new Date(now.getTime() + ATTENDANCE_VIDEO_DELAY_AFTER_INTRO_MS),
            pendingAttendanceStep: encodePendingAttendanceStep({
              next: "tip",
              tipText: step.tipText,
              finalText: step.finalText,
              appointmentId: step.appointmentId,
              scheduledAtMs: step.scheduledAtMs,
            }),
          },
        });
        // Reaproveita a relação já carregada (mesma conversa) em vez de
        // uma query/include nova — lead/clínica/conta do Instagram não
        // mudam entre um elo e o próximo.
        return { message: { ...created, conversation: message.conversation }, delayMs: ATTENDANCE_VIDEO_DELAY_AFTER_INTRO_MS };
      }

      if (step.next === "tip") {
        const created = await tx.message.create({
          data: {
            conversationId: message.conversationId,
            direction: "OUTBOUND",
            sender: "SYSTEM",
            content: step.tipText,
            status: "PENDING",
            scheduledFor: new Date(now.getTime() + ATTENDANCE_TIP_DELAY_AFTER_VIDEO_MS),
            pendingAttendanceStep: encodePendingAttendanceStep({
              next: "final",
              finalText: step.finalText,
              appointmentId: step.appointmentId,
              scheduledAtMs: step.scheduledAtMs,
            }),
          },
        });
        return { message: { ...created, conversation: message.conversation }, delayMs: ATTENDANCE_TIP_DELAY_AFTER_VIDEO_MS };
      }

      // step.next === "final" — último elo: confere, além da conversa
      // (já feito acima), que o agendamento ainda existe, continua
      // SCHEDULED/CONFIRMED (não foi cancelado) e que o horário não
      // mudou desde que a apresentação foi criada (scheduledAtMs,
      // capturado em fireAttendanceConfirmationSequence) — remarcado
      // nesse meio-tempo faria "até [dia]" sair com o dia errado, então
      // a frase final simplesmente não é criada nesse caso.
      const appointment = await tx.appointment.findUnique({
        where: { id: step.appointmentId },
        select: { status: true, scheduledAt: true },
      });
      if (!appointment) return null;
      if (appointment.status !== "SCHEDULED" && appointment.status !== "CONFIRMED") return null;
      if (appointment.scheduledAt.getTime() !== step.scheduledAtMs) return null;

      const created = await tx.message.create({
        data: {
          conversationId: message.conversationId,
          direction: "OUTBOUND",
          sender: "SYSTEM",
          content: step.finalText,
          status: "PENDING",
          scheduledFor: new Date(now.getTime() + ATTENDANCE_FINAL_DELAY_AFTER_TIP_MS),
        },
      });
      // Último elo — sem pendingAttendanceStep, então nada mais a
      // despachar antecipadamente depois deste.
      return { message: { ...created, conversation: message.conversation }, delayMs: ATTENDANCE_FINAL_DELAY_AFTER_TIP_MS };
    });

    return { status: "sent", nextChainLink };
  } catch (err) {
    const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    console.error(`[vexo] Falha ao processar mensagem ${message.id}:`, err);
    // Elo falhou — o próximo elo da cadeia de confirmação de presença
    // (vídeo/cafezinho/frase final) nunca é criado (nem o claim roda, já
    // que essa parte do código só é alcançada em sucesso). Sem campo
    // novo pra marcar isso, só log — útil pra auditar manualmente um caso
    // de elo que falhou e não gerou o próximo.
    if (message.pendingAttendanceStep) {
      console.log(
        `[vexo] Elo da sequência de confirmação de presença falhou — o próximo elo nunca será criado (conversa ${message.conversationId}, mensagem ${message.id}).`
      );
    }
    // Catch própria pro update em si — se ATÉ marcar como FAILED falhar,
    // não deixa isso também virar uma exceção não tratada que travaria o
    // resto da fila de novo, exatamente o bug que essa mudança corrige.
    await prisma.message
      .update({ where: { id: message.id }, data: { status: "FAILED", failReason: detail.slice(0, 2000) } })
      .catch((updateErr) => console.error(`[vexo] Falha ao marcar mensagem ${message.id} como FAILED:`, updateErr));
    return { status: "failed", nextChainLink: null };
  }
}

export async function dispatchDueMessages(): Promise<{ sent: number; failed: number }> {
  await reclaimStaleSendingMessages();

  const due = await fetchDueMessages();

  let sent = 0;
  let failed = 0;

  for (const message of due) {
    const outcome = await dispatchOneMessage(message);
    if (outcome.status === "sent") sent++;
    else if (outcome.status === "failed") failed++;

    // Agenda o próximo elo da cadeia (se houver) pra ser despachado
    // antecipadamente, sem esperar pelo próximo ciclo — ver comentário
    // grande em scheduleEagerDispatch. Depois do claim/envio/commit desta
    // mensagem, nunca bloqueia o resto do `for` (fire-and-forget).
    if (outcome.nextChainLink) {
      scheduleEagerDispatch(outcome.nextChainLink.message, outcome.nextChainLink.delayMs);
    }
  }

  return { sent, failed };
}
