import Link from "next/link";

// Abas do topo do Painel do cliente ("Painel" / "Bônus Full Face" /
// "Abordagem") — "Bônus Full Face" só aparece quando a conta tem o Bônus
// liberado (ver Clinic.fullFaceBonusEnabled); "Abordagem" só quando
// `abordagemHref` é passado (pedido explícito: aba pra Fila de abordagem
// no MESMO lugar/estilo destas, não um botão solto em outro canto da tela
// — ver /dashboard/page.tsx). Mesmo visual do componente Tabs (traço
// accent embaixo da aba ativa), mas como links de rota: cada aba é uma
// página própria (/dashboard, /dashboard/bonus e /dashboard/fila).
export function ClientPanelTabs({
  active,
  panelHref,
  bonusHref,
  abordagemHref,
  trailing,
}: {
  active: "painel" | "bonus" | "abordagem";
  panelHref: string;
  bonusHref?: string;
  abordagemHref?: string;
  // Slot opcional à direita da linha das abas (ex: botão "Modo call" do guia).
  trailing?: React.ReactNode;
}) {
  const items = [
    { id: "painel" as const, label: "Painel", href: panelHref },
    ...(bonusHref ? [{ id: "bonus" as const, label: "Bônus Full Face", href: bonusHref }] : []),
    ...(abordagemHref ? [{ id: "abordagem" as const, label: "Abordagem", href: abordagemHref }] : []),
  ];

  return (
    <nav className="mb-5 flex items-end gap-6 border-b border-vexo-border sm:gap-8" aria-label="Seções do painel">
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b px-0.5 pb-2.5 text-[16px] font-medium text-vexo-tabFg transition-colors sm:text-xs ${
              isActive ? "border-vexo-accent" : "border-transparent"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
      {trailing && <div className="ml-auto self-center pb-2">{trailing}</div>}
    </nav>
  );
}
