"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { getOrCreateClientPanelLink, revokeClientPanelLink } from "@/app/crm/clinicas/actions";

type Link = { token: string; url: string };

// Único mecanismo de acesso do cliente ao painel dele: um link permanente
// por clínica que autentica na hora (ver ClientPanelLink no schema e
// /acesso/[token]/route.ts) — sem e-mail/senha/tela de login em nenhuma
// hipótese (removido de propósito, ver histórico do ClientAccessModal).
// Só duas ações possíveis: criar (se não existe) e cancelar (se existe) —
// sem "gerar novo"/regenerar: pra trocar o link, cancela e cria de novo.
//
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

  async function handleCancel() {
    if (!window.confirm("Cancelar o acesso por link agora — o cliente não consegue mais entrar no painel até você gerar um link novo. Continuar?")) {
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
    <div className="space-y-2 text-xs">
      <p className="text-vexo-muted">
        O cliente clica e já cai no painel dele — sem e-mail, senha ou tela de login.
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
