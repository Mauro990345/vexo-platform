// Pill de status de canal — mesmo estilo visual do ConnectionBadge usado no
// CRM interno (ClinicMetricsCard), só que reaproveitado aqui pro Painel do
// cliente. Não faz nenhuma checagem própria: recebe connected já resolvido
// pela página (mesma lógica de status já usada em Conexões).
export function ChannelStatusPill({ connected, label }: { connected: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${
        connected ? "border-vexo-success/30 text-vexo-success" : "border-vexo-border text-vexo-muted"
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${connected ? "bg-vexo-success" : "bg-vexo-muted"}`} />
      {label}
    </span>
  );
}
