import { MessageCircle } from "lucide-react";
import type { WhatsappConnectionState } from "@/lib/whatsapp-connection";

const STATUS_LABELS: Record<WhatsappConnectionState, string> = {
  open: "Conectado",
  connecting: "Conectando…",
  close: "Desconectado",
  unknown: "Status desconhecido",
};

const STATUS_DOT: Record<WhatsappConnectionState, string> = {
  open: "bg-emerald-400",
  connecting: "bg-amber-400",
  close: "bg-vexo-muted",
  unknown: "bg-vexo-muted",
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
  description,
  disconnectAction,
  renameAction,
}: {
  instanceName: string;
  status: WhatsappConnectionState;
  qrBase64: string | null;
  statusError: string | null;
  refreshHref: string;
  description: string;
  disconnectAction?: (formData: FormData) => Promise<void>;
  renameAction?: (formData: FormData) => Promise<void>;
}) {
  const isOpen = status === "open";

  return (
    <div className="space-y-2.5 rounded-xl border border-vexo-border bg-vexo-surface p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white">
          <MessageCircle className="h-3.5 w-3.5" strokeWidth={2} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">WhatsApp</p>
          <p className="truncate text-xs text-vexo-muted">{description}</p>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-vexo-muted">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
            {STATUS_LABELS[status]} · <span className="font-mono">{instanceName}</span>
          </div>
        </div>

        {isOpen && disconnectAction && (
          <form action={disconnectAction} className="shrink-0">
            <button className="rounded-lg border border-vexo-border px-2.5 py-1.5 text-xs text-vexo-muted hover:border-red-500/40 hover:text-red-300">
              Desconectar
            </button>
          </form>
        )}
      </div>

      {statusError && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{statusError}</p>
      )}

      {isOpen ? (
        <p className="text-xs">WhatsApp conectado e pronto para enviar notificações.</p>
      ) : (
        <div className="space-y-2 border-t border-vexo-border pt-2.5">
          {qrBase64 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrBase64}
              alt="QR code do WhatsApp"
              className="mx-auto h-28 w-28 rounded-lg border border-vexo-border bg-white p-1"
            />
          ) : (
            <p className="text-xs text-vexo-muted">Não foi possível gerar o QR code agora.</p>
          )}

          <p className="text-[11px] leading-normal text-vexo-muted">
            No celular que vai receber as notificações: WhatsApp → Aparelhos conectados → Conectar um
            aparelho, e escaneie o código acima. Ele expira em segundos — se não der tempo, clique em
            "Atualizar" para gerar um novo.
          </p>

          <a
            href={refreshHref}
            className="block w-full rounded-lg border border-vexo-accent px-2.5 py-1.5 text-center text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
          >
            Atualizar / verificar conexão
          </a>
        </div>
      )}

      {renameAction && !isOpen && (
        <form action={renameAction} className="space-y-1.5 border-t border-vexo-border pt-2">
          <label className="block text-[11px] text-vexo-muted" htmlFor="instanceName">
            Nome da instância (avançado — ex: reaproveitar uma já conectada)
          </label>
          <div className="flex gap-1.5">
            <input
              id="instanceName"
              name="instanceName"
              defaultValue={instanceName}
              pattern="[a-z0-9-]+"
              title="Apenas letras minúsculas, números e hífen"
              className="flex-1 rounded-lg border border-vexo-border bg-vexo-bg px-2 py-1 text-xs font-mono outline-none focus:border-vexo-accent"
            />
            <button className="rounded-lg border border-vexo-accent px-2.5 py-1 text-xs text-vexo-accent hover:bg-vexo-accent/10">
              Salvar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
