// Componente base novo (Etapa 2 da migração de design, ver DESIGN.md e
// docs/design-audit.md) — reproduz o padrão de StatCard.tsx (rótulo
// pequeno + valor grande, usado hoje só em ClinicMetricsCard.tsx, tela
// interna do CRM). PanelMetricCard.tsx (Painel do cliente) NÃO foi
// tocado nem unificado aqui — depende de MobileCardScale.ts e do token
// painel.highlight, fora do escopo desta migração (Painel fica pra
// depois, por pedido explícito). Nenhuma tela usa este componente ainda.
export function MetricCard({
  label,
  value,
  hint,
  className = "",
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={`rounded-control border border-vexo-border bg-vexo-surface2 p-2.5 ${className}`}>
      <p className="truncate text-card font-medium text-vexo-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold leading-none tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-card text-vexo-muted">{hint}</p>}
    </div>
  );
}
