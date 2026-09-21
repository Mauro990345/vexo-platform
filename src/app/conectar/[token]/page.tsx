import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import {
  ensureWhatsappQrForClinic,
  refreshWhatsappStatus,
  type WhatsappConnectionState,
} from "@/lib/whatsapp-connection";

export const dynamic = "force-dynamic";

const CHANNEL_COPY = {
  "google-calendar": {
    title: "Conectar Google Calendar",
    description: "Autoriza o VEXO a consultar seus horários livres e criar os agendamentos automaticamente.",
    startRoute: "/api/oauth/google-calendar/public-start",
  },
  instagram: {
    title: "Conectar Instagram",
    description: "Autoriza o VEXO a receber e responder mensagens do Direct pela IA.",
    startRoute: "/api/oauth/instagram/public-start",
  },
} as const;

// Ordem fixa de exibição na página combinada — não depende da ordem em que
// os dois ConnectionLink do bundle foram criados no banco. WhatsApp NÃO
// entra aqui — ao contrário de Instagram/Google Calendar (OAuth, sem
// estado próprio nesta tela: só um botão que redireciona e volta), o
// WhatsApp pareia por QR code (Evolution API) e precisa ser desenhado e
// atualizado na própria página — ver o bloco dedicado logo abaixo, que lê
// o estado direto de bundle.clinicId em vez de um ConnectionLink.
const BUNDLE_CHANNEL_ORDER = ["instagram", "google-calendar"] as const;

const WHATSAPP_COPY = {
  title: "WhatsApp",
  description: "Notifica a secretária quando um lead precisar de atendimento humano.",
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-xl bg-vexo-accent" />
          <h1 className="text-2xl font-semibold tracking-tight">VEXO</h1>
          <p className="mt-1 text-sm text-vexo-muted">M8 Growth</p>
        </div>
        <div className="rounded-2xl border border-vexo-border bg-vexo-surface p-6 text-center shadow-xl">
          {children}
        </div>
      </div>
    </main>
  );
}

function InvalidLink() {
  return (
    <>
      <h2 className="text-base font-semibold">Link inválido ou expirado</h2>
      <p className="mt-2 text-sm text-vexo-muted">Peça um novo link de conexão ao M8 Growth.</p>
    </>
  );
}

