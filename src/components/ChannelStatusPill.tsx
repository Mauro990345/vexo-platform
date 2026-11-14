import { MOBILE_STATUS_BADGE_SIZE, MOBILE_STATUS_DOT_SIZE } from "@/components/MobileCardScale";

// Selo de canal do Painel do cliente — ícone da marca (mesmas cores já
// usadas em Conexões: rosa/Instagram, azul/Google Calendar, verde/
// WhatsApp, ver clinicas/[id]/conexoes/page.tsx) com um ponto de status no
// canto, em vez da bolinha cinza genérica + texto de antes. Desconectado
// esmaece o badge inteiro (ícone + fundo); o ponto no canto é quem
// realmente comunica o estado (verde conectado / apagado não conectado).
// Não faz nenhuma checagem própria — recebe connected já resolvido pela
// página, mesma lógica de status já usada em Conexões.
//
// needsReconnect (pedido explícito): token morreu de verdade (ver
// InstagramAccount.needsReconnectAt/GoogleCalendarAccount.needsReconnectAt)
// — a linha continua existindo (connected fica true), mas o canal não
// funciona mais até reconectar. Terceiro estado visual (ponto âmbar, nunca
// esmaecido) em vez de só "conectado"/"não conectado" — antes disso, um
// token vencido aparecia exatamente igual a um canal saudável no Painel,
// único lugar onde a secretária/clínica realmente olha com frequência (ver
// bug real: a conexão da Clínica Demo venceu e nada aqui avisou).
//
// SÓ CELULAR (abaixo de sm/640px — pedido explícito, fator 1,45 sobre os
// valores de desktop, ver MobileCardScale.ts): badge 24px -> 36px (piso
// de toque pedido pros 3 ícones de status da clínica), pontinho de status
// 8px -> 12px. `sm:` com os valores de sempre — em tablet/notebook/
// desktop fica idêntico a antes.
export function ChannelStatusPill({
  connected,
  needsReconnect = false,
  label,
  icon,
  iconBg,
}: {
  connected: boolean;
  needsReconnect?: boolean;
  label: string;
  icon: React.ReactNode;
  iconBg: string;
}) {
  const statusLabel = needsReconnect ? "precisa reconectar" : connected ? "conectado" : "não conectado";
  return (
    <span
      className={`relative inline-flex ${MOBILE_STATUS_BADGE_SIZE} shrink-0 items-center justify-center rounded-md text-white transition ${iconBg} ${
        connected && !needsReconnect ? "" : "opacity-40"
      }`}
      title={`${label} ${statusLabel}`}
      aria-label={`${label} ${statusLabel}`}
    >
      {icon}
      <span
        className={`absolute -right-0.5 -top-0.5 ${MOBILE_STATUS_DOT_SIZE} rounded-full ring-2 ring-vexo-surface ${
          needsReconnect ? "bg-vexo-warning" : connected ? "bg-vexo-success" : "bg-vexo-muted"
        }`}
      />
    </span>
  );
}
