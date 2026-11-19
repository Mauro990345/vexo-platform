"use client";

import { useState, useTransition } from "react";
import {
  toggleReviewerActiveAction,
  generateReviewerPasswordAction,
  type ReviewerLoginStatus,
} from "@/app/crm/(global)/reviewer-actions";

// Seção compacta no fim de "Contas" (só INTERNAL_ADMIN — ver page.tsx) pra
// gerenciar o login "Revisor" entregue à Meta no App Review (ver
// UserRole.REVIEWER, DESIGN.md). A senha nova só existe NA TELA desta
// sessão do navegador (estado local, nunca persistida em lugar nenhum) —
// depois de sair desta página, não tem como ver ela de novo; é preciso
// gerar outra.
export function ReviewerLoginSection({ initialStatus }: { initialStatus: ReviewerLoginStatus }) {
  const [status, setStatus] = useState(initialStatus);
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    setError(null);
    startTransition(async () => {
      try {
        const next = await toggleReviewerActiveAction();
        setStatus(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao atualizar o login.");
      }
    });
  }

  function handleGenerate() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      try {
        const { password, status: next } = await generateReviewerPasswordAction();
        setNewPassword(password);
        setStatus(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Falha ao gerar a senha.");
      }
    });
  }

  async function handleCopy() {
    if (!newPassword) return;
    try {
      await navigator.clipboard.writeText(newPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Não deu pra copiar automaticamente — selecione o texto e copie manualmente.");
    }
  }

  return (
    <div className="mt-6 rounded-block border border-vexo-border bg-vexo-surface p-block">
      <h2 className="text-sm font-semibold">Login de revisão</h2>
      <p className="mt-1 text-card text-vexo-muted">
        Login só leitura pra entregar à Meta no App Review — enxerga só a Clínica Demo VEXO (Conexões, Painel e
        Pipeline).
      </p>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-control border border-vexo-border bg-vexo-surface2 px-control-x py-control-y">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{status.email}</p>
          <p className={`mt-0.5 flex items-center gap-1 text-card ${status.active ? "text-vexo-success" : "text-vexo-muted"}`}>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.active ? "bg-vexo-success" : "bg-vexo-muted"}`} />
            {status.exists ? (status.active ? "Ativo" : "Desativado") : "Ainda não criado"}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {status.exists && (
            <button
              type="button"
              onClick={handleToggle}
              disabled={isPending}
              className="rounded-control border border-vexo-border px-2.5 py-1 text-card font-medium hover:border-vexo-accent disabled:opacity-50"
            >
              {status.active ? "Desativar" : "Ativar"}
            </button>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isPending}
            className="rounded-control bg-vexo-accent px-2.5 py-1 text-card font-medium text-vexo-accentFg hover:opacity-90 disabled:opacity-50"
          >
            Gerar nova senha
          </button>
        </div>
      </div>

      {error && <p className="mt-2 text-card text-vexo-error">{error}</p>}

      {newPassword && (
        <div className="mt-3 rounded-control border border-vexo-accent/40 bg-vexo-accent/10 px-control-x py-control-y">
          <p className="text-card text-vexo-muted">Nova senha — só aparece agora, copie antes de sair desta página:</p>
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
            <code className="min-w-0 flex-1 truncate rounded-control bg-vexo-bg px-2 py-1 text-card">{newPassword}</code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-control border border-vexo-border px-2 py-1 text-card font-medium hover:border-vexo-accent"
            >
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
