import Link from "next/link";
import { notFound } from "next/navigation";
import { Calendar } from "lucide-react";
import { InstagramGlyphIcon, WhatsAppGlyphIcon } from "@/components/BrandIcons";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { refreshWhatsappStatus, type WhatsappConnectionState } from "@/lib/whatsapp-connection";
import { ConnectOAuthButton } from "@/components/ConnectOAuthButton";
import { RefreshOnFocus } from "@/components/RefreshOnFocus";
import { ConnectionLinkButton } from "@/components/ConnectionLinkButton";
import { ConnectionBundleButton } from "@/components/ConnectionBundleButton";
import { disconnectGoogleCalendarAction, disconnectInstagramAction, disconnectWhatsappAction } from "../../actions";

export const dynamic = "force-dynamic";

const WHATSAPP_STATUS_LABELS: Record<WhatsappConnectionState, string> = {
  open: "Conectado",
  connecting: "Conectando…",
  close: "Não conectado",
  unknown: "Status desconhecido",
};

const WHATSAPP_STATUS_DOT: Record<WhatsappConnectionState, string> = {
  open: "bg-vexo-success",
  connecting: "bg-vexo-warning",
  close: "bg-vexo-muted",
  unknown: "bg-vexo-muted",
};

// Card compacto, SEMPRE 3 colunas lado a lado (inclusive no celular — grid
// de largura fixa, sem empilhar em telas estreitas, pedido explícito pro
// vídeo de revisão da Meta): ícone+nome, 1 frase curta, e por fim uma linha
// só com o status (bolinha + texto) à ESQUERDA e o botão à DIREITA — nunca
// o botão centralizado embaixo (era a versão antiga, "chapada"). Mesmo
// acabamento dos cards do Painel do cliente: `rounded-control` (8px),
// borda `vexo-border` bem sutil, fundo `vexo-surface` (ver
// PanelAppointmentsColumn.tsx). O card em si não é clicável — só o botão.
//
// 3 estados, os 3 canais no MESMO padrão (Instagram, Google Calendar e
// WhatsApp, os três com disconnectAction): não conectado sem link →
// "Conectar"; não conectado com link pendente → "Cancelar" (Instagram/
// Google, via ConnectionLinkButton — WhatsApp não tem link, só leva pra
// tela própria do QR code); conectado → SÓ "Desconectar", nunca os dois
// juntos.
function ConnectionCard({
  icon,
  iconBg,
  name,
  description,
  connected,
  statusLabel,
  statusDot,
  href,
  disconnectAction,
  notConnectedAction,
  reconnectAction,
}: {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  description: string;
  connected: boolean;
  statusLabel: string;
  statusDot: string;
  // Usado só pelo botão "Conectar" padrão (sem notConnectedAction) — hoje
  // só o caso do WhatsApp, que leva direto pra tela própria do QR code.
  href: string;
  // Os 3 canais desconectam pelo VEXO (nunca mais "Gerenciar") — conectado
  // mostra SEMPRE "Desconectar", nunca os dois juntos.
  disconnectAction: () => Promise<void>;
  // Substitui o botão padrão de "Conectar" só quando não conectado — usado
  // por Instagram e Google Calendar (ver ConnectionLinkButton). Ausente pro
  // WhatsApp, que continua com o link direto pra tela do QR code.
  notConnectedAction?: React.ReactNode;
  // Token vencido/sessão expirada (ver instagramNeedsReconnect/
  // googleNeedsReconnect, abaixo) — "Desconectar" sozinho não resolve nada
  // (só apaga a linha, sem gerar OAuth novo); precisa do mesmo fluxo de
  // "Conectar" de novo, no lugar do "Desconectar" (nunca os dois juntos).
  reconnectAction?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-control border border-vexo-border bg-vexo-surface p-2.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-control ${iconBg} text-white`}>
          {icon}
        </span>
        {/* Sem truncate: "Google Calendar" não cabe inteiro na largura do
            card no celular — melhor quebrar em 2 linhas (nome completo
            visível) do que cortar com reticências. */}
        <p className="min-w-0 text-xs font-bold leading-tight">{name}</p>
      </div>

      <p className="text-card leading-snug text-vexo-muted">{description}</p>

      {/* Indicador à esquerda, botão à direita, na MESMA linha — card baixo
          e compacto, nunca o botão centralizado embaixo. `flex-wrap` +
          `ml-auto` no botão: nos canais com texto curto (Instagram,
          WhatsApp conectados) sempre cabe tudo numa linha só; nos combos
          mais largos ("Não conectado"/"Reconexão necessária" + botão, no
          celular) o botão desce pra uma 2ª linha, ainda encostado na
          direita. Sem truncate no status — nunca esconde nem corta o
          texto, só deixa o rótulo quebrar linha quando precisar. */}
      <div className="mt-auto flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-1">
        <div className="flex min-w-0 max-w-full items-center gap-1 text-card text-vexo-muted">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`} />
          <span className="min-w-0">{statusLabel}</span>
        </div>

        <div className="ml-auto shrink-0">
          {reconnectAction
            ? reconnectAction
            : connected
              ? (
                  <form action={disconnectAction}>
                    <button
                      type="submit"
                      className="rounded-control border border-vexo-error/40 px-1.5 py-1 text-card font-medium text-vexo-error hover:bg-vexo-error/10"
                    >
                      Desconectar
                    </button>
                  </form>
                )
              : notConnectedAction
                ? notConnectedAction
                : (
                    <Link
                      href={href}
                      className="rounded-control border border-vexo-accent px-1.5 py-1 text-card font-medium text-vexo-accent hover:bg-vexo-accent/10"
                    >
                      Conectar
                    </Link>
                  )}
        </div>
      </div>
    </div>
  );
}

