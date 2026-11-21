"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ClientPanelLinkSection } from "@/components/ClientPanelLinkSection";
import { ClientFilaLinkSection } from "@/components/ClientFilaLinkSection";

type ClientLink = { token: string; url: string };

// Botão "Criar painel" (mesmo padrão visual do "Criar conta" em Contas) +
// modal com os DOIS links de acesso do cliente — antes ficava fixo direto
// no topo da página (ver histórico de clinicas/[id]/painel/page.tsx),
// ocupando espaço e desalinhando a primeira dobra mesmo pra quem só queria
// ver os números do dia.
//
// Dois mecanismos INDEPENDENTES, cada um com seu próprio token: o painel
// completo (ClientPanelLinkSection, sempre existiu) e, pedido explícito,
// a Fila de abordagem sozinha (ClientFilaLinkSection — sem sidebar, sem o
// painel, só o card de leads). Nenhum dos dois usa e-mail/senha/tela de
// login em nenhuma hipótese. O fluxo antigo de e-mail+senha
// (CreateClientLoginForm/createClientLogin/removeClientLogin) foi
// removido de propósito, não mantido como alternativa — pedido explícito
// depois de confusão recorrente sobre qual dos dois mecanismos usar.
export function ClientAccessModal({
  clinicId,
  initialLink,
  initialFilaLink,
}: {
  clinicId: string;
  initialLink: ClientLink | null;
  initialFilaLink: ClientLink | null;
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
              <h2 className="text-sm font-medium">Acesso do cliente</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="shrink-0 text-vexo-muted hover:text-vexo-fg"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <p className="mb-1.5 text-xs font-medium text-vexo-fg">Painel completo</p>
                <ClientPanelLinkSection clinicId={clinicId} initialLink={initialLink} />
              </div>

              <div className="border-t border-vexo-border pt-3">
                <p className="mb-1.5 text-xs font-medium text-vexo-fg">Só a Fila de abordagem</p>
                <ClientFilaLinkSection clinicId={clinicId} initialLink={initialFilaLink} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
