"use client";

import { useEffect, useState } from "react";
import { createConnectionLink, cancelConnectionLink, type ConnectionLinkChannel } from "@/app/crm/clinicas/actions";

// Substitui o botão "Conectar" padrão nos cards de Google Calendar e
// Instagram (WhatsApp fica de fora — já tem fluxo de QR code próprio, ver
// conexoes/page.tsx) — em vez de abrir o OAuth direto pra mim, gera o link
// público de auto-conexão daquele canal e copia pra área de transferência
// na hora, sem expandir o card nem navegar a página. Enquanto o link
// estiver pendente (não usado, não expirado), o botão vira "Cancelar" na
// mesma posição.
export function ConnectionLinkButton({
  clinicId,
  channel,
  pendingToken,
}: {
  clinicId: string;
  channel: ConnectionLinkChannel;
  pendingToken: string | null;
}) {
  const [token, setToken] = useState(pendingToken);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Resincroniza se a página revalidar por fora (ex: RefreshOnFocus depois
  // de o cliente conectar, ou o link expirar naturalmente).
  useEffect(() => setToken(pendingToken), [pendingToken]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2800);
  }

  async function handleConnect() {
    setPending(true);

    let created: { token: string; url: string } | null = null;

    // navigator.clipboard.write PRECISA ser chamado sincronamente dentro do
    // gesto de clique — Safari (e navegadores mais rígidos) invalidam a
    // permissão se ela só rodar depois de um `await` (ex: esperar o
    // servidor gerar o link primeiro). O truque é passar o texto como uma
    // Promise pro ClipboardItem em vez de esperar ela resolver antes de
    // chamar write() — assim o clique nunca perde o "user activation".
    const textPromise = createConnectionLink(clinicId, channel).then((result) => {
      created = result;
      return result.url;
    });

    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ "text/plain": textPromise.then((url) => new Blob([url], { type: "text/plain" })) }),
        ]);
      } else {
        // Fallback pra navegadores sem ClipboardItem — aqui sim perde a
        // garantia do user-activation, mas é o melhor possível sem ele.
        const url = await textPromise;
        await navigator.clipboard.writeText(url);
      }
      setToken(created!.token);
      showToast("Link copiado! Envie para o cliente.");
    } catch {
      // Cobre tanto falha em gerar o link (created continua null) quanto
      // falha só no clipboard (created já preenchido) — sempre com aviso.
      if (created) {
        setToken((created as { token: string }).token);
        showToast("Link gerado, mas não deu pra copiar automaticamente.");
      } else {
        showToast("Falha ao gerar o link. Tente de novo.");
      }
    } finally {
      setPending(false);
    }
  }

  async function handleCancel() {
    if (!token) return;
    setPending(true);
    try {
      await cancelConnectionLink(clinicId, token);
      setToken(null);
    } catch {
      showToast("Falha ao cancelar o link. Tente de novo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {token ? (
        <button
          type="button"
          onClick={handleCancel}
          disabled={pending}
          className="rounded-lg border border-vexo-error/40 px-2.5 py-1 text-card font-medium text-vexo-error hover:bg-vexo-error/10 disabled:opacity-50"
        >
          Cancelar
        </button>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          disabled={pending}
          className="rounded-lg border border-vexo-accent px-2.5 py-1 text-card font-medium text-vexo-accent hover:bg-vexo-accent/10 disabled:opacity-50"
        >
          Conectar
        </button>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-vexo-border bg-vexo-surface px-3 py-2 text-xs shadow-xl">
          {toast}
        </div>
      )}
    </>
  );
}
