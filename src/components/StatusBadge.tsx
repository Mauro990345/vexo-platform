const LABELS: Record<string, string> = {
  NEW: "Novo contato",
  IN_CONVERSATION: "Em conversa",
  SCHEDULED: "Agendado",
  FOLLOW_UP: "Follow-up",
  LOST: "Perdido",
  NEEDS_HUMAN: "Precisa de humano",
};

const COLORS: Record<string, string> = {
  NEW: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  IN_CONVERSATION: "bg-vexo-accent/15 text-vexo-accent border-vexo-accent/30",
  SCHEDULED: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  FOLLOW_UP: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  LOST: "bg-vexo-muted/15 text-vexo-muted border-vexo-border",
  NEEDS_HUMAN: "bg-red-500/15 text-red-300 border-red-500/30",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${COLORS[status] ?? ""}`}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
