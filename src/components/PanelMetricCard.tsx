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
//
// Sem texto auxiliar embaixo do valor (existia um "helper" com a taxa de
// comparecimento — removido de propósito: os 4 cards da grade precisam
// ficar com a mesma altura/largura, e um texto extra só na métrica
// "Compareceram" desalinhava a grade 2x2).
import {
  MOBILE_METRIC_LABEL_TEXT,
  MOBILE_METRIC_VALUE_TEXT,
  MOBILE_METRIC_CARD_PADDING,
  MOBILE_METRIC_VALUE_MARGIN_TOP,
} from "@/components/MobileCardScale";

// SÓ CELULAR (abaixo de sm/640px — pedido explícito, fator 1,45 sobre os
// valores de desktop, ver MobileCardScale.ts): rótulo 10px -> 15px,
// número 24px -> 35px (mínimos do pedido: 14px/32px, o fator já supera os
// dois), padding do card 10px/8px -> 15px/12px. `sm:` com os valores de
// sempre — em tablet/notebook/desktop fica idêntico a antes.
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
    <div className={`rounded-xl border border-vexo-border bg-vexo-surface2 ${MOBILE_METRIC_CARD_PADDING}`}>
      <p className={`truncate ${MOBILE_METRIC_LABEL_TEXT} font-medium uppercase tracking-wide text-vexo-muted`}>{label}</p>
      <p
        className={`${MOBILE_METRIC_VALUE_MARGIN_TOP} ${MOBILE_METRIC_VALUE_TEXT} font-light leading-none tracking-tight ${
          highlight ? "text-vexo-panelHighlight" : "text-vexo-fg"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
