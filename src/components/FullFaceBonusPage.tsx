import { FullFaceBonusGuide } from "@/components/FullFaceBonusGuide";

// Página inteira do "Bônus Full Face" — mesmo wrapper de página do Painel
// do cliente (ClientPanelView standalone), abas no topo e o guia embaixo.
// Usada por /dashboard/bonus (cliente) e /crm/painel-cliente/[id]/bonus
// (visão do admin); a checagem de acesso fica em cada rota (servidor).
export function FullFaceBonusPage({
  clinicId,
  panelHref,
  bonusHref,
}: {
  clinicId: string;
  panelHref: string;
  bonusHref: string;
}) {
  return (
    <div className="min-h-screen bg-vexo-bg px-4 pt-4 pb-6 sm:px-8 sm:pt-6 sm:pb-8">
      <div className="mx-auto max-w-6xl">
        <FullFaceBonusGuide
          storageKey={`vexo:bonus-full-face:v1:${clinicId}`}
          tabs={{ panelHref, bonusHref }}
        />
      </div>
    </div>
  );
}
