// Selo de canal do Painel do cliente — ícone da marca (mesmas cores já
// usadas em Conexões: rosa/Instagram, azul/Google Calendar, verde/
// WhatsApp, ver clinicas/[id]/conexoes/page.tsx) com um ponto de status no
// canto, em vez da bolinha cinza genérica + texto de antes. Desconectado
// esmaece o badge inteiro (ícone + fundo); o ponto no canto é quem
// realmente comunica o estado (verde conectado / apagado não conectado).
// Não faz nenhuma checagem própria — recebe connected já resolvido pela
// página, mesma lógica de status já usada em Conexões.
export function ChannelStatusPill({
  connected,
  label,
  icon,
  iconBg,
}: {
  connected: boolean;
  label: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  return (
    <span
      className={`relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white transition ${iconBg} ${
        connected ? "" : "opacity-40"
      }`}
      title={`${label} ${connected ? "conectado" : "não conectado"}`}
      aria-label={`${label} ${connected ? "conectado" : "não conectado"}`}
    >
      {icon}
      <span
        className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-vexo-surface ${
          connected ? "bg-vexo-success" : "bg-vexo-muted"
        }`}
      />
    </span>
  );
}
