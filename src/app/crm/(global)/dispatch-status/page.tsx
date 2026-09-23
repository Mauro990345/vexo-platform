import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { LocalDateTime } from "@/components/LocalDateTime";
import { getSilenceHours } from "@/lib/follow-up";
import { closeStuckFollowUpLogAction } from "./actions";

export const dynamic = "force-dynamic";

// Diagnóstico temporário (sem acesso a logs do Railway): dispatchDueMessages
// (src/lib/dispatch.ts) roda num processo separado — o worker (serviço
// próprio no Railway, ver README > Deploy) — não dentro do processo web.
// Se esse serviço não existir, estiver com o start command errado, ou
// tiver caído, TODA mensagem da IA fica presa em PENDING pra sempre: ela
// aparece salva normalmente na tela da conversa (rótulo "· agendada"),
// mas nunca sai de fato pro Instagram, sem nenhum erro em lugar nenhum —
// dispatchDueMessages nem chega a rodar pra tentar e falhar. Essa página
// dá pra confirmar isso pela própria interface do VEXO: mensagem PENDING
// com scheduledFor bem no passado é sinal direto de worker parado (ele
// roda a cada 15s; passar disso por uma margem confortável não é
// atraso normal, é o processo não estar rodando).
const STUCK_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutos de folga sobre o ciclo de 15s do worker

// processFollowUps (que decide se abre um FollowUpLog de SILENCE) roda a
// cada 30min (ver worker/index.ts) — folga generosa sobre isso pra não
// marcar como "atrasado" uma conversa que só ainda não teve seu primeiro
// ciclo desde que ficou silenciosa.
const FOLLOWUP_CHECK_CYCLE_MS = 30 * 60 * 1000;
const FOLLOWUP_OVERDUE_THRESHOLD_MS = FOLLOWUP_CHECK_CYCLE_MS + 10 * 60 * 1000;

