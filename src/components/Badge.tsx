import type { ReactNode } from "react";

// Componente base novo (Etapa 2 da migração de design, ver DESIGN.md e
// docs/design-audit.md) — pensado pra, no futuro, unificar o que hoje
// está espalhado em StatusBadge.tsx/AppointmentStatusBadge.tsx/
// PanelCardBadge.tsx (3-4 implementações separadas da mesma ideia visual,
// ver auditoria). NENHUM dos três foi tocado nesta etapa — continuam
// exatamente como estão, sem quebrar quem os usa; este é só o primitivo
// novo, ainda sem nenhuma tela consumindo. Reproduz o padrão mais comum
// hoje (StatusBadge.tsx): pílula com borda, bolinha de cor + texto —
// mesmas 5 famílias de cor semântica já usadas (accent/success/error/
// warning/muted), nunca uma cor nova.
export type BadgeVariant = "accent" | "success" | "error" | "warning" | "muted";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  accent: "bg-vexo-accent/15 text-vexo-accent border-vexo-accent/30",
  success: "bg-vexo-success/15 text-vexo-success border-vexo-success/30",
  error: "bg-vexo-error/15 text-vexo-error border-vexo-error/30",
  warning: "bg-vexo-warning/15 text-vexo-warning border-vexo-warning/30",
  muted: "bg-vexo-muted/15 text-vexo-muted border-vexo-border",
};

export function Badge({
  variant = "muted",
  dot = true,
  className = "",
  children,
}: {
  variant?: BadgeVariant;
  // Bolinha de cor antes do texto (ver StatusBadge.tsx) — desliga pra um
  // rótulo só de texto, sem indicador.
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${VARIANT_CLASSES[variant]} ${className}`}>
      {dot && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
}
