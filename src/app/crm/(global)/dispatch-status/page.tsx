import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { LocalDateTime } from "@/components/LocalDateTime";

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

export default async function DispatchStatusPage() {
  await requireInternalSession();

  const now = new Date();

  const [stuckPending, recentFailed] = await Promise.all([
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
    </div>
  );
}
