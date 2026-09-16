import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";

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
// os dois ConnectionLink do bundle foram criados no banco.
const BUNDLE_CHANNEL_ORDER = ["instagram", "google-calendar"] as const;

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
// onboarding remoto de cliente real que nunca acessa o CRM) mostra os DOIS
// canais na mesma página, cada um com seu próprio status — o cliente
// conecta um, volta pra cá automaticamente (o callback OAuth redireciona
// de volta pro bundle, não pra tela de sucesso terminal — ver comentário
// nos callbacks), e conecta o outro em seguida.
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
  const allDone = channelLinks.every((c) => c.link?.usedAt);

  return (
    <Shell>
      {bundle.clinic.name && (
        <p className="mb-4 text-sm text-vexo-muted">
          Conectando a conta de <span className="text-vexo-fg">{bundle.clinic.name}</span>
        </p>
      )}

      <h2 className="text-base font-semibold">Conectar Instagram + Google Calendar</h2>
      <p className="mt-2 text-sm text-vexo-muted">
        {allDone
          ? "Tudo conectado! Pode fechar esta página."
          : "Conecte as duas contas abaixo, uma de cada vez — a página atualiza sozinha depois de cada uma."}
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
      </div>
    </Shell>
  );
}
