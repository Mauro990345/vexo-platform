// Componente base novo (Etapa 2 da migração de design, ver DESIGN.md e
// docs/design-audit.md) — reproduz o padrão de StatCard.tsx (rótulo
// pequeno + valor grande, usado hoje só em ClinicMetricsCard.tsx, tela
// interna do CRM). Primeira tela a consumir: Etapa 4 (reorganização do
// Painel do cliente, ver docs/design-audit.md), que substitui o antigo
// PanelMetricCard.tsx — ver `bare`/`highlight` abaixo, adicionados nessa
// mesma etapa pra cobrir os dois usos que o Painel precisava
// (faixa fina sem caixa própria por item, e o destaque de "Agendaram").
export function MetricCard({
  label,
  value,
  hint,
  highlight = false,
  bare = false,
  className = "",
  labelClassName = "text-vexo-muted",
  valueClassName = "text-xl",
}: {
  label: string;
  value: string;
  hint?: string;
  // Tom de destaque customizável por clínica (painel.highlight, ver
  // page-style-overrides.ts) — mesmo papel do antigo PanelMetricCard.tsx,
  // usado hoje só na métrica "Agendaram" do Painel.
  highlight?: boolean;
  // Sem o bloco própro (borda/fundo/raio) — pra usar dentro de uma faixa
  // já dividida por linhas finas (divide-x), onde o "card" é o container
  // ao redor, não cada métrica individualmente.
  bare?: boolean;
  className?: string;
  // Sobrescrevem só o tamanho/cor do rótulo e do valor (opcional — sem
  // eles, visual idêntico ao de sempre; o Painel não passa nenhum). Usados
  // pelo Relatório, que pede número maior e legenda no cinza dele.
  labelClassName?: string;
  valueClassName?: string;
}) {
  return (
    <div className={`${bare ? "" : "rounded-control border border-vexo-border bg-vexo-surface2 p-2.5"} ${className}`}>
      <p className={`truncate text-card font-medium ${labelClassName}`}>{label}</p>
      <p className={`mt-1 font-semibold leading-none tracking-tight ${valueClassName} ${highlight ? "text-vexo-panelHighlight" : ""}`}>{value}</p>
      {hint && <p className="mt-1 text-card text-vexo-muted">{hint}</p>}
    </div>
  );
}