// Página pública de auto-conexão — SEM sessão/login do CRM, por design:
// fica fora da árvore /crm (que é protegida inteira por requireInternalSession
// em crm/layout.tsx), então não passa por nenhum gate de autenticação.
// O token (de um ConnectionLink OU de um ConnectionBundle — nunca o id
// real da clínica) é o único jeito de chegar aqui.
//
// Dois formatos de token, mesma URL: um ConnectionLink de canal único (o
// de sempre, ver createConnectionLink em src/app/crm/clinicas/actions.ts)
// mostra só aquele canal; um ConnectionBundle (createConnectionBundle, pro
// onboarding remoto de cliente real que nunca acessa o CRM) mostra os TRÊS
// canais na mesma página (Instagram, Google Calendar, WhatsApp), cada um
// com seu próprio status — o cliente conecta um, volta pra cá
// automaticamente (o callback OAuth redireciona de volta pro bundle, não
// pra tela de sucesso terminal — ver comentário nos callbacks) ou só
// escaneia o QR (WhatsApp, sem OAuth/callback nenhum), e conecta os
// outros em seguida.
export default async function ConectarPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { status?: string; reason?: string };
}) {
  const link = await prisma.connectionLink.findUnique({
    where: { token: params.token },
    include: { clinic: { select: { name: true } } },
  });

  if (link) {
    const invalid = Boolean(link.usedAt) || link.expiresAt < new Date();
    const copy = CHANNEL_COPY[link.channel as keyof typeof CHANNEL_COPY];

    if (invalid || !copy) {
      return (
        <Shell>
          <InvalidLink />
        </Shell>
      );
    }

    return (
      <Shell>
        {link.clinic.name && (
          <p className="mb-4 text-sm text-vexo-muted">
            Conectando a conta de <span className="text-vexo-fg">{link.clinic.name}</span>
          </p>
        )}

        <h2 className="text-base font-semibold">{copy.title}</h2>
        <p className="mt-2 text-sm text-vexo-muted">{copy.description}</p>

        {searchParams.status === "erro" && (
          <p className="mt-4 rounded-lg border border-vexo-error/30 bg-vexo-error/10 p-2 text-xs text-vexo-error">
            Não foi possível conectar
            {searchParams.reason ? `: ${searchParams.reason.replace(/\.+$/, "")}.` : "."} Tente novamente
            pelo botão abaixo.
          </p>
        )}

        <a
          href={`${copy.startRoute}?token=${link.token}`}
          className="mt-5 block w-full rounded-lg bg-vexo-accent px-3 py-2 text-sm font-medium text-vexo-accentFg transition hover:opacity-90"
        >
          {copy.title}
        </a>
      </Shell>
    );
  }

  const bundle = await prisma.connectionBundle.findUnique({
    where: { token: params.token },
    include: { clinic: { select: { name: true } }, links: true },
  });

  if (!bundle || bundle.expiresAt < new Date()) {
    return (
      <Shell>
        <InvalidLink />
      </Shell>
    );
  }

  const channelLinks = BUNDLE_CHANNEL_ORDER.map((channel) => ({
    channel,
    copy: CHANNEL_COPY[channel],
    link: bundle.links.find((l) => l.channel === channel) ?? null,
  }));

  // WhatsApp não usa OAuth (sem callback pra voltar aqui) — pareia por QR
  // code direto na Evolution API, então o estado (conectado ou não, e o QR
  // atual) precisa ser lido e desenhado nesta própria página, em vez de só
  // um botão "Conectar" que redireciona. bundle.clinicId (nunca exposto na
  // URL — só o token do bundle é público) é o mesmo padrão de segurança já
  // usado pelas rotas públicas de OAuth acima: o token é o único jeito de
  // chegar aqui, sem sessão nenhuma do CRM. Mesmas duas chamadas que
  // /crm/clinicas/[id]/whatsapp (tela interna) já faz.
  let whatsappStatus: WhatsappConnectionState = "unknown";
  let whatsappQrBase64: string | null = null;
  let whatsappError: string | null = null;
  try {
    whatsappStatus = await refreshWhatsappStatus(bundle.clinicId);
  } catch (err) {
    whatsappError = err instanceof Error ? err.message : "Erro ao consultar status do WhatsApp.";
  }
  if (whatsappStatus !== "open") {
    try {
      const qr = await ensureWhatsappQrForClinic(bundle.clinicId);
      whatsappQrBase64 = qr.qrBase64;
    } catch (err) {
      whatsappError = whatsappError ?? (err instanceof Error ? err.message : "Erro ao gerar QR code do WhatsApp.");
    }
  }

  const allDone = channelLinks.every((c) => c.link?.usedAt) && whatsappStatus === "open";

  return (
    <Shell>
      {bundle.clinic.name && (
        <p className="mb-4 text-sm text-vexo-muted">
          Conectando a conta de <span className="text-vexo-fg">{bundle.clinic.name}</span>
        </p>
      )}

      <h2 className="text-base font-semibold">Conectar Instagram + Google Calendar + WhatsApp</h2>
      <p className="mt-2 text-sm text-vexo-muted">
        {allDone
          ? "Tudo conectado! Pode fechar esta página."
          : "Conecte as contas abaixo, uma de cada vez — a página atualiza sozinha depois de cada uma."}
      </p>

      {searchParams.status === "erro" && (
        <p className="mt-4 rounded-lg border border-vexo-error/30 bg-vexo-error/10 p-2 text-xs text-vexo-error">
          Não foi possível conectar
          {searchParams.reason ? `: ${searchParams.reason.replace(/\.+$/, "")}.` : "."} Tente novamente
          abaixo.
        </p>
      )}

      <div className="mt-5 space-y-2.5">
        {channelLinks.map(({ channel, copy, link: channelLink }) => {
          const connected = Boolean(channelLink?.usedAt);
          return (
            <div
              key={channel}
              className="flex items-center justify-between gap-3 rounded-lg border border-vexo-border px-3 py-2.5 text-left"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{copy.title.replace("Conectar ", "")}</p>
                <p className="mt-0.5 truncate text-xs text-vexo-muted">{copy.description}</p>
              </div>
              {connected ? (
                <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-vexo-success">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-vexo-success/15">✓</span>
                  Conectado
                </span>
              ) : channelLink ? (
                <a
                  href={`${copy.startRoute}?token=${channelLink.token}`}
                  className="shrink-0 rounded-lg bg-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accentFg transition hover:opacity-90"
                >
                  Conectar
                </a>
              ) : (
                <span className="shrink-0 text-xs text-vexo-muted">Indisponível</span>
              )}
            </div>
          );
        })}

        <div className="rounded-lg border border-vexo-border px-3 py-2.5 text-left">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{WHATSAPP_COPY.title}</p>
              <p className="mt-0.5 truncate text-xs text-vexo-muted">{WHATSAPP_COPY.description}</p>
            </div>
            {whatsappStatus === "open" ? (
              <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-vexo-success">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-vexo-success/15">✓</span>
                Conectado
              </span>
            ) : (
              <span className="shrink-0 text-xs text-vexo-muted">Escaneie o QR</span>
            )}
          </div>

          {whatsappStatus !== "open" && (
            <div className="mt-3 space-y-2 border-t border-vexo-border pt-2.5">
              {whatsappError ? (
                <p className="text-xs text-vexo-error">{whatsappError}</p>
              ) : whatsappQrBase64 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={whatsappQrBase64}
                  alt="QR code do WhatsApp"
                  className="mx-auto h-28 w-28 rounded-lg border border-vexo-border bg-white p-1"
                />
              ) : (
                <p className="text-xs text-vexo-muted">Não foi possível gerar o QR code agora.</p>
              )}
              <p className="text-center text-[11px] leading-normal text-vexo-muted">
                No celular que vai enviar as notificações: WhatsApp → Aparelhos conectados → Conectar um
                aparelho, e escaneie o código acima. Ele expira em segundos — se não der tempo, atualize a
                página.
              </p>
              <a
                href={`/conectar/${bundle.token}`}
                className="block w-full rounded-lg border border-vexo-accent px-2.5 py-1.5 text-center text-xs font-medium text-vexo-accent hover:bg-vexo-accent/10"
              >
                Atualizar / verificar conexão
              </a>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
