"use client";

import { useLayoutEffect, useRef, useState } from "react";

export type TabItem = {
  id: string;
  label: string;
  // Ícone já renderizado (ex: <Settings className="h-3.5 w-3.5" />), mesmo
  // motivo do NavItem.icon em AppShell — elemento pronto, não referência de
  // componente, pra poder vir de um Server Component sem quebrar a
  // serialização da fronteira server→client.
  icon?: React.ReactNode;
  content: React.ReactNode;
};

// Abas horizontais reutilizáveis, com um traço abaixo da aba ativa que
// desliza (anima left/width) até a aba clicada — mesmo padrão visual do
// menu "Atendimento & Social / Anúncios & Métricas / Agendas / Telefonia"
// usado como referência. Só o conteúdo da aba ativa fica visível (as
// outras ficam com hidden, não desmontadas — troca de aba não perde estado
// de formulário nem refaz fetch). Estado da aba ativa é local (reseta pro
// defaultTabId a cada carregamento de página), não sincroniza com a URL.
export function Tabs({ tabs, defaultTabId }: { tabs: TabItem[]; defaultTabId?: string }) {
  const [activeId, setActiveId] = useState<string>(defaultTabId ?? tabs[0]?.id ?? "");
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [underline, setUnderline] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const btn = buttonRefs.current[activeId];
    if (btn) setUnderline({ left: btn.offsetLeft, width: btn.offsetWidth });
  }, [activeId, tabs]);

  return (
    <div>
      <div className="relative flex gap-8 border-b border-vexo-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            ref={(el) => {
              buttonRefs.current[tab.id] = el;
            }}
            type="button"
            onClick={() => setActiveId(tab.id)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap px-0.5 pb-2.5 text-xs font-medium transition-colors ${
              activeId === tab.id ? "text-vexo-accent" : "text-vexo-fg/60 hover:text-vexo-fg"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
        {underline && (
          <span
            className="absolute bottom-0 h-px rounded-full bg-vexo-accent transition-all duration-300 ease-out"
            style={{ left: underline.left, width: underline.width }}
          />
        )}
      </div>

      <div className="pt-4">
        {tabs.map((tab) => (
          <div key={tab.id} hidden={tab.id !== activeId}>
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
}