const CHANNEL_NAMES: Record<string, string> = {
  instagram: "Instagram",
  "google-calendar": "Google Calendar",
};

export default async function ClinicConexoesPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { status?: string; channel?: string; reason?: string };
}) {
  await requireInternalSession();

  const clinic = await prisma.clinic.findUnique({
    where: { id: params.id },
    include: { instagramAccount: true, googleCalendarAccount: true },
  });
  if (!clinic) notFound();

  let whatsappStatus: WhatsappConnectionState = "unknown";
  try {
    whatsappStatus = await refreshWhatsappStatus(clinic.id);
  } catch {
    whatsappStatus = "unknown";
  }

  const base = `/crm/clinicas/${clinic.id}`;
  const instagramConnected = Boolean(clinic.instagramAccount);
  // Token de longa duração vencido/sessão expirada (ver
  // markInstagramNeedsReconnectByIgUserId, instagram.ts, e o renovador
  // diário em instagram-token-refresh.ts) — a linha continua existindo
  // (instagramConnected fica true), mas o token morreu de verdade; só
  // reconectar de novo (novo OAuth) limpa isto. Mesmo padrão exato do
  // Google Calendar (googleNeedsReconnect, abaixo).
  const instagramNeedsReconnect = Boolean(clinic.instagramAccount?.needsReconnectAt);
  const googleConnected = Boolean(clinic.googleCalendarAccount);
  // invalid_grant detectado em qualquer chamada ao Google (ver
  // markGoogleCalendarNeedsReconnect, src/lib/google-calendar.ts) — a
  // linha continua existindo (googleConnected fica true), mas o token
  // morreu de verdade; só reconectar de novo (novo OAuth) limpa isto.
  const googleNeedsReconnect = Boolean(clinic.googleCalendarAccount?.needsReconnectAt);

  // Link pendente (não usado, não expirado) por canal — se existir, o card
  // correspondente mostra "Cancelar" no lugar de "Conectar" (ver
  // ConnectionLinkButton). Um por canal, não compartilhado.
  const [pendingInstagramLink, pendingGoogleLink] = await Promise.all([
    instagramConnected
      ? null
      : prisma.connectionLink.findFirst({
          where: { clinicId: clinic.id, channel: "instagram", usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          select: { token: true },
        }),
    googleConnected
      ? null
      : prisma.connectionLink.findFirst({
          where: { clinicId: clinic.id, channel: "google-calendar", usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: "desc" },
          select: { token: true },
        }),
  ]);

  // Link combinado (Instagram + Google Calendar numa página só) — só faz
  // sentido oferecer enquanto pelo menos um dos dois ainda não está
  // conectado; com os dois já conectados, não tem mais o que combinar.
  const bothChannelsConnected = instagramConnected && googleConnected;
  const pendingBundle = bothChannelsConnected
    ? null
    : await prisma.connectionBundle.findFirst({
        where: { clinicId: clinic.id, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: { token: true },
      });

  return (
    <div className="space-y-3">
      <RefreshOnFocus />

      <h1 className="text-base font-semibold tracking-tight">Conexões</h1>

      {searchParams.status === "erro" && (
        <p className="rounded-lg border border-vexo-error/30 bg-vexo-error/10 p-2 text-xs text-vexo-error">
          {/* reason vem do callback OAuth (ver instagram/callback/route.ts)
              com o motivo exato que o Instagram/Facebook devolveu — cai pro
              texto genérico de sempre quando ausente (ex: falha vinda do
              Google Calendar, que ainda não repassa reason). */}
          Não foi possível conectar{searchParams.channel ? ` o ${CHANNEL_NAMES[searchParams.channel] ?? searchParams.channel}` : ""}
          {searchParams.reason ? `: ${searchParams.reason.replace(/\.+$/, "")}.` : "."} Tente novamente
          clicando em &quot;Conectar&quot; abaixo.
        </p>
      )}

      {instagramNeedsReconnect && (
        <p className="rounded-lg border border-vexo-warning/30 bg-vexo-warning/10 p-2 text-xs text-vexo-warning">
          O Instagram desta clínica precisa reconectar — o token de acesso venceu (ou a Meta recusou a última
          renovação automática) e a IA parou de conseguir enviar mensagens por este canal.
          {clinic.instagramAccount!.needsReconnectReason && (
            <>
              {" "}
              <span className="font-mono">{clinic.instagramAccount!.needsReconnectReason}</span>
            </>
          )}{" "}
          Clique em &quot;Reconectar&quot; no card do Instagram abaixo.
        </p>
      )}

      {!bothChannelsConnected && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-vexo-border bg-vexo-surface p-3.5">
          <div>
            <p className="text-sm font-semibold">Onboarding remoto do cliente</p>
            <p className="mt-0.5 text-xs text-vexo-muted">
              Um link só, pro cliente conectar Instagram e Google Calendar na mesma página, sem
              precisar de acesso ao CRM.
            </p>
          </div>
          <ConnectionBundleButton clinicId={clinic.id} pendingToken={pendingBundle?.token ?? null} />
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <ConnectionCard
          icon={<WhatsAppGlyphIcon className="h-5 w-5" />}
          iconBg=""
          name="WhatsApp"
          description="Avisa a secretária sobre atendimento humano."
          connected={whatsappStatus === "open"}
          statusLabel={WHATSAPP_STATUS_LABELS[whatsappStatus]}
          statusDot={WHATSAPP_STATUS_DOT[whatsappStatus]}
          href={`${base}/whatsapp`}
          disconnectAction={disconnectWhatsappAction.bind(null, clinic.id)}
        />
        <ConnectionCard
          icon={<InstagramGlyphIcon className="h-5 w-5" />}
          iconBg=""
          name="Instagram"
          description="Responde o Direct com a IA."
          connected={instagramConnected}
          statusLabel={instagramNeedsReconnect ? "Reconexão necessária" : instagramConnected ? "Conectado" : "Não conectado"}
          statusDot={instagramNeedsReconnect ? "bg-vexo-warning" : instagramConnected ? "bg-vexo-success" : "bg-vexo-muted"}
          href={`/api/oauth/instagram/start?clinicId=${clinic.id}`}
          disconnectAction={disconnectInstagramAction.bind(null, clinic.id)}
          notConnectedAction={
            <ConnectionLinkButton clinicId={clinic.id} channel="instagram" pendingToken={pendingInstagramLink?.token ?? null} />
          }
          reconnectAction={
            instagramNeedsReconnect ? (
              <ConnectOAuthButton href={`/api/oauth/instagram/start?clinicId=${clinic.id}`} label="Reconectar" />
            ) : undefined
          }
        />
        <ConnectionCard
          icon={<Calendar className="h-3 w-3" strokeWidth={2} />}
          iconBg="bg-blue-500"
          name="Google Calendar"
          description="Agenda consultas automaticamente pela IA."
          connected={googleConnected}
          statusLabel={googleNeedsReconnect ? "Reconexão necessária" : googleConnected ? "Conectado" : "Não conectado"}
          statusDot={googleNeedsReconnect ? "bg-vexo-warning" : googleConnected ? "bg-vexo-success" : "bg-vexo-muted"}
          href={`/api/oauth/google-calendar/start?clinicId=${clinic.id}`}
          disconnectAction={disconnectGoogleCalendarAction.bind(null, clinic.id)}
          notConnectedAction={
            <ConnectionLinkButton clinicId={clinic.id} channel="google-calendar" pendingToken={pendingGoogleLink?.token ?? null} />
          }
          reconnectAction={
            googleNeedsReconnect ? (
              <ConnectOAuthButton href={`/api/oauth/google-calendar/start?clinicId=${clinic.id}`} label="Reconectar" />
            ) : undefined
          }
        />
      </div>
    </div>
  );
}
