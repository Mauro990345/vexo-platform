import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { LocalDateTime } from "@/components/LocalDateTime";
import { getSilenceHours } from "@/lib/follow-up";

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

  const [stuckPending, recentFailed, staleWithoutFollowUp] = await Promise.all([
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
  ]);

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
    </div>
  );
}
