import { prisma } from "@/lib/prisma";
import { sendInstagramMessage } from "@/lib/instagram";
import { sendWhatsappMessage } from "@/lib/whatsapp";
import { toPublicUploadUrl } from "@/lib/uploads";

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
// já processou) essa mensagem; o caller deve pular sem reenviar.
async function claimMessage(messageId: string): Promise<boolean> {
  const claim = await prisma.message.updateMany({
    where: { id: messageId, status: "PENDING" },
    data: { status: "SENDING" },
  });
  return claim.count === 1;
}

export async function dispatchDueMessages(): Promise<{ sent: number; failed: number }> {
  await reclaimStaleSendingMessages();

  const due = await prisma.message.findMany({
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

  let sent = 0;
  let failed = 0;

  for (const message of due) {
    // TUDO dentro do try — inclusive o acesso a message.conversation.clinic
    // e o update de "sem conta conectada", que antes ficavam FORA do
    // try/catch (só a chamada de sendInstagramMessage era protegida). Uma
    // exceção não tratada aqui (relação nula por inconsistência de dados,
    // falha no próprio update, etc.) abortava o `for` inteiro — e como
    // `due` vem ordenado por scheduledFor ascendente, TODA mensagem depois
    // da que quebrou (inclusive mensagens mais novas) nunca chegava a ser
    // tentada, ciclo após ciclo, sem nenhum erro visível (a exceção só
    // aparecia no catch de fora, em runSafely no worker, direto pro log do
    // Railway — sem acesso). Isso explica uma mensagem específica ficar
    // PENDING pra sempre enquanto mensagens mais antigas na mesma fila são
    // processadas normalmente: não é a query que ignora a linha, é uma
    // exceção anterior na mesma leva que trava o resto atrás dela.
    try {
      // Reivindica ANTES de mandar qualquer coisa — se outra execução
      // concorrente (cron sobreposto) já pegou esta mensagem, pula sem
      // reenviar. Ver comentário grande no topo do arquivo.
      if (!(await claimMessage(message.id))) continue;

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
          failed++;
          continue;
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
        sent++;
        continue;
      }

      const igAccount = message.conversation.clinic.instagramAccount;
      if (!igAccount) {
        await prisma.message.update({
          where: { id: message.id },
          data: { status: "FAILED", failReason: "Clínica sem conta do Instagram conectada." },
        });
        failed++;
        continue;
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

      await prisma.$transaction([
        prisma.message.update({
          where: { id: message.id },
          data: { status: "SENT", sentAt: now, igMessageId: result.messageId },
        }),
        prisma.conversation.update({
          where: { id: message.conversationId },
          data: {
            lastMessageAt: now,
            ...(message.sender === "AI" ? { lastAiMessageAt: now } : {}),
          },
        }),
      ]);
      sent++;
    } catch (err) {
      const detail = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      failed++;
      console.error(`[vexo] Falha ao processar mensagem ${message.id}:`, err);
      // Catch própria pro update em si — se ATÉ marcar como FAILED falhar,
      // não deixa isso também virar uma exceção não tratada que travaria o
      // resto da fila de novo, exatamente o bug que essa mudança corrige.
      await prisma.message
        .update({ where: { id: message.id }, data: { status: "FAILED", failReason: detail.slice(0, 2000) } })
        .catch((updateErr) => console.error(`[vexo] Falha ao marcar mensagem ${message.id} como FAILED:`, updateErr));
    }
  }

  return { sent, failed };
}
