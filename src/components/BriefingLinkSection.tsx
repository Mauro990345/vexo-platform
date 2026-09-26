"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { getOrCreateBriefingLink, revokeBriefingLink } from "@/app/crm/clinicas/actions";

type BriefingLink = { token: string; url: string; clientDisplayName: string; clinicDisplayName: string };

// Mesmo padrão do ClientPanelLinkSection: criar (com um pequeno formulário
// antes, pro Mauro informar o nome do cliente e o nome da clínica que
// aparecem no cabeçalho da página pública) e cancelar — sem "regenerar".
export function BriefingLinkSection({
  clinicId,
  initialLink,
  defaultClinicDisplayName,
}: {
  clinicId: string;
  initialLink: BriefingLink | null;
  defaultClinicDisplayName: string;
}) {
  const [link, setLink] = useState<BriefingLink | null>(initialLink);
  const [clientDisplayName, setClientDisplayName] = useState("");
  const [clinicDisplayName, setClinicDisplayName] = useState(defaultClinicDisplayName);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setPending(true);
    setError(null);
    try {
      setLink(await getOrCreateBriefingLink(clinicId, clientDisplayName, clinicDisplayName));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar o link.");
    } finally {
      setPending(false);
    }
  }

  async function handleCancel() {
    if (
      !window.confirm(
        "Cancelar este link de briefing agora — o cliente não consegue mais abrir a página pra responder até você gerar um link novo. As respostas já enviadas continuam salvas. Continuar?"
      )
    ) {
      return;
    }
    setPending(true);
    try {
      await revokeBriefingLink(clinicId);
      setLink(null);
    } finally {
      setPending(false);
    }
  }

  async function handleCopy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // URL já fica visível na tela pra copiar manualmente nesse caso.
    }
  }

  if (link) {
    return (
      <div className="space-y-2 text-xs">
        <p className="text-vexo-muted">
          Enviado pra <span className="text-vexo-fg">{link.clientDisplayName}</span> ·{" "}
          <span className="text-vexo-fg">{link.clinicDisplayName}</span>
        </p>
        <p className="break-all rounded-md border border-vexo-border bg-vexo-bg px-2 py-1.5 text-vexo-muted">
          {link.url}
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={handleCopy}
            disabled={pending}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-vexo-accent px-2.5 py-1.5 font-medium text-vexo-accent hover:bg-vexo-accent/10 disabled:opacity-50"
          >
            {copied ? <Check className="h-3.5 w-3.5" strokeWidth={2} /> : <Copy className="h-3.5 w-3.5" strokeWidth={2} />}
            {copied ? "Copiado!" : "Copiar link"}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={pending}
            className="shrink-0 rounded-lg border border-vexo-error/40 px-2.5 py-1.5 font-medium text-vexo-error hover:bg-vexo-error/10 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      <p className="text-vexo-muted">
        Gere um link público (sem login) com as 7 perguntas de onboarding — o cliente preenche e as
        respostas aparecem aqui.
      </p>
      <input
        type="text"
        value={clientDisplayName}
        onChange={(e) => setClientDisplayName(e.target.value)}
        placeholder="Nome do cliente (ex: Dra. Ana)"
        className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 outline-none focus:border-vexo-accent"
      />
      <input
        type="text"
        value={clinicDisplayName}
        onChange={(e) => setClinicDisplayName(e.target.value)}
        placeholder="Nome da clínica"
        className="w-full rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 outline-none focus:border-vexo-accent"
      />
      {error && <p className="text-vexo-error">{error}</p>}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={pending || !clientDisplayName.trim() || !clinicDisplayName.trim()}
        className="w-full rounded-lg border border-vexo-accent px-2.5 py-1.5 font-medium text-vexo-accent hover:bg-vexo-accent/10 disabled:opacity-50"
      >
        {pending ? "Gerando..." : "Gerar link de briefing"}
      </button>
    </div>
  );
}
