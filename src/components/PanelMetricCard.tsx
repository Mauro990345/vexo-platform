// Métrica do Painel do cliente — versão com mais contraste de peso entre
// label e valor do que o StatCard genérico (usado em ClinicMetricsCard, no
// CRM interno): label pequeno/com letter-spacing/cor secundária, valor bem
// maior e com peso LEVE (font-light, não bold) — o número precisa ser
// claramente o elemento dominante, sem pesar visualmente. Deliberadamente
// um componente separado (não uma variante do StatCard) pra não arriscar
// mudar a aparência do painel interno de métricas por clínica, que não faz
// parte desse refino.
//
// highlight aplica o tom de destaque próprio do Painel (painel.highlight,
// ver page-style-overrides.ts) só no VALOR — usado com moderação, hoje só
// na métrica "Agendaram" (ver ApproachMetricsToggle).
export function PanelMetricCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-vexo-border bg-vexo-surface2 px-3 py-3">
      <p className="truncate text-caption font-medium uppercase tracking-wide text-vexo-muted">{label}</p>
      <p
        className={`mt-1.5 text-3xl font-light leading-none tracking-tight ${
          highlight ? "text-vexo-panelHighlight" : "text-vexo-fg"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
