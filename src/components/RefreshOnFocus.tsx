"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Sem componente visível — só re-busca os dados da página (Server
// Component) quando o usuário volta pra essa aba, sem precisar recarregar
// manualmente. Criado pra Conexões: depois que o OAuth do Instagram/Google
// é concluído numa aba nova, voltar pra essa aba dispara o refresh e o
// card atualiza de "Não conectado" pra "Conectado" sozinho.
export function RefreshOnFocus() {
  const router = useRouter();

  useEffect(() => {
    function refresh() {
      if (document.visibilityState === "visible") router.refresh();
    }

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  return null;
}
