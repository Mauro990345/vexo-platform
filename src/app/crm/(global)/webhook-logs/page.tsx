import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Diagnóstico temporário (sem acesso a logs do Railway): mostra toda
// requisição que chegou em /api/webhooks/instagram, mesmo assinatura
// inválida ou payload que não chegou a virar JSON — ver WebhookLog no
// schema e a gravação em api/webhooks/instagram/route.ts. Serve pra
// confirmar se a Meta está de fato tentando entregar alguma coisa (e o
// quê, exatamente) sem precisar de acesso ao Railway.
export default async function WebhookLogsPage() {
  await requireInternalSession();

  const logs = await prisma.webhookLog.findMany({
    orderBy: { receivedAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Logs do webhook (Instagram)</h1>
        <p className="mt-0.5 text-xs text-vexo-muted">
          As últimas {logs.length} requisições recebidas em /api/webhooks/instagram, mais recente
          primeiro — inclui as que falharam na verificação de assinatura. Ferramenta de diagnóstico
          temporária.
        </p>
      </div>

      {logs.length === 0 ? (
        <p className="rounded-lg border border-vexo-border bg-vexo-surface p-3 text-xs text-vexo-muted">
          Nenhuma requisição registrada ainda — a Meta não tentou entregar nada nessa rota até agora.
        </p>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-xl border border-vexo-border bg-vexo-surface p-3 text-xs">
              <div className="flex flex-wrap items-center gap-2 text-vexo-muted">
                <span className="font-medium text-vexo-fg">{log.receivedAt.toLocaleString("pt-BR")}</span>
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
                  {/* Gravado por handleInboundInstagramMessage
                      (conversation-pipeline.ts) quando o evento chegou de
                      verdade mas nenhuma InstagramAccount bateu com o
                      igUserId recebido — antes disso era só um
                      console.warn perdido, invisível sem log do Railway. */}
                  {log.matchFailureReason}
                </p>
              )}
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-vexo-bg p-2 text-card text-vexo-fg">
                {log.rawBody || "(corpo vazio)"}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
