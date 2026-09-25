// Item de acordeão reutilizável — mesmo padrão visual COMPACTO dos passos
// de Follow-up (ver StepList em FollowUpView.tsx): fechado por padrão,
// uma linha só quando fechado (título + descrição truncada lado a lado,
// sem bloco de duas linhas com parágrafo), expande ao clicar no
// cabeçalho, seta gira 180° quando aberto. Ajustado depois de ver em
// produção que o formato anterior (título em negrito numa linha + parágrafo
// completo embaixo) deixava cada item fechado alto demais, destoando do
// Follow-up.
//
// `name` agrupa vários CollapsibleSection num acordeão DE VERDADE — só um
// aberto por vez, o navegador fecha os outros sozinho ao abrir um novo
// (atributo `name` nativo de <details>, sem precisar de JS/estado: mesmo
// grupo = mesmo comportamento de "radio button" que <details> já tem
// desde Chrome/Firefox/Safari 2023-2024). Sem `name`, cada item abre/fecha
// independente dos outros (comportamento anterior). <details> nativo, sem
// "use client": o navegador cuida do abrir/fechar sozinho.
export function CollapsibleSection({
  title,
  description,
  name,
  children,
}: {
  title: string;
  description?: string;
  name?: string;
  children: React.ReactNode;
}) {
  return (
    <details name={name} className="group rounded-xl border border-vexo-border bg-vexo-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 text-xs font-medium">{title}</span>
          {description && <span className="truncate text-caption text-vexo-muted">{description}</span>}
        </div>
        <span className="shrink-0 text-card text-vexo-muted transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-vexo-border p-3.5">{children}</div>
    </details>
  );
}
