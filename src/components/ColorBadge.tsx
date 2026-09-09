// Selo com fundo colorido translúcido (baixa opacidade, mistura com o
// fundo escuro do card) + conteúdo (ícone ou iniciais) na mesma cor mais
// saturada — usado tanto nos ícones dos cards de métrica do Pipeline
// quanto no avatar de iniciais dos cards de lead, pra manter o mesmo
// padrão visual nos dois lugares em vez de duas receitas diferentes.
export type BadgeColor = "accent" | "success" | "warning" | "error";

// Chaves fixas (não construídas por template string) pro Tailwind JIT
// conseguir achar essas classes por análise estática — mesma razão do
// RING_STROKE em ResponseRateRing.tsx.
const BADGE_STYLE: Record<BadgeColor, string> = {
  accent: "bg-vexo-accent/15 text-vexo-accent",
  success: "bg-vexo-success/15 text-vexo-success",
  warning: "bg-vexo-warning/15 text-vexo-warning",
  error: "bg-vexo-error/15 text-vexo-error",
};

export function ColorBadge({
  color,
  shape = "square",
  size = "h-7 w-7",
  className = "",
  children,
}: {
  color: BadgeColor;
  shape?: "square" | "circle";
  size?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`flex shrink-0 items-center justify-center ${shape === "circle" ? "rounded-full" : "rounded-lg"} ${size} ${BADGE_STYLE[color]} ${className}`}
    >
      {children}
    </div>
  );
}
