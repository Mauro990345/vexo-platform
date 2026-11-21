"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { getOrCreateClientFilaLink, revokeClientFilaLink } from "@/app/crm/clinicas/actions";

type Link = { token: string; url: string };

// Segundo link de acesso do cliente (ver ClientFilaLink no schema e
// /acesso-fila/[token]/route.ts) — INDEPENDENTE do link do painel
// (ClientPanelLinkSection): abre SÓ a Fila de abordagem (sem sidebar, sem
// qualquer outro dado do painel). Mesmo componente/mesma estrutura de
// ClientPanelLinkSection (criar/cancelar, sem "regenerar"), copiado em vez
// de generalizado — mesmo padrão já usado pelo BriefingLinkSection pra
// outro tipo de link.
export function ClientFilaLinkSection({
  clinicId,
  initialLink,
}: {
  clinicId: string;
  initialLink: Link | null;
}) {
  const [link, setLink] = useState<Link | null>(initialLink);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setPending(true);
    try {
      setLink(await getOrCreateClientFilaLink(clinicId));
    } finally {
      setPending(false);
    }
  }

  async function handleCancel() {
    if (
      !window.confirm(
        "Cancelar o acesso por link agora — quem tiver esse link não consegue mais abrir a Fila de abordagem até você gerar um link novo. Continuar?"
      )
    ) {
      return;
    }
    setPending(true);
    try {
      await revokeClientFilaLink(clinicId);
      setLink(null);
    } finally {
      setPending(false);
    }
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // URL já fica visível na tela pra copiar manualmente nesse caso.
    }
  }

  return (
    <div className="space-y-2 text-xs">
      <p className="text-vexo-muted">
        O cliente clica e já cai direto na Fila de abordagem — sem o painel, sem sidebar, sem mais nada.
      </p>

      {link ? (
        <>
          <p className="break-all rounded-md border border-vexo-border bg-vexo-bg px-2 py-1.5 text-vexo-muted">
            {link.url}
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleCopy}
              disabled={pending}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-vexo-accent px-2.5 py-1.5 font-medium text-vexo-accent hover:bg-vexo-accent/10 disabled:opacity-50"
            >
              {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} />}
              {copied ? "Copiado!" : "Copiar link"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={pending}
              className="shrink-0 rounded-lg border border-vexo-error/40 px-2.5 py-1.5 font-medium text-vexo-error hover:bg-vexo-error/10 disabled:opacity-50"
            >
              Cancelar acesso
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          className="w-full rounded-lg border border-vexo-accent px-2.5 py-1.5 font-medium text-vexo-accent hover:bg-vexo-accent/10 disabled:opacity-50"
        >
          {pending ? "Gerando..." : "Gerar link de acesso"}
        </button>
      )}
    </div>
  );
}
