import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createFirstAdmin } from "./actions";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const tokenConfigured = Boolean(process.env.ADMIN_SETUP_TOKEN);
  const existingAdmin = tokenConfigured
    ? await prisma.user.findFirst({ where: { role: "INTERNAL_ADMIN" } })
    : null;

  const blocked = !tokenConfigured || Boolean(existingAdmin);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-xl bg-vexo-accent" />
          <h1 className="text-2xl font-semibold tracking-tight">VEXO</h1>
          <p className="mt-1 text-sm text-vexo-muted">Configuração inicial</p>
        </div>

        {blocked ? (
          <div className="rounded-2xl border border-vexo-border bg-vexo-surface p-6 text-sm text-vexo-muted">
            {existingAdmin ? (
              <>
                <p>Já existe um administrador cadastrado nesta instância.</p>
                <Link href="/login" className="mt-3 inline-block text-vexo-accent hover:underline">
                  Ir para o login
                </Link>
              </>
            ) : (
              <p>
                Esta tela está desabilitada porque a variável{" "}
                <code className="rounded bg-vexo-bg px-1 py-0.5 text-xs">ADMIN_SETUP_TOKEN</code>{" "}
                não está configurada no ambiente. Configure-a no Railway (Settings → Variables do
                serviço <code className="rounded bg-vexo-bg px-1 py-0.5 text-xs">web</code>) e
                recarregue esta página.
              </p>
            )}
          </div>
        ) : (
          <form
            action={createFirstAdmin}
            className="space-y-4 rounded-2xl border border-vexo-border bg-vexo-surface p-6 shadow-xl"
          >
            <p className="text-sm text-vexo-muted">
              Cria o primeiro usuário administrador do CRM interno. Essa tela se desabilita
              automaticamente assim que o admin for criado.
            </p>

            <div>
              <label className="mb-1.5 block text-sm text-vexo-muted" htmlFor="name">
                Nome
              </label>
              <input
                id="name"
                name="name"
                required
                className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-vexo-muted" htmlFor="email">
                E-mail
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-vexo-muted" htmlFor="password">
                Senha (mín. 8 caracteres)
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm text-vexo-muted" htmlFor="setupToken">
                Token de configuração
              </label>
              <input
                id="setupToken"
                name="setupToken"
                type="password"
                required
                className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent"
              />
              <p className="mt-1 text-xs text-vexo-muted">
                O valor de <code>ADMIN_SETUP_TOKEN</code> configurado no Railway.
              </p>
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-vexo-accent px-3 py-2 text-sm font-medium text-white transition hover:opacity-90"
            >
              Criar administrador
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
