"use client";

// Abre o fluxo de OAuth (Instagram/Google) numa aba nova em vez de navegar
// a aba atual pra fora do CRM — a tela de Conexões continua aberta, e
// RefreshOnFocus (montado na página) atualiza o status quando o usuário
// volta pra essa aba depois de concluir o login no provedor.
export function ConnectOAuthButton({ href, label }: { href: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.open(href, "_blank", "noopener,noreferrer")}
      className="shrink-0 rounded-lg border border-vexo-accent px-2.5 py-1 text-card font-medium text-vexo-accent hover:bg-vexo-accent/10"
    >
      {label}
    </button>
  );
}
