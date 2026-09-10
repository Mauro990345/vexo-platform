"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { CreateClientLoginForm } from "@/components/CreateClientLoginForm";
import { removeClientLogin } from "@/app/crm/clinicas/actions";

type ClientUser = { id: string; name: string; email: string };

// Botão "Criar painel" (mesmo padrão visual do "Criar conta" em Contas) +
// modal com o gerenciamento de acesso do cliente — antes ficava fixo
// direto no topo da página (ver histórico de clinicas/[id]/painel/page.tsx),
// ocupando espaço e desalinhando a primeira dobra mesmo pra quem só queria
// ver os números do dia. Só cria/remove login (nome+e-mail+senha) —
// mesma função de sempre (CreateClientLoginForm/removeClientLogin), só que
// atrás de um clique em vez de fixo na tela.
export function ClientAccessModal({ clinicId, users }: { clinicId: string; users: ClientUser[] }) {
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
              <h2 className="text-sm font-medium">Acesso do cliente ao painel dele ({users.length})</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fechar"
                className="shrink-0 text-vexo-muted hover:text-vexo-fg"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            <p className="mb-3 text-card text-vexo-muted">
              Login do painel do cliente — permanente, sem expiração. Revogado removendo o acesso
              abaixo.
            </p>

            {users.length > 0 && (
              <ul className="mb-3 divide-y divide-vexo-border rounded-lg border border-vexo-border">
                {users.map((u) => (
                  <li key={u.id} className="flex items-center justify-between px-2.5 py-1.5 text-xs">
                    <div className="min-w-0">
                      <p className="truncate">{u.name}</p>
                      <p className="truncate text-card text-vexo-muted">{u.email}</p>
                    </div>
                    <form action={removeClientLogin.bind(null, clinicId, u.id)}>
                      <button className="shrink-0 rounded-md border border-vexo-border px-1.5 py-1 text-card text-vexo-error hover:border-vexo-error/40">
                        Remover acesso
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <CreateClientLoginForm clinicId={clinicId} />
          </div>
        </div>
      )}
    </>
  );
}
