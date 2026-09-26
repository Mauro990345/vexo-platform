"use client";

import { useState } from "react";
import { Check, Copy, RefreshCw } from "lucide-react";
import {
  getOrCreateClientPanelLink,
  regenerateClientPanelLink,
  revokeClientPanelLink,
} from "@/app/crm/clinicas/actions";

type Link = { token: string; url: string };

// Bloco principal do modal "Acesso do cliente ao painel dele" — um link
// permanente por clínica que autentica na hora (ver ClientPanelLink no
// schema e /acesso/[token]/route.ts), sem e-mail/senha nem tela de login.
// Guarda o objeto {token, url} inteiro em estado (não só o token) porque a
// URL final depende de APP_URL, calculado no server (page.tsx e as
// server actions abaixo, mesmo padrão de createConnectionLink/
// createConnectionBundle) — montar a URL aqui a partir de
// window.location.origin geraria um mismatch de hidratação nesse
// component (SSR de client component roda com window indefinido).
export function ClientPanelLinkSection({
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
      setLink(await getOrCreateClientPanelLink(clinicId));
    } finally {
      setPending(false);
    }
  }

  async function handleRegenerate() {
    if (!window.confirm("Gerar um novo link vai invalidar o link atual imediatamente — quem já tiver salvo o antigo perde o acesso. Continuar?")) {
      return;
    }
    setPending(true);
    try {
      setLink(await regenerateClientPanelLink(clinicId));
      setCopied(false);
    } finally {
      setPending(false);
    }
  }

  async function handleRevoke() {
    if (!window.confirm("Revogar remove o acesso por link — o cliente vai cair na tela de login se clicar de novo. Continuar?")) {
      return;
    }
    setPending(true);
    try {
      await revokeClientPanelLink(clinicId);
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
    <div className="mb-3 space-y-2 rounded-lg border border-vexo-border bg-vexo-bg p-2.5 text-xs">
      <p className="font-medium text-vexo-fg">Link de acesso direto</p>
      <p className="text-vexo-muted">
        O cliente clica e já cai no painel dele — sem digitar e-mail ou senha. Permanente até você revogar.
      </p>

      {link ? (
        <>
          <p className="break-all rounded-md border border-vexo-border bg-vexo-surface px-2 py-1.5 text-vexo-muted">
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
              onClick={handleRegenerate}
              disabled={pending}
              title="Gerar novo link (invalida o atual)"
              aria-label="Gerar novo link (invalida o atual)"
              className="shrink-0 rounded-lg border border-vexo-border px-2 py-1.5 text-vexo-muted hover:text-vexo-fg disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          </div>
          <button
            type="button"
            onClick={handleRevoke}
            disabled={pending}
            className="w-full text-center text-vexo-error hover:underline disabled:opacity-50"
          >
            Revogar acesso por link
          </button>
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
