const LABELS: Record<string, string> = {
  NEW: "Novo contato",
  IN_CONVERSATION: "Em conversa",
  SCHEDULED: "Agendado",
  FOLLOW_UP: "Follow-up",
  LOST: "Perdido",
  NEEDS_HUMAN: "Precisa de humano",
};

// "Info" (NEW) reaproveita a cor de marca (vexo-accent) — já era praticamente
// a mesma cor antes de virar variável, então vira uma cor só.
const COLORS: Record<string, string> = {
  NEW: "bg-vexo-accent/15 text-vexo-accent border-vexo-accent/30",
  IN_CONVERSATION: "bg-vexo-accent/15 text-vexo-accent border-vexo-accent/30",
  SCHEDULED: "bg-vexo-success/15 text-vexo-success border-vexo-success/30",
  FOLLOW_UP: "bg-vexo-warning/15 text-vexo-warning border-vexo-warning/30",
  LOST: "bg-vexo-muted/15 text-vexo-muted border-vexo-border",
  NEEDS_HUMAN: "bg-vexo-error/15 text-vexo-error border-vexo-error/30",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${COLORS[status] ?? ""}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {LABELS[status] ?? status}
    </span>
  );
}
