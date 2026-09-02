const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  COMPLETED: "Compareceu",
  NO_SHOW: "Faltou",
  CANCELLED: "Cancelado",
};

// Cores próprias (não reaproveita StatusBadge — aquele componente é pro
// enum de status da CONVERSA, um domínio diferente de AppointmentStatus).
const STATUS_CLASSES: Record<string, string> = {
  SCHEDULED: "border-emerald-500/30 text-emerald-300",
  CONFIRMED: "border-emerald-500/30 text-emerald-300",
  COMPLETED: "border-vexo-accent/30 text-vexo-accent",
  NO_SHOW: "border-red-500/30 text-red-300",
  CANCELLED: "border-vexo-border text-vexo-muted",
};

// Mesmo mapeamento de status, mas pra borda sólida à esquerda do card (ver
// Agenda) — cor cheia em vez de translúcida, pra ficar visível como uma
// faixa de identificação, não como badge.
const STATUS_BORDER_CLASSES: Record<string, string> = {
  SCHEDULED: "border-l-emerald-400",
  CONFIRMED: "border-l-emerald-400",
  COMPLETED: "border-l-vexo-accent",
  NO_SHOW: "border-l-red-400",
  CANCELLED: "border-l-vexo-muted",
};

export function appointmentStatusBorderClass(status: string): string {
  return STATUS_BORDER_CLASSES[status] ?? "border-l-vexo-muted";
}

export function AppointmentStatusBadge({ status, compact }: { status: string; compact?: boolean }) {
  const classes = STATUS_CLASSES[status] ?? "border-vexo-border text-vexo-muted";
  const label = STATUS_LABELS[status] ?? status;

  if (compact) {
    return <span className={`text-[10px] font-medium leading-none ${classes.split(" ")[1]}`}>{label}</span>;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${classes}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {label}
    </span>
  );
}