export default async function DispatchStatusPage() {
  await requireInternalSession();

  const now = new Date();
  const silenceHours = await getSilenceHours();
  const silenceThreshold = new Date(now.getTime() - silenceHours * 60 * 60 * 1000);

  const [
    stuckPending,
    recentFailed,
    staleWithoutFollowUp,
    openFollowUpLogs,
    silenceStepsCount,
    noShowStepsCount,
    followUpSettings,
  ] = await Promise.all([
    prisma.message.findMany({
      where: { status: "PENDING", scheduledFor: { lt: new Date(now.getTime() - STUCK_THRESHOLD_MS) } },
      include: { conversation: { include: { lead: true, clinic: true } } },
      orderBy: { scheduledFor: "asc" },
      take: 50,
    }),
    prisma.message.findMany({
      where: { status: "FAILED" },
      include: { conversation: { include: { lead: true, clinic: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    // Bug real reportado: follow-up SILENCE configurado, 2h+ de silêncio
    // depois, nada em "pendente" nem "falha" acima — porque as duas seções
    // só olham Message já criada, e o gatilho SILENCE (processSilentConversations,
    // follow-up.ts) só cria uma Message DEPOIS de um FollowUpLog existir, que
    // por sua vez só existe se o classificador (Haiku, ver classifyConversation)
    // decidir que faz sentido reengajar aquela conversa especificamente — uma
    // decisão que, até esta correção, não deixava rastro NENHUM quando dizia
    // "não". Esta seção lista todo mundo que JÁ bate o critério de silêncio
    // (mesmos silenceHours configurados em Automações) mas ainda não tem
    // nenhum FollowUpLog aberto — o mesmo dado que processSilentConversations
    // usa pra decidir, mas visível aqui sem precisar de acesso a log nenhum.
    prisma.conversation.findMany({
      where: {
        status: "IN_CONVERSATION",
        lastLeadMessageAt: { lt: silenceThreshold },
        followUps: { none: { respondedAt: null } },
      },
      include: { lead: true, clinic: true },
      orderBy: { lastLeadMessageAt: "asc" },
      take: 50,
    }),
    // Bug real encontrado NESTA investigação (confirmado com deploy já
    // atualizado, então não era mais hipótese de cache/deploy antigo): a
    // seção acima só pega conversas SEM nenhum FollowUpLog aberto — mas
    // um log pode ficar aberto (respondedAt: null) mesmo sem nenhum
    // follow-up de verdade acontecendo, se: (a) a Conversation.status foi
    // trocada manualmente por fora (setConversationStatus, "Devolver para
    // a IA" ou "Marcar como perdido" — corrigido nesta mesma correção pra
    // fechar o log junto, mas isso só previne casos NOVOS, não resolve um
    // log que já ficou órfão antes dessa correção existir) sem nunca
    // fechar o log que ficou pra trás — dispatchFollowUpSteps exige
    // Conversation.status = "FOLLOW_UP" pra processar um log, então um
    // log "aberto" com a conversa em outro status fica travado pra
    // sempre, invisível em todo lugar; ou (b) o trigger daquele log não
    // tem NENHUM FollowUpStep cadastrado ainda em /crm/follow-up —
    // dispatchFollowUpSteps não tem passo nenhum pra avançar, então nunca
    // cria mensagem nenhuma, também pra sempre. Esta seção lista TODO
    // FollowUpLog aberto agora, sem filtro de status, com um botão pra
    // fechar manualmente os que estiverem travados.
    prisma.followUpLog.findMany({
      where: { respondedAt: null },
      include: { conversation: { include: { lead: true, clinic: true } } },
      orderBy: { triggeredAt: "asc" },
      take: 50,
    }),
    prisma.followUpStep.count({ where: { trigger: "SILENCE" } }),
    prisma.followUpStep.count({ where: { trigger: "NO_SHOW" } }),
    // Bug real em produção: FollowUpLog SEMPRE vazia, mesmo com conversas
    // claramente elegíveis (silenceHours ultrapassado há horas, janela de
    // envio liberada) — o sistema nunca sequer tentava disparar. Causa
    // raiz encontrada em processSilentConversations (follow-up.ts): uma
    // exceção em UMA conversa (ex: provider de LLM mal configurado —
    // candidato concreto, OPENROUTER_API_KEY faltando no serviço WORKER
    // especificamente, depois da troca de LLM_PROVIDER pra "openrouter")
    // abortava o ciclo INTEIRO em silêncio, sem nenhum rastro visível fora
    // do console do worker — um processo separado, sem UI própria. Agora
    // cada ciclo de processFollowUps grava aqui se deu certo ou qual foi o
    // erro, visível abaixo sem precisar de acesso a log do Railway.
    prisma.followUpSettings.findUnique({ where: { id: "singleton" } }),
  ]);

  // Diagnóstico de deploy: bug real relatado — uma seção nova desta MESMA
  // página (a de baixo, "conversas silenciosas sem follow-up") não
  // aparecia em produção mesmo depois de "Deploy latest commit" + migração
  // rodando + Active confirmados no Railway, e mesmo com Ctrl+Shift+R.
  // Investigação (nesta sessão, sem acesso ao Railway): o código está
  // correto no branch main, um build de produção local a partir do MESMO
  // commit compila sem erro nenhum, e uma falha de verdade na consulta
  // dessa seção (Promise.all) derrubaria a página INTEIRA — não deixaria
  // as outras duas seções renderizando normais. Tudo isso aponta pra o
  // processo web servindo essas requisições não estar rodando o commit
  // que a tela do Railway mostra como "Active" (serviço errado, ambiente
  // errado, ou o dashboard mostrando o deploy anterior). Em vez de seguir
  // adivinhando às cegas, estas variáveis abaixo são injetadas pelo
  // próprio Railway automaticamente em TODO serviço, sem nenhuma
  // configuração — mostram exatamente o commit/serviço/ambiente que está
  // rodando ESTE código agora, então dá pra confirmar (ou descartar) a
  // hipótese de deploy direto aqui, sem depender do dashboard.
  const deployFingerprint = {
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    service: process.env.RAILWAY_SERVICE_NAME ?? null,
    environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? null,
    deploymentId: process.env.RAILWAY_DEPLOYMENT_ID ?? null,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Envio de mensagens (diagnóstico)</h1>
          <p className="mt-0.5 text-xs text-vexo-muted">
            dispatchDueMessages roda no processo separado do worker, não no processo web — ver README
            &gt; Deploy (Railway). Ferramenta de diagnóstico temporária.
          </p>
        </div>
        <Link href="/crm/webhook-logs" className="shrink-0 whitespace-nowrap text-card text-vexo-muted underline hover:text-vexo-fg">
          Logs do webhook (Instagram)
        </Link>
      </div>

      <p className="rounded-lg border border-vexo-border bg-vexo-surface p-2 font-mono text-[11px] text-vexo-muted">
        deploy: commit=<strong className="text-vexo-fg">{deployFingerprint.commit ?? "?"}</strong> ·{" "}
        serviço=<strong className="text-vexo-fg">{deployFingerprint.service ?? "?"}</strong> ·{" "}
        ambiente=<strong className="text-vexo-fg">{deployFingerprint.environment ?? "?"}</strong> ·{" "}
        deploymentId=<strong className="text-vexo-fg">{deployFingerprint.deploymentId ?? "?"}</strong> ·{" "}
        servidor em <LocalDateTime iso={now.toISOString()} />
        {!deployFingerprint.commit && (
          <span className="block text-vexo-warning">
            (nenhuma variável RAILWAY_* encontrada — normal em ambiente local; se aparecer assim em produção,
            confirme que este processo está mesmo rodando no Railway.)
          </span>
        )}
      </p>

      {/* Diagnóstico do WORKER, não do processo web que renderiza esta
          página — os dois são serviços separados no Railway, com env vars
          independentes (ex.: LLM_PROVIDER/OPENROUTER_API_KEY podem estar
          configurados num e não no outro). Gravado a cada ciclo de
          processFollowUps (a cada 30min) direto em FollowUpSettings — ver
          comentário grande na consulta acima pro bug real que motivou
          isso: uma falha determinística aqui (ex: variável de ambiente
          faltando) fazia o gatilho SILENCE nunca disparar, sem nenhum
          jeito de confirmar isso sem acesso a log do Railway. */}
      {followUpSettings?.lastSilenceCheckError ? (
        <div className="space-y-1 rounded-lg border border-vexo-error/30 bg-vexo-error/10 p-2 text-xs text-vexo-error">
          <p className="font-medium">
            O último ciclo do worker (processFollowUps) falhou — o gatilho de silêncio (SILENCE) não está
            funcionando até isso ser corrigido.
          </p>
          <p>
            Último ciclo: <LocalDateTime iso={followUpSettings.lastSilenceCheckAt!.toISOString()} />
          </p>
          <p className="font-mono">{followUpSettings.lastSilenceCheckError}</p>
        </div>
      ) : followUpSettings?.lastSilenceCheckAt ? (
        <p className="rounded-lg border border-vexo-success/30 bg-vexo-success/10 p-2 text-xs text-vexo-success">
          Último ciclo do worker (processFollowUps) rodou sem erro em{" "}
          <LocalDateTime iso={followUpSettings.lastSilenceCheckAt.toISOString()} />.
        </p>
      ) : (
        <p className="rounded-lg border border-vexo-warning/30 bg-vexo-warning/10 p-2 text-xs text-vexo-warning">
          O worker ainda não registrou nenhuma execução do gatilho de silêncio — normal logo após um deploy
          novo (roda a cada 30min); se continuar assim por mais tempo que isso, o worker pode não estar
          rodando (ver seção &quot;Mensagens presas em pendente&quot; abaixo).
        </p>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Mensagens presas em &quot;pendente&quot; ({stuckPending.length})
        </h2>
        {stuckPending.length === 0 ? (
          <p className="rounded-lg border border-vexo-success/30 bg-vexo-success/10 p-2 text-xs text-vexo-success">
            Nenhuma — o worker parece estar processando normalmente.
          </p>
        ) : (
          <>
            <p className="rounded-lg border border-vexo-error/30 bg-vexo-error/10 p-2 text-xs text-vexo-error">
              O worker roda dispatchDueMessages a cada 15s — uma mensagem PENDING com horário de envio
              há mais de 2 minutos é sinal de que o serviço <strong>worker</strong> não está rodando no
              Railway (não existe, start command errado, ou caiu), não de lentidão normal. Confira se
              esse serviço existe e está com o start command <code>npm run prisma:generate &amp;&amp;
              npm run worker</code> (ver README). Enquanto ele não rodar, nenhuma mensagem da IA sai de
              verdade pro Instagram — e lembretes, follow-up e resumo semanal também ficam parados,
              já que rodam no mesmo processo.
            </p>
            <div className="space-y-2">
              {stuckPending.map((m) => (
                <div key={m.id} className="rounded-xl border border-vexo-border bg-vexo-surface p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2 text-vexo-muted">
                    <span className="font-medium text-vexo-fg">{m.conversation.clinic.name}</span>
                    <span>·</span>
                    <span>{m.conversation.lead.name ?? m.conversation.lead.igUsername ?? "lead sem nome"}</span>
                    <span>·</span>
                    <span>
                      agendada pra <LocalDateTime iso={m.scheduledFor!.toISOString()} />
                    </span>
                    <Link href={`/crm/conversas/${m.conversationId}`} className="ml-auto underline hover:text-vexo-fg">
                      Ver conversa
                    </Link>
                  </div>
                  <p className="mt-1.5 text-vexo-fg">{m.content}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Mensagens que falharam ao enviar ({recentFailed.length})</h2>
        {recentFailed.length === 0 ? (
          <p className="rounded-lg border border-vexo-border bg-vexo-surface p-3 text-xs text-vexo-muted">
            Nenhuma mensagem marcada como falha.
          </p>
        ) : (
          <div className="space-y-2">
            {recentFailed.map((m) => (
              <div key={m.id} className="rounded-xl border border-vexo-border bg-vexo-surface p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-vexo-muted">
                  <span className="font-medium text-vexo-fg">{m.conversation.clinic.name}</span>
                  <span>·</span>
                  <span>{m.conversation.lead.name ?? m.conversation.lead.igUsername ?? "lead sem nome"}</span>
                  <span>·</span>
                  <span>
                    criada em <LocalDateTime iso={m.createdAt.toISOString()} />
                  </span>
                  <Link href={`/crm/conversas/${m.conversationId}`} className="ml-auto underline hover:text-vexo-fg">
                    Ver conversa
                  </Link>
                </div>
                <p className="mt-1.5 text-vexo-fg">{m.content}</p>
                {m.failReason && (
                  <p className="mt-1.5 rounded-lg border border-vexo-error/30 bg-vexo-error/10 p-2 text-vexo-error">
                    {m.failReason}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Conversas silenciosas sem follow-up disparado ainda ({staleWithoutFollowUp.length})
        </h2>
        <p className="text-xs text-vexo-muted">
          Já passaram do limiar de silêncio configurado ({silenceHours}h, ver Automações) mas ainda não têm
          nenhum FollowUpLog aberto. Isso é esperado por até ~40min depois de virar elegível (o worker só
          confere a cada 30min) — mas se uma conversa continuar aparecendo aqui por muito mais tempo que isso,
          o classificador (Haiku) provavelmente já avaliou e decidiu NÃO reengajar (ex: parece uma recusa
          explícita ou conclusão natural) — confira o histórico da conversa pra confirmar se faz sentido, ou
          use o log <code>[vexo:followup]</code> se tiver acesso aos logs do Railway.
        </p>
        {staleWithoutFollowUp.length === 0 ? (
          <p className="rounded-lg border border-vexo-success/30 bg-vexo-success/10 p-2 text-xs text-vexo-success">
            Nenhuma — todo mundo elegível já tem follow-up em andamento (ou ainda não passou do primeiro
            ciclo do worker).
          </p>
        ) : (
          <div className="space-y-2">
            {staleWithoutFollowUp.map((conv) => {
              const eligibleSince = new Date(conv.lastLeadMessageAt!.getTime() + silenceHours * 60 * 60 * 1000);
              const overdue = now.getTime() - eligibleSince.getTime() > FOLLOWUP_OVERDUE_THRESHOLD_MS;
              return (
                <div key={conv.id} className="rounded-xl border border-vexo-border bg-vexo-surface p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2 text-vexo-muted">
                    <span className="font-medium text-vexo-fg">{conv.clinic.name}</span>
                    <span>·</span>
                    <span>{conv.lead.name ?? conv.lead.igUsername ?? "lead sem nome"}</span>
                    <span>·</span>
                    <span>
                      última mensagem do lead em <LocalDateTime iso={conv.lastLeadMessageAt!.toISOString()} />
                    </span>
                    <Link href={`/crm/conversas/${conv.id}`} className="ml-auto underline hover:text-vexo-fg">
                      Ver conversa
                    </Link>
                  </div>
                  {overdue && (
                    <p className="mt-1.5 rounded-lg border border-vexo-warning/30 bg-vexo-warning/10 p-2 text-vexo-warning">
                      Elegível há mais tempo que um ciclo do worker (30min) — provavelmente já foi avaliada e
                      recusada pelo classificador, não é só atraso do próximo ciclo.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">FollowUpLogs abertos agora, qualquer status ({openFollowUpLogs.length})</h2>
        <p className="text-xs text-vexo-muted">
          Todo follow-up em andamento (respondedAt ainda vazio), sem filtrar por status da conversa — ao
          contrário da seção acima, que só pega quem NÃO tem log nenhum. Um log aparece "travado" aqui se a
          conversa não está em "FOLLOW_UP" (ficou órfão de uma troca de status manual antiga) ou se o
          trigger dele não tem nenhum passo cadastrado em /crm/follow-up.
        </p>
        {openFollowUpLogs.length === 0 ? (
          <p className="rounded-lg border border-vexo-success/30 bg-vexo-success/10 p-2 text-xs text-vexo-success">
            Nenhum — nenhum follow-up em andamento no momento.
          </p>
        ) : (
          <div className="space-y-2">
            {openFollowUpLogs.map((log) => {
              const stepsConfigured = log.trigger === "NO_SHOW" ? noShowStepsCount : silenceStepsCount;
              const nextIndex = (log.lastStepIndex ?? -1) + 1;
              const noStepsConfigured = stepsConfigured === 0;
              const statusMismatch = log.conversation.status !== "FOLLOW_UP";
              const stuck = statusMismatch || noStepsConfigured;
              return (
                <div key={log.id} className="rounded-xl border border-vexo-border bg-vexo-surface p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2 text-vexo-muted">
                    <span className="font-medium text-vexo-fg">{log.conversation.clinic.name}</span>
                    <span>·</span>
                    <span>{log.conversation.lead.name ?? log.conversation.lead.igUsername ?? "lead sem nome"}</span>
                    <span>·</span>
                    <span>trigger={log.trigger}</span>
                    <span>·</span>
                    <span>status da conversa={log.conversation.status}</span>
                    <span>·</span>
                    <span>passo {nextIndex + 1} de {stepsConfigured || "0 cadastrados"}</span>
                    <span>·</span>
                    <span>
                      aberto em <LocalDateTime iso={log.triggeredAt.toISOString()} />
                    </span>
                    <Link href={`/crm/conversas/${log.conversationId}`} className="ml-auto underline hover:text-vexo-fg">
                      Ver conversa
                    </Link>
                  </div>
                  {stuck && (
                    <div className="mt-1.5 space-y-1.5 rounded-lg border border-vexo-warning/30 bg-vexo-warning/10 p-2 text-vexo-warning">
                      <p>
                        {statusMismatch &&
                          `Travado: a conversa não está mais em "FOLLOW_UP" (está em "${log.conversation.status}") — dispatchFollowUpSteps exige esse status pra avançar, então este log nunca mais processa sozinho. `}
                        {noStepsConfigured &&
                          `Travado: nenhum passo cadastrado pro trigger ${log.trigger} em /crm/follow-up — sem passo nenhum, nunca cria mensagem.`}
                      </p>
                      <form action={closeStuckFollowUpLogAction.bind(null, log.conversationId)}>
                        <button className="rounded-lg border border-vexo-warning/40 px-2 py-1 font-medium text-vexo-warning hover:bg-vexo-warning/10">
                          Fechar follow-up preso
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
