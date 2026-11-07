"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";

// Menu "⋯" genérico pra guardar a AÇÃO SECUNDÁRIA de uma linha (pedido
// explícito da reorganização do Painel — ver docs/design-audit.md: "uma
// ação visível por linha; a ação secundária... fica discreta, num menu
// '⋯' ao lado"). Usado hoje só pela coluna Agendamentos (RetornoButton
// visível + "Não compareceu" aqui dentro, quando os dois se aplicam ao
// mesmo agendamento ao mesmo tempo — ver comentário grande em
// ClientPanelView.tsx sobre esse caso). Mesmo padrão de popover já usado
// em RetornoButton.tsx (useState + camada fixa pra fechar no clique fora +
// Escape).
export function OverflowMenu({ children, label = "Mais ações" }: { children: ReactNode; label?: string }) {
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
    <div className="relative shrink-0">
      <button
        type="button"
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-vexo-muted transition hover:bg-vexo-surface2 hover:text-vexo-fg"
      >
        <MoreHorizontal className="h-4 w-4" strokeWidth={2} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-50 mt-1 min-w-[160px] rounded-control border border-vexo-border bg-vexo-surface2 p-1 shadow-card"
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}
