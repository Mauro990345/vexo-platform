import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, AtSign, Calendar } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireInternalSession } from "@/lib/session";
import { refreshWhatsappStatus, type WhatsappConnectionState } from "@/lib/whatsapp-connection";
import { ConnectOAuthButton } from "@/components/ConnectOAuthButton";
import { RefreshOnFocus } from "@/components/RefreshOnFocus";
import { ConnectionLinkButton } from "@/components/ConnectionLinkButton";
import {
  disconnectGoogleCalendarAction,
  disconnectInstagramAction,
  resubscribeInstagramWebhookAction,
  checkInstagramWebhookSubscriptionAction,
  setInstagramWebhookIdAction,
  setInstagramAccessTokenAction,
} from "../../actions";

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

// Card compacto no formato de referência (grid 3 colunas): ícone+nome em
// cima, descrição no meio, status + botão na mesma linha embaixo. O card
// em si não é clicável — só o botão.
//
// 3 estados por canal (Instagram e Google Calendar, os dois com
// disconnectAction): não conectado sem link → "Conectar" (gera e copia o
// link, ver ConnectionLinkButton); não conectado com link pendente →
// "Cancelar" (mesmo componente); conectado → SÓ "Desconectar", nunca os
// dois juntos — "Gerenciar" foi removido de propósito, tinha dois botões
// fazendo parecer que existia mais de uma ação possível quando só tem uma.
// WhatsApp fica fora desse padrão: sem disconnectAction, continua com
// "Gerenciar" navegando pra tela própria (QR code), que é uma ação
// diferente (gerenciar =/= desconectar por lá).
function ConnectionCard({
  icon,
  iconBg,
  name,
  description,
  connected,
  statusLabel,
  statusDot,
  href,
  openInNewTab,
  disconnectAction,
  notConnectedAction,
  connectedExtraAction,
}: {
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  description: string;
  connected: boolean;
  statusLabel: string;
  statusDot: string;
  href: string;
  openInNewTab?: boolean;
  // Quando presente, define os canais com desconexão pelo VEXO (Instagram,
  // Google Calendar) — conectado mostra SÓ "Desconectar", nunca "Gerenciar"
  // junto. Ausente (WhatsApp) mantém o "Gerenciar" de sempre.
  disconnectAction?: () => Promise<void>;
  // Substitui o botão padrão de "Conectar" só quando não conectado — usado
  // por Instagram e Google Calendar (ver ConnectionLinkButton). Ausente
  // pro WhatsApp, que continua com o link/botão de sempre.
  notConnectedAction?: React.ReactNode;
  // Ação extra ao lado de "Desconectar", só quando conectado — hoje só o
  // Instagram usa (botão "Reativar webhook", ver resubscribeInstagramWebhookAction).
  connectedExtraAction?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-vexo-border bg-vexo-surface p-3.5">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconBg} text-white`}>
          {icon}
        </span>
        <p className="text-sm font-bold">{name}</p>
      </div>

      <p className="text-xs text-vexo-muted">{description}</p>

      {/* Status e botão na mesma linha, botão à direita — a página real
          (grid-cols-3 sem max-w extra) dá bastante largura por card, cabe
          numa linha só sem truncar. */}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <div className="flex min-w-0 items-center gap-1.5 text-card text-vexo-muted">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot}`} />
          <span className="truncate">{statusLabel}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {connected ? (
            disconnectAction ? (
              <>
                {connectedExtraAction}
                <form action={disconnectAction}>
                  <button
                    type="submit"
                    className="rounded-lg border border-vexo-error/40 px-2.5 py-1 text-card font-medium text-vexo-error hover:bg-vexo-error/10"
                  >
                    Desconectar
                  </button>
                </form>
              </>
            ) : openInNewTab ? (
              <ConnectOAuthButton href={href} label="Gerenciar" />
            ) : (
              <Link
                href={href}
                className="rounded-lg border border-vexo-accent px-2.5 py-1 text-card font-medium text-vexo-accent hover:bg-vexo-accent/10"
              >
                Gerenciar
              </Link>
            )
          ) : notConnectedAction ? (
            notConnectedAction
          ) : openInNewTab ? (
            <ConnectOAuthButton href={href} label="Conectar" />
          ) : (
            <Link
              href={href}
              className="rounded-lg border border-vexo-accent px-2.5 py-1 text-card font-medium text-vexo-accent hover:bg-vexo-accent/10"
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
  searchParams: { status?: string; channel?: string; reason?: string; fields?: string; idFixed?: string };
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
  const googleConnected = Boolean(clinic.googleCalendarAccount);

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

  return (
    <div className="space-y-3">
      <RefreshOnFocus />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight">Conexões</h1>
          <p className="mt-0.5 text-xs text-vexo-muted">
            Canais desta clínica, organizados num só lugar. O status atualiza sozinho conforme cada
            canal conecta ou cai.
          </p>
        </div>
        {/* Diagnóstico temporário (sem acesso a logs do Railway) — ver
            WebhookLog no schema e /api/webhooks/instagram/route.ts, e
            dispatch-status/page.tsx pro envio de mensagens. */}
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-right">
          <Link href="/crm/webhook-logs" className="whitespace-nowrap text-card text-vexo-muted underline hover:text-vexo-fg">
            Logs do webhook (Instagram)
          </Link>
          <Link href="/crm/dispatch-status" className="whitespace-nowrap text-card text-vexo-muted underline hover:text-vexo-fg">
            Envio de mensagens
          </Link>
        </div>
      </div>

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

      {searchParams.status === "webhook-ok" && (
        <p className="rounded-lg border border-vexo-success/30 bg-vexo-success/10 p-2 text-xs text-vexo-success">
          Webhook reativado — o Instagram foi reinscrito e deve voltar a entregar mensagens novas.
          {searchParams.idFixed && (
            <>
              {" "}
              Também corrigido o ID salvo dessa conta, que estava desatualizado e nunca batia com o
              que o webhook manda de verdade: <strong>{searchParams.idFixed}</strong>.
            </>
          )}
        </p>
      )}

      {searchParams.status === "token-ok" && (
        <p className="rounded-lg border border-vexo-success/30 bg-vexo-success/10 p-2 text-xs text-vexo-success">
          Token salvo — próximas chamadas do Instagram pra essa conta já usam esse valor.
        </p>
      )}

      {searchParams.status === "webhook-fields" && (
        <p className="rounded-lg border border-vexo-border bg-vexo-surface p-2 text-xs text-vexo-fg">
          {/* Resposta de verdade da Meta pros campos inscritos AGORA — não
              confundir com "o subscribe retornou sucesso" (ver
              checkInstagramWebhookSubscriptionAction em ../../actions.ts):
              já aconteceu de o POST de subscribe devolver 200 sem
              "messages" acabar na lista de verdade. */}
          Campos inscritos no webhook desta conta: <strong>{searchParams.fields}</strong>
          {!searchParams.fields?.includes("messages") && (
            <span className="text-vexo-error"> — &quot;messages&quot; não está na lista, por isso nada chega.</span>
          )}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3">
        <ConnectionCard
          icon={<MessageCircle className="h-3.5 w-3.5" strokeWidth={2} />}
          iconBg="bg-emerald-500"
          name="WhatsApp"
          description="Notifica a secretária quando um lead precisa de atendimento humano."
          connected={whatsappStatus === "open"}
          statusLabel={WHATSAPP_STATUS_LABELS[whatsappStatus]}
          statusDot={WHATSAPP_STATUS_DOT[whatsappStatus]}
          href={`${base}/whatsapp`}
        />
        <ConnectionCard
          icon={<AtSign className="h-3.5 w-3.5" strokeWidth={2} />}
          iconBg="bg-pink-500"
          name="Instagram"
          description="Captura no Direct e leva a conversa pra IA."
          connected={instagramConnected}
          statusLabel={
            instagramConnected ? `Conectado · @${clinic.instagramAccount!.igUsername ?? "conectado"}` : "Não conectado"
          }
          statusDot={instagramConnected ? "bg-vexo-success" : "bg-vexo-muted"}
          href={`/api/oauth/instagram/start?clinicId=${clinic.id}`}
          openInNewTab
          disconnectAction={disconnectInstagramAction.bind(null, clinic.id)}
          notConnectedAction={
            <ConnectionLinkButton clinicId={clinic.id} channel="instagram" pendingToken={pendingInstagramLink?.token ?? null} />
          }
          connectedExtraAction={
            <>
              <form action={checkInstagramWebhookSubscriptionAction.bind(null, clinic.id)}>
                <button
                  type="submit"
                  title="Consulta na Meta quais campos estão realmente inscritos pra essa conta agora — o subscribe pode retornar sucesso sem 'messages' entrar na lista de verdade."
                  className="rounded-lg border border-vexo-border px-2.5 py-1 text-card font-medium text-vexo-muted hover:bg-vexo-border/30"
                >
                  Ver campos inscritos
                </button>
              </form>
              <form action={resubscribeInstagramWebhookAction.bind(null, clinic.id)}>
                <button
                  type="submit"
                  title="Reinscreve esta conta no webhook de mensagens — use se o Instagram conectou mas nenhuma mensagem chega no VEXO."
                  className="rounded-lg border border-vexo-border px-2.5 py-1 text-card font-medium text-vexo-muted hover:bg-vexo-border/30"
                >
                  Reativar webhook
                </button>
              </form>
            </>
          }
        />
        <ConnectionCard
          icon={<Calendar className="h-3.5 w-3.5" strokeWidth={2} />}
          iconBg="bg-blue-500"
          name="Google Calendar"
          description="IA consulta horários livres e cria os agendamentos."
          connected={googleConnected}
          statusLabel={
            googleConnected
              ? `Conectado · ${clinic.googleCalendarAccount!.googleAccountEmail}`
              : "Não conectado"
          }
          statusDot={googleConnected ? "bg-vexo-success" : "bg-vexo-muted"}
          href={`/api/oauth/google-calendar/start?clinicId=${clinic.id}`}
          openInNewTab
          disconnectAction={disconnectGoogleCalendarAction.bind(null, clinic.id)}
          notConnectedAction={
            <ConnectionLinkButton clinicId={clinic.id} channel="google-calendar" pendingToken={pendingGoogleLink?.token ?? null} />
          }
        />
      </div>

      {instagramConnected && (
        <div className="rounded-xl border border-vexo-border bg-vexo-surface p-3.5 text-xs">
          <p className="font-semibold text-vexo-fg">Corrigir ID do webhook do Instagram (avançado)</p>
          <p className="mt-1 text-vexo-muted">
            Nenhum endpoint de OAuth desse produto devolve o mesmo ID que a Meta manda de verdade
            nos eventos de webhook (entry.id/recipient.id) — o único jeito confiável de saber esse
            valor é vendo um evento real chegar. Se{" "}
            <Link href="/crm/webhook-logs" className="underline hover:text-vexo-fg">
              Logs do webhook
            </Link>{" "}
            mostrar um &quot;Nenhuma InstagramAccount encontrada pra igUserId=...&quot;, cole aqui o
            ID que aparece nessa mensagem (só números).
          </p>
          <form
            action={setInstagramWebhookIdAction.bind(null, clinic.id)}
            className="mt-2 flex flex-wrap items-center gap-2"
          >
            <input
              type="text"
              name="igUserId"
              inputMode="numeric"
              pattern="\d+"
              required
              placeholder="Ex: 17841429744434753"
              defaultValue={clinic.instagramAccount!.igUserId}
              className="w-56 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-card outline-none focus:border-vexo-accent"
            />
            <button
              type="submit"
              className="rounded-lg border border-vexo-accent px-2.5 py-1 font-medium text-vexo-accent hover:bg-vexo-accent/10"
            >
              Salvar ID
            </button>
          </form>
        </div>
      )}

      {instagramConnected && (
        <div className="rounded-xl border border-vexo-border bg-vexo-surface p-3.5 text-xs">
          <p className="font-semibold text-vexo-fg">Colar access token do Instagram manualmente (avançado)</p>
          <p className="mt-1 text-vexo-muted">
            Pra testar com um token gerado direto no Meta for Developers (ex: botão &quot;Generate
            token&quot; ao lado da conta), sem precisar desconectar e refazer o OAuth. O fluxo normal
            continua sendo o botão &quot;Conectar&quot; acima — isso aqui é só pra teste rápido. O
            valor não fica salvo neste campo depois de enviado (nunca é reexibido).
          </p>
          <form
            action={setInstagramAccessTokenAction.bind(null, clinic.id)}
            className="mt-2 flex flex-wrap items-center gap-2"
          >
            <input
              type="password"
              name="accessToken"
              required
              autoComplete="off"
              placeholder="Cole o access token aqui"
              className="w-72 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-card outline-none focus:border-vexo-accent"
            />
            <button
              type="submit"
              className="rounded-lg border border-vexo-accent px-2.5 py-1 font-medium text-vexo-accent hover:bg-vexo-accent/10"
            >
              Salvar token
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
