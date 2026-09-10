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
// /80 (não /45 como na 1a versão) — 45% deixava quase sem contraste com o
// fundo do card (bg-vexo-surface, um cinza-azulado quase tão escuro quanto
// os próprios tons de status). Diferença pro Pipeline: lá a tag fica DENTRO
// de um card já tingido (dois tons de cor empilhados = mais presença); aqui
// o card do Agendamento é neutro, então o badge sozinho precisa de mais
// opacidade pra chegar num contraste parecido. Medido: mesmo a 100% de
// opacidade esses tons batem só ~2.5:1 de contraste contra o fundo (são
// tons de CARD do Pipeline, escuros por natureza) — ainda assim "davam
// conta" lá porque tingem uma área grande; 80% aqui fica num meio-termo
// perceptível sem chegar perto do "vibrante" (que seriam as cores
// semânticas cruas, tipo vexo-success/error, states usados na versão NÃO-
// compact acima). Mesmo motivo pro rounded-sm (raio pequeno, não mais
// rounded-card — nesse tamanho de badge, 6px lia como arredondado demais).
//
// bg do "Faltou" (NO_SHOW) é a MESMA cor usada pelo botão "Não compareceu"
// já marcado (ver NoShowButton, também em /80 e rounded-sm) — os dois
// aparecem lado a lado na mesma linha da lista, precisam ficar na mesma
// família de cor E forma. Nenhum dos dois tem borda — pedido explícito: só
// o fundo dessaturado, sem contorno.
function statusTint(status: string): { bg: string; text: string } {
  switch (status) {
    case "SCHEDULED":
    case "CONFIRMED":
      return { bg: "bg-vexo-panelStatusScheduledBg/80", text: "text-vexo-fg" };
    case "COMPLETED":
      return { bg: "bg-vexo-panelStatusCompletedBg/80", text: "text-vexo-fg" };
    case "NO_SHOW":
      return { bg: "bg-vexo-panelStatusNegativeBg/80", text: "text-vexo-fg" };
    default: // CANCELLED e qualquer status futuro sem grupo definido
      return { bg: "bg-vexo-border/60", text: "text-vexo-muted" };
  }
}

export function AppointmentStatusBadge({ status, compact }: { status: string; compact?: boolean }) {
  const label = STATUS_LABELS[status] ?? status;

  if (compact) {
    const tint = statusTint(status);
    return (
      <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-caption font-medium leading-none ${tint.bg} ${tint.text}`}>
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
