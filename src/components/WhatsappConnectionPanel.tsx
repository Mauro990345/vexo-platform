import type { WhatsappConnectionState } from "@/lib/whatsapp-connection";

const STATUS_LABELS: Record<WhatsappConnectionState, string> = {
  open: "Conectado",
  connecting: "Conectando…",
  close: "Desconectado",
  unknown: "Status desconhecido",
};

const STATUS_CLASSES: Record<WhatsappConnectionState, string> = {
  open: "border-emerald-500/30 text-emerald-300",
  connecting: "border-amber-500/30 text-amber-300",
  close: "border-vexo-border text-vexo-muted",
  unknown: "border-vexo-border text-vexo-muted",
};

// Painel de conexão do WhatsApp (pareamento por QR code) — usado tanto no
// admin (/crm/clinicas/[id]/whatsapp) quanto no painel do cliente
// (/dashboard/whatsapp). Cada tela busca os dados e passa aqui já
// resolvidos; renameAction só é passada pelo admin (o cliente não pode
// trocar o nome técnico da instância).
export function WhatsappConnectionPanel({
  instanceName,
  status,
  qrBase64,
  statusError,
  refreshHref,
  disconnectAction,
  renameAction,
}: {
  instanceName: string;
  status: WhatsappConnectionState;
  qrBase64: string | null;
  statusError: string | null;
  refreshHref: string;
  disconnectAction?: (formData: FormData) => Promise<void>;
  renameAction?: (formData: FormData) => Promise<void>;
}) {
  const isOpen = status === "open";

  return (
    <div className="space-y-3 rounded-2xl border border-vexo-border bg-vexo-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-vexo-muted">WhatsApp</h2>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CLASSES[status]}`}
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
          {STATUS_LABELS[status]}
        </span>
      </div>

      <p className="text-xs text-vexo-muted">
        Instância: <span className="font-mono">{instanceName}</span>
      </p>

      {statusError && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{statusError}</p>
      )}

      {isOpen ? (
        <div className="space-y-2.5">
          <p className="text-sm">WhatsApp conectado e pronto para enviar notificações.</p>
          {disconnectAction && (
            <form action={disconnectAction}>
              <button className="rounded-lg border border-vexo-border px-3 py-1.5 text-xs text-vexo-muted hover:border-red-500/40 hover:text-red-300">
                Desconectar
              </button>
            </form>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {qrBase64 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrBase64}
              alt="QR code do WhatsApp"
              className="mx-auto h-40 w-40 rounded-lg border border-vexo-border bg-white p-1.5"
            />
          ) : (
            <p className="text-sm text-vexo-muted">Não foi possível gerar o QR code agora.</p>
          )}

          <p className="text-xs text-vexo-muted">
            No celular que vai receber as notificações: WhatsApp → Aparelhos conectados → Conectar um
            aparelho, e escaneie o código acima. Ele expira em segundos — se não der tempo, clique em
            "Atualizar" para gerar um novo.
          </p>

          <a
            href={refreshHref}
            className="block w-full rounded-lg border border-vexo-border px-3 py-2 text-center text-xs font-medium hover:border-vexo-accent"
          >
            Atualizar / verificar conexão
          </a>
        </div>
      )}

      {renameAction && !isOpen && (
        <form action={renameAction} className="space-y-1.5 border-t border-vexo-border pt-2.5">
          <label className="block text-xs text-vexo-muted" htmlFor="instanceName">
            Nome da instância (avançado — ex: reaproveitar uma já conectada)
          </label>
          <div className="flex gap-2">
            <input
              id="instanceName"
              name="instanceName"
              defaultValue={instanceName}
              pattern="[a-z0-9-]+"
              title="Apenas letras minúsculas, números e hífen"
              className="flex-1 rounded-lg border border-vexo-border bg-vexo-bg px-2 py-1.5 text-xs font-mono outline-none focus:border-vexo-accent"
            />
            <button className="rounded-lg border border-vexo-border px-3 py-1.5 text-xs hover:border-vexo-accent">
              Salvar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
