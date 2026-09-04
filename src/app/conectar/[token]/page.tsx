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

// Página pública de auto-conexão — SEM sessão/login do CRM, por design:
// fica fora da árvore /crm (que é protegida inteira por requireInternalSession
// em crm/layout.tsx), então não passa por nenhum gate de autenticação.
// O token do ConnectionLink (não o id real da clínica) é o único jeito de
// chegar aqui — ver src/app/crm/clinicas/actions.ts (createConnectionLink)
// pra como o link é gerado, e src/lib/oauth-state.ts pra como ele viaja
// junto do fluxo OAuth até o callback marcar usedAt. Um link é sempre de
// UM canal só (WhatsApp fica de fora, tem QR code próprio) — o texto/botão
// aqui é resolvido a partir de link.channel.
export default async function ConectarPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { status?: string };
}) {
  const link = await prisma.connectionLink.findUnique({
    where: { token: params.token },
    include: { clinic: { select: { name: true } } },
  });

  const invalid = !link || Boolean(link.usedAt) || link.expiresAt < new Date();
  const copy = link ? CHANNEL_COPY[link.channel as keyof typeof CHANNEL_COPY] : undefined;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-xl bg-vexo-accent" />
          <h1 className="text-2xl font-semibold tracking-tight">VEXO</h1>
          <p className="mt-1 text-sm text-vexo-muted">M8 Growth</p>
        </div>

        <div className="rounded-2xl border border-vexo-border bg-vexo-surface p-6 text-center shadow-xl">
          {invalid || !copy ? (
            <>
              <h2 className="text-base font-semibold">Link inválido ou expirado</h2>
              <p className="mt-2 text-sm text-vexo-muted">
                Peça um novo link de conexão ao M8 Growth.
              </p>
            </>
          ) : (
            <>
              {link.clinic.name && (
                <p className="mb-4 text-sm text-vexo-muted">
                  Conectando a conta de <span className="text-vexo-fg">{link.clinic.name}</span>
                </p>
              )}

              <h2 className="text-base font-semibold">{copy.title}</h2>
              <p className="mt-2 text-sm text-vexo-muted">{copy.description}</p>

              {searchParams.status === "erro" && (
                <p className="mt-4 rounded-lg border border-vexo-error/30 bg-vexo-error/10 p-2 text-xs text-vexo-error">
                  Falha ao conectar. Tente novamente.
                </p>
              )}

              <a
                href={`${copy.startRoute}?token=${link.token}`}
                className="mt-5 block w-full rounded-lg bg-vexo-accent px-3 py-2 text-sm font-medium text-vexo-accentFg transition hover:opacity-90"
              >
                {copy.title}
              </a>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
