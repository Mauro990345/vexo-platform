"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ClientPanelLinkSection } from "@/components/ClientPanelLinkSection";

type ClientPanelLink = { token: string; url: string };

// Botão "Criar painel" (mesmo padrão visual do "Criar conta" em Contas) +
// modal com o acesso do cliente ao painel dele — antes ficava fixo direto
// no topo da página (ver histórico de clinicas/[id]/painel/page.tsx),
// ocupando espaço e desalinhando a primeira dobra mesmo pra quem só queria
// ver os números do dia.
//
// Único mecanismo de acesso: link permanente por clínica (ver
// ClientPanelLinkSection) — sem e-mail/senha/tela de login em nenhuma
// hipótese. O fluxo antigo de e-mail+senha (CreateClientLoginForm/
// createClientLogin/removeClientLogin) foi removido de propósito, não
// mantido como alternativa — pedido explícito depois de confusão
// recorrente sobre qual dos dois mecanismos usar.
export function ClientAccessModal({
  clinicId,
  initialLink,
}: {
  clinicId: string;
  initialLink: ClientPanelLink | null;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg bg-vexo-accent px-3 py-1.5 text-sm font-medium text-vexo-accentFg hover:opacity-90"
      >
        Criar painel
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-vexo-border bg-vexo-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium">Acesso do cliente ao painel dele</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="shrink-0 text-vexo-muted hover:text-vexo-fg"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            <ClientPanelLinkSection clinicId={clinicId} initialLink={initialLink} />
          </div>
        </div>
      )}
    </>
  );
}
