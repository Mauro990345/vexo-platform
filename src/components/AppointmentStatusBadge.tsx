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

export function AppointmentStatusBadge({ status }: { status: string }) {
  const classes = STATUS_CLASSES[status] ?? "border-vexo-border text-vexo-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${classes}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
