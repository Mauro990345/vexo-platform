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

// Cor do ícone de cada aba — FIXA pela posição (1ª/2ª/3ª/4ª da esquerda
// pra direita), não por estar selecionada ou não (pedido explícito:
// substitui a regra anterior de "ícone azul na aba ativa"). Cicla de 4 em
// 4 — nenhuma página hoje passa de 4 abas, mas isso nunca quebra se
// alguma ganhar uma 5ª no futuro, só repete a cor da 1ª.
const TAB_ICON_COLORS = ["text-vexo-tabIcon1", "text-vexo-tabIcon2", "text-vexo-tabIcon3", "text-vexo-tabIcon4"];

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
      {/* overflow-x-auto (pedido explícito, correção de rolagem horizontal
          no celular) — com 3-4 abas de rótulo longo e whitespace-nowrap, a
          linha é mais larga que telas pequenas; sem isso o excesso
          vazava pra fora do container e estourava a largura da PÁGINA
          inteira (o navegador então encolhia o zoom pra caber tudo). Agora
          só esta linha rola, por dentro de si mesma — o resto da página
          nunca se move. */}
      <div className="relative flex gap-8 overflow-x-auto border-b border-vexo-border">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(el) => {
              buttonRefs.current[tab.id] = el;
            }}
            type="button"
            onClick={() => setActiveId(tab.id)}
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap px-0.5 pb-2.5 text-xs font-medium text-vexo-tabFg transition-colors"
          >
            {/* Ícone num span próprio, de cor independente do texto acima —
                sem isso, herdaria currentColor do <button> (sempre
                off-white) e perderia a cor fixa por posição. */}
            {tab.icon && <span className={TAB_ICON_COLORS[index % TAB_ICON_COLORS.length]}>{tab.icon}</span>}
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
