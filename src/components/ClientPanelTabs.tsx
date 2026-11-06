import Link from "next/link";

// Abas do topo do Painel do cliente ("Painel" / "Bônus Full Face") — só
// renderizadas quando a conta tem o Bônus Full Face liberado (ver
// Clinic.fullFaceBonusEnabled). Mesmo visual do componente Tabs (traço
// accent embaixo da aba ativa), mas como links de rota: cada aba é uma
// página própria (/dashboard e /dashboard/bonus).
export function ClientPanelTabs({
  active,
  panelHref,
  bonusHref,
  trailing,
}: {
  active: "painel" | "bonus";
  panelHref: string;
  bonusHref: string;
  // Slot opcional à direita da linha das abas (ex: botão "Modo call" do guia).
  trailing?: React.ReactNode;
}) {
  const items = [
    { id: "painel" as const, label: "Painel", href: panelHref },
    { id: "bonus" as const, label: "Bônus Full Face", href: bonusHref },
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
            className={`-mb-px whitespace-nowrap border-b px-0.5 pb-2.5 text-[16px] font-medium transition-colors sm:text-xs ${
              isActive ? "border-vexo-accent text-vexo-accent" : "border-transparent text-vexo-fg/60 hover:text-vexo-fg"
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
