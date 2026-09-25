// Item de acordeão reutilizável — mesmo padrão visual dos passos de
// Follow-up (ver StepList em FollowUpView.tsx): fechado por padrão,
// expande ao clicar no cabeçalho, seta gira 180° quando aberto. Extraído
// pra componente porque "Agente de IA" e "Automações" passaram a usar o
// mesmo padrão em várias seções (evita repetir o <details>/<summary> +
// seta toda vez). <details> nativo, sem "use client": o navegador cuida
// do abrir/fechar sozinho, sem precisar de estado em JS.
export function CollapsibleSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-vexo-border bg-vexo-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-vexo-muted">{description}</p>}
        </div>
        <span className="shrink-0 text-card text-vexo-muted transition group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-vexo-border p-3.5">{children}</div>
    </details>
  );
}
