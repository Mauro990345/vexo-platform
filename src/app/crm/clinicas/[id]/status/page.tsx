import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { getSilenceHours } from "@/lib/follow-up";
import { LocalDateTime } from "@/components/LocalDateTime";
import { closeStuckFollowUpLogForClinicAction } from "@/app/crm/(global)/dispatch-status/actions";

export const dynamic = "force-dynamic";

const STUCK_THRESHOLD_MS = 2 * 60 * 1000; // mesmo threshold de dispatch-status/page.tsx

// Aba "Status" de uma clínica — reúne, filtrado só pra ela, o que antes só
// dava pra ver por link direto e sem filtro nenhum (/crm/webhook-logs e
// /crm/dispatch-status, que continuam existindo pra ver TODAS as clínicas
// juntas — ver link no fim desta página). Substitui "Configurações" no
// mesmo lugar da sidebar (tema/aparência do sistema, sem uso — ver
// clinic-nav.tsx).
//
// "Envio de mensagens": as mesmas 4 seções de dispatch-status/page.tsx,
// filtradas por conversation.clinicId (Message e FollowUpLog não têm
// clinicId próprio, só via Conversation) — mesmas queries, mesmo
// threshold, só que pra uma clínica só, sem precisar procurar o card certo
// numa lista com todas.
//
// "Logs do webhook (Instagram)": WebhookLog NÃO tem clinicId (a linha é
// gravada ANTES do evento ser associado a uma conta — inclui até
// assinatura inválida, que nunca chega a identificar clínica nenhuma) —
// filtra por um heurístico (rawBody contém o igUserId desta clínica), já
// que entry.id/recipient.id do payload real da Meta sempre inclui esse
// número (ver route.ts). Sem Instagram conectado, não tem o que filtrar —
// mostra aviso em vez de tentar advinhar.
export default async function ClinicStatusPage({ params }: { params: { id: string } }) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    select: { id: true, instagramAccount: { select: { igUserId: true } } },
  });
  if (!clinic) notFound();

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
    webhookLogs,
  ] = await Promise.all([
    prisma.message.findMany({
      where: {
        status: "PENDING",
        scheduledFor: { lt: new Date(now.getTime() - STUCK_THRESHOLD_MS) },
        conversation: { clinicId: clinic.id },
      },
      include: { conversation: { include: { lead: true } } },
      orderBy: { scheduledFor: "asc" },
      take: 50,
    }),
    prisma.message.findMany({
      where: { status: "FAILED", conversation: { clinicId: clinic.id } },
      include: { conversation: { include: { lead: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.conversation.findMany({
      where: {
        clinicId: clinic.id,
        status: "IN_CONVERSATION",
        lastLeadMessageAt: { lt: silenceThreshold },
        followUps: { none: { respondedAt: null } },
      },
      include: { lead: true },
      orderBy: { lastLeadMessageAt: "asc" },
      take: 50,
    }),
    prisma.followUpLog.findMany({
      where: { respondedAt: null, conversation: { clinicId: clinic.id } },
      include: { conversation: { include: { lead: true } } },
      orderBy: { triggeredAt: "asc" },
      take: 50,
    }),
    prisma.followUpStep.count({ where: { trigger: "SILENCE" } }),
    prisma.followUpStep.count({ where: { trigger: "NO_SHOW" } }),
    prisma.followUpSettings.findUnique({ where: { id: "singleton" } }),
    clinic.instagramAccount
      ? prisma.webhookLog.findMany({
          where: { rawBody: { contains: clinic.instagramAccount.igUserId } },
          orderBy: { receivedAt: "desc" },
          take: 50,
        })
      : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Status</h1>
          <p className="mt-0.5 text-xs text-vexo-muted">
            Saúde do sistema pra esta clínica — envio de mensagens e webhook do Instagram. Ferramenta
            de diagnóstico temporária (sem acesso a logs do Railway).
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right text-card text-vexo-muted">
          <Link href="/crm/webhook-logs" className="whitespace-nowrap underline hover:text-vexo-fg">
            Logs do webhook (todas as clínicas)
          </Link>
          <Link href="/crm/dispatch-status" className="whitespace-nowrap underline hover:text-vexo-fg">
            Envio de mensagens (todas as clínicas)
          </Link>
        </div>
      </div>

      {/* Diagnóstico do WORKER (processo separado do web, ver README > Deploy)
          — global, não filtra por clínica: um ciclo falhando afeta o
          gatilho SILENCE de TODAS as clínicas, incluindo esta. */}
      {followUpSettings?.lastSilenceCheckError ? (
        <div className="space-y-1 rounded-lg border border-vexo-error/30 bg-vexo-error/10 p-2 text-xs text-vexo-error">
          <p className="font-medium">
            O último ciclo do worker (processFollowUps) falhou — o gatilho de silêncio (SILENCE) não está
            funcionando pra nenhuma clínica até isso ser corrigido.
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
          rodando.
        </p>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Envio de mensagens</h2>

        <div className="space-y-2">
          <h3 className="text-card font-medium text-vexo-fg">
            Presas em &quot;pendente&quot; ({stuckPending.length})
          </h3>
          {stuckPending.length === 0 ? (
            <p className="rounded-lg border border-vexo-success/30 bg-vexo-success/10 p-2 text-xs text-vexo-success">
              Nenhuma — o worker parece estar processando normalmente.
            </p>
          ) : (
            <>
              <p className="rounded-lg border border-vexo-error/30 bg-vexo-error/10 p-2 text-xs text-vexo-error">
                O worker roda dispatchDueMessages a cada 15s — uma mensagem PENDING com horário de envio
                há mais de 2 minutos é sinal de que o serviço <strong>worker</strong> não está rodando no
                Railway, não de lentidão normal.
              </p>
              <div className="space-y-2">
                {stuckPending.map((m) => (
                  <div key={m.id} className="rounded-xl border border-vexo-border bg-vexo-surface p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2 text-vexo-muted">
                      <span className="font-medium text-vexo-fg">
                        {m.conversation.lead.name ?? m.conversation.lead.igUsername ?? "lead sem nome"}
                      </span>
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
        </div>

        <div className="space-y-2">
          <h3 className="text-card font-medium text-vexo-fg">Falharam ao enviar ({recentFailed.length})</h3>
          {recentFailed.length === 0 ? (
            <p className="rounded-lg border border-vexo-border bg-vexo-surface p-3 text-xs text-vexo-muted">
              Nenhuma mensagem marcada como falha.
            </p>
          ) : (
            <div className="space-y-2">
              {recentFailed.map((m) => (
                <div key={m.id} className="rounded-xl border border-vexo-border bg-vexo-surface p-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2 text-vexo-muted">
                    <span className="font-medium text-vexo-fg">
                      {m.conversation.lead.name ?? m.conversation.lead.igUsername ?? "lead sem nome"}
                    </span>
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
        </div>

        <div className="space-y-2">
          <h3 className="text-card font-medium text-vexo-fg">
            Silenciosas sem follow-up disparado ainda ({staleWithoutFollowUp.length})
          </h3>
          {staleWithoutFollowUp.length === 0 ? (
            <p className="rounded-lg border border-vexo-success/30 bg-vexo-success/10 p-2 text-xs text-vexo-success">
              Nenhuma — todo mundo elegível já tem follow-up em andamento (ou ainda não passou do primeiro
              ciclo do worker).
            </p>
          ) : (
            <div className="space-y-2">
              {staleWithoutFollowUp.map((conv) => {
                const isParseError = conv.lastSilenceCheckReason?.startsWith("[ERRO");
                return (
                  <div key={conv.id} className="rounded-xl border border-vexo-border bg-vexo-surface p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2 text-vexo-muted">
                      <span className="font-medium text-vexo-fg">
                        {conv.lead.name ?? conv.lead.igUsername ?? "lead sem nome"}
                      </span>
                      <span>·</span>
                      <span>
                        última mensagem do lead em <LocalDateTime iso={conv.lastLeadMessageAt!.toISOString()} />
                      </span>
                      <Link href={`/crm/conversas/${conv.id}`} className="ml-auto underline hover:text-vexo-fg">
                        Ver conversa
                      </Link>
                    </div>
                    {conv.lastSilenceCheckAt ? (
                      <div
                        className={`mt-1.5 space-y-1 rounded-lg border p-2 ${
                          isParseError
                            ? "border-vexo-error/30 bg-vexo-error/10 text-vexo-error"
                            : "border-vexo-warning/30 bg-vexo-warning/10 text-vexo-warning"
                        }`}
                      >
                        <p>
                          Avaliada em <LocalDateTime iso={conv.lastSilenceCheckAt.toISOString()} />
                          {conv.lastSilenceCheckModel && ` por ${conv.lastSilenceCheckModel}`} — decidiu{" "}
                          <strong>{conv.lastSilenceCheckSuggested ? "reengajar" : "NÃO reengajar"}</strong>.
                        </p>
                        {conv.lastSilenceCheckReason && (
                          <p className="italic">&quot;{conv.lastSilenceCheckReason}&quot;</p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1.5 text-vexo-muted">
                        Ainda não avaliada pelo classificador — aguardando o próximo ciclo do worker (até ~30min).
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-card font-medium text-vexo-fg">
            FollowUpLogs abertos agora, qualquer status ({openFollowUpLogs.length})
          </h3>
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
                      <span className="font-medium text-vexo-fg">
                        {log.conversation.lead.name ?? log.conversation.lead.igUsername ?? "lead sem nome"}
                      </span>
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
                        <form action={closeStuckFollowUpLogForClinicAction.bind(null, log.conversationId, clinic.id)}>
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
        </div>
      </section>

      <section className="space-y-2 border-t border-vexo-border pt-4">
        <h2 className="text-sm font-semibold">Logs do webhook (Instagram)</h2>
        {!clinic.instagramAccount ? (
          <p className="rounded-lg border border-vexo-border bg-vexo-surface p-3 text-xs text-vexo-muted">
            Esta clínica ainda não tem Instagram conectado (ver aba Conexões) — sem uma conta
            conectada não tem como filtrar os logs por ela. Veja{" "}
            <Link href="/crm/webhook-logs" className="underline hover:text-vexo-fg">
              todos os logs, de todas as clínicas
            </Link>
            .
          </p>
        ) : !webhookLogs || webhookLogs.length === 0 ? (
          <p className="rounded-lg border border-vexo-border bg-vexo-surface p-3 text-xs text-vexo-muted">
            Nenhuma requisição recebida ainda pra esta conta.
          </p>
        ) : (
          <div className="space-y-2">
            {webhookLogs.map((log) => (
              <div key={log.id} className="rounded-xl border border-vexo-border bg-vexo-surface p-3 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-vexo-muted">
                  <span className="font-medium text-vexo-fg">
                    <LocalDateTime iso={log.receivedAt.toISOString()} />
                  </span>
                  <span className="rounded border border-vexo-border px-1.5 py-0.5">{log.method}</span>
                  <span
                    className={
                      log.signatureValid
                        ? "rounded border border-vexo-success/30 bg-vexo-success/10 px-1.5 py-0.5 text-vexo-success"
                        : "rounded border border-vexo-error/30 bg-vexo-error/10 px-1.5 py-0.5 text-vexo-error"
                    }
                  >
                    {log.signatureValid ? "assinatura válida" : "assinatura inválida"}
                  </span>
                </div>
                {log.matchFailureReason && (
                  <p className="mt-2 rounded-lg border border-vexo-error/30 bg-vexo-error/10 p-2 text-vexo-error">
                    {log.matchFailureReason}
                  </p>
                )}
                {log.processingError && (
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-vexo-error/30 bg-vexo-error/10 p-2 text-vexo-error">
                    {log.processingError}
                  </pre>
                )}
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-vexo-bg p-2 text-card text-vexo-fg">
                  {log.rawBody || "(corpo vazio)"}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
