export const dynamic = "force-dynamic";

// Tela final do fluxo público de auto-conexão (ver conectar/[token]/page.tsx)
// — o callback OAuth redireciona pra cá depois de marcar o ConnectionLink
// como usado (usedAt), então voltar em /conectar/[token] a partir daqui já
// mostra "link inválido" corretamente (não reutilizável).
export default function ConectarSucessoPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-xl bg-vexo-accent" />
          <h1 className="text-2xl font-semibold tracking-tight">VEXO</h1>
          <p className="mt-1 text-sm text-vexo-muted">M8 Growth</p>
        </div>

        <div className="rounded-2xl border border-vexo-border bg-vexo-surface p-6 text-center shadow-xl">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-vexo-success/15 text-vexo-success">
            ✓
          </div>
          <h2 className="text-base font-semibold">Conectado com sucesso!</h2>
          <p className="mt-2 text-sm text-vexo-muted">
            O Google Calendar já está conectado. Pode fechar esta página.
          </p>
        </div>
      </div>
    </main>
  );
}
