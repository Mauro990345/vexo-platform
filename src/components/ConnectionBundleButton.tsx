"use client";

import { useEffect, useState } from "react";
import { createConnectionBundle, cancelConnectionBundle } from "@/app/crm/clinicas/actions";

// Igual a ConnectionLinkButton (mesmo padrão de clipboard-dentro-do-gesto-
// de-clique, mesmo toast, mesmo botão vira "Cancelar" com link pendente),
// só que gera o link COMBINADO (Instagram + Google Calendar numa página só
// — ver createConnectionBundle e /conectar/[token]/page.tsx) em vez de um
// link por canal. Pensado pro onboarding de cliente real que nunca acessa
// o CRM: um link só pra mandar, em vez de dois.
export function ConnectionBundleButton({
  clinicId,
  pendingToken,
}: {
  clinicId: string;
  pendingToken: string | null;
}) {
  const [token, setToken] = useState(pendingToken);
  const [pending, setPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => setToken(pendingToken), [pendingToken]);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2800);
  }

  async function handleConnect() {
    setPending(true);

    const newTab = window.open("", "_blank");
    let created: { token: string; url: string } | null = null;

    const textPromise = createConnectionBundle(clinicId).then((result) => {
      created = result;
      return result.url;
    });

    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({ "text/plain": textPromise.then((url) => new Blob([url], { type: "text/plain" })) }),
        ]);
      } else {
        const url = await textPromise;
        await navigator.clipboard.writeText(url);
      }
      setToken(created!.token);
      if (newTab) newTab.location.href = created!.url;
      showToast("Link copiado! Envie para o cliente.");
    } catch {
      if (created) {
        setToken((created as { token: string }).token);
        if (newTab) newTab.location.href = (created as { url: string }).url;
        showToast("Link gerado, mas não deu pra copiar automaticamente.");
      } else {
        newTab?.close();
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
      await cancelConnectionBundle(clinicId, token);
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
          className="rounded-lg border border-vexo-error/40 px-2.5 py-1.5 text-xs font-medium text-vexo-error hover:bg-vexo-error/10 disabled:opacity-50"
        >
          Cancelar link combinado
        </button>
      ) : (
        <button
          type="button"
          onClick={handleConnect}
          disabled={pending}
          className="rounded-lg bg-vexo-accent px-2.5 py-1.5 text-xs font-medium text-vexo-accentFg hover:opacity-90 disabled:opacity-50"
        >
          Gerar link combinado (Instagram + Google Calendar)
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
