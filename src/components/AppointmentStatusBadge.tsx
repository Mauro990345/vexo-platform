const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: "Agendado",
  CONFIRMED: "Confirmado",
  COMPLETED: "Compareceu",
  NO_SHOW: "Faltou",
  CANCELLED: "Cancelado",
};

// Cores próprias (não reaproveita StatusBadge — aquele componente é pro
// enum de status da CONVERSA, um domínio diferente de AppointmentStatus).
// Usada só pela versão NÃO-compact (pílula com bolinha, na tela de
// conversa do CRM interno) — cores mais vivas, mas ali é uma tela de uso
// do Mauro, fora do escopo "premium/minimalista" pedido especificamente
// pro Painel do cliente (ver statusTint abaixo, usada só no compact).
const STATUS_CLASSES: Record<string, string> = {
  SCHEDULED: "border-vexo-success/30 text-vexo-success",
  CONFIRMED: "border-vexo-success/30 text-vexo-success",
  COMPLETED: "border-vexo-accent/30 text-vexo-accent",
  NO_SHOW: "border-vexo-error/30 text-vexo-error",
  CANCELLED: "border-vexo-border text-vexo-muted",
};

// Badge tingido/dessaturado, sem borda — mesmo padrão já usado nos cards
// do Pipeline (tom de fundo já escuro aplicado a baixa opacidade + texto
// claro por cima, ver columnTint em clinicas/[id]/page.tsx). Usado só no
// modo compact (lista de Agendamentos do Painel do cliente): a versão não-
// compact continua com STATUS_CLASSES acima, cores mais vivas de propósito
// (tela interna do Mauro, fora do pedido de sutileza do Painel).
//
// bg do "Faltou" (NO_SHOW) é a MESMA cor usada pelo botão "Não compareceu"
// já marcado (ver NoShowButton) — os dois aparecem lado a lado na mesma
// linha da lista, precisam ficar na mesma família de cor. Nenhum dos dois
// tem borda — pedido explícito: só o fundo dessaturado, sem contorno.
function statusTint(status: string): { bg: string; text: string } {
  switch (status) {
    case "SCHEDULED":
    case "CONFIRMED":
      return { bg: "bg-vexo-panelStatusScheduledBg/45", text: "text-vexo-fg" };
    case "COMPLETED":
      return { bg: "bg-vexo-panelStatusCompletedBg/45", text: "text-vexo-fg" };
    case "NO_SHOW":
      return { bg: "bg-vexo-panelStatusNegativeBg/45", text: "text-vexo-fg" };
    default: // CANCELLED e qualquer status futuro sem grupo definido
      return { bg: "bg-vexo-border/60", text: "text-vexo-muted" };
  }
}

export function AppointmentStatusBadge({ status, compact }: { status: string; compact?: boolean }) {
  const label = STATUS_LABELS[status] ?? status;

  if (compact) {
    const tint = statusTint(status);
    return (
      <span className={`inline-flex items-center rounded-card px-1.5 py-0.5 text-caption font-medium leading-none ${tint.bg} ${tint.text}`}>
        {label}
      </span>
    );
  }

  const classes = STATUS_CLASSES[status] ?? "border-vexo-border text-vexo-muted";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${classes}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
      {label}
    </span>
  );
}
