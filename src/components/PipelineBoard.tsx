"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { shouldPoll, isInteracting, resolvePipelineUpdate, type PipelineSnapshot } from "@/lib/pipeline-polling";
import { leadDisplayParts } from "@/lib/lead-display";
import { LeadAvatar } from "@/components/LeadAvatar";

const POLL_INTERVAL_MS = 3500;

// Tom compartilhado pela faixa de métricas do topo E pelo cabeçalho de
// cada coluna do board — mesma constante de sempre (ver histórico em
// clinicas/[id]/page.tsx, que até esta rodada tinha todo este JSX — a
// marcação em si não mudou, só passou a viver aqui pra poder ser um
// Client Component com estado/polling).
const PIPELINE_HEADER_BG = "bg-vexo-surface";

function formatPercent(value: number | null): string {
  return value !== null ? `${Math.round(value * 100)}%` : "0%";
}

const PIPELINE_COLUMNS = [
  { status: "NEW", label: "Novo contato" },
  { status: "IN_CONVERSATION", label: "Em conversa" },
  { status: "SCHEDULED", label: "Agendado" },
  { status: "FOLLOW_UP", label: "Follow-up" },
  { status: "NEEDS_HUMAN", label: "Precisa de humano" },
  { status: "LOST", label: "Perdido" },
] as const;

type PipelineStatus = (typeof PIPELINE_COLUMNS)[number]["status"];

function columnTint(status: PipelineStatus): { bg: string; tagBg: string; tagText: string } {
  switch (status) {
    case "NEW":
      return { bg: "bg-vexo-pipelineColNewBg", tagBg: "bg-vexo-pipelineColNewPill/45", tagText: "text-vexo-fg" };
    case "IN_CONVERSATION":
      return {
        bg: "bg-vexo-pipelineColConversationBg",
        tagBg: "bg-vexo-pipelineColConversationPill/45",
        tagText: "text-vexo-fg",
      };
    case "SCHEDULED":
      return {
        bg: "bg-vexo-pipelineColScheduledBg",
        tagBg: "bg-vexo-pipelineColScheduledPill/45",
        tagText: "text-vexo-fg",
      };
    case "FOLLOW_UP":
      return {
        bg: "bg-vexo-pipelineColFollowupBg",
        tagBg: "bg-vexo-pipelineColFollowupPill/45",
        tagText: "text-vexo-fg",
      };
    case "NEEDS_HUMAN":
      return { bg: "bg-vexo-pipelineColOtherBg", tagBg: "bg-vexo-error/30", tagText: "text-vexo-error" };
    case "LOST":
      return { bg: "bg-vexo-pipelineColOtherBg", tagBg: "bg-vexo-border/80", tagText: "text-vexo-muted" };
  }
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

// Lê o estado atual de seleção de texto (sem DOM nenhum fora disto, usado
// só por interactionActive abaixo) — "Range" é um trecho de texto
// selecionado (ex: copiando o nome de um lead); "None"/"Caret" não
// bloqueiam nada.
function currentSelectionType(): "None" | "Caret" | "Range" {
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  return (sel?.type as "None" | "Caret" | "Range" | undefined) ?? "None";
}

// Mantém o Pipeline atualizado sozinho enquanto a aba estiver aberta e
// visível — mesma técnica já usada na tela de conversa (ConversationMessages
// /conversation-polling.ts, shouldPoll reaproveitado de lá sem duplicar):
// busca o retrato inteiro do board a cada ~3.5s, compara com o que já está
// na tela (resolvePipelineUpdate) e só troca o estado quando há mudança de
// verdade — card novo, mudou de coluna, contador, sem piscar/recarregar.
// Nunca aplica uma atualização enquanto o operador está com o botão do
// mouse apertado (ex: arrastando a rolagem horizontal das colunas) ou com
// texto selecionado na tela — guarda o retrato mais recente e aplica só
// quando a interação termina. Pausa com a aba escondida e retoma (com uma
// busca imediata) ao voltar; isFetchingRef garante nunca duas buscas em
// paralelo.
export function PipelineBoard({
  clinicId,
  initialSnapshot,
}: {
  clinicId: string;
  initialSnapshot: PipelineSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const isFetchingRef = useRef(false);
  const pointerDownRef = useRef(false);
  const pendingRef = useRef<PipelineSnapshot | null>(null);

  const interactionActive = useCallback(() => isInteracting(pointerDownRef.current, currentSelectionType()), []);

  const applyPendingIfIdle = useCallback(() => {
    if (pendingRef.current && !interactionActive()) {
      const next = pendingRef.current;
      pendingRef.current = null;
      setSnapshot(next);
    }
  }, [interactionActive]);

  const poll = useCallback(async () => {
    if (!shouldPoll(document.visibilityState, isFetchingRef.current)) return;
    isFetchingRef.current = true;
    try {
      const res = await fetch(`/api/clinicas/${clinicId}/pipeline`, { cache: "no-store" });
      if (!res.ok) return;
      const incoming = (await res.json()) as PipelineSnapshot;

      const { apply, pending } = resolvePipelineUpdate(snapshotRef.current, incoming, interactionActive());
      if (apply) {
        setSnapshot(incoming);
      } else if (pending) {
        pendingRef.current = pending;
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, [clinicId, interactionActive]);

  useEffect(() => {
    function handlePointerDown() {
      pointerDownRef.current = true;
    }
    function handlePointerUp() {
      pointerDownRef.current = false;
      applyPendingIfIdle();
    }
    function handleSelectionChange() {
      applyPendingIfIdle();
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("pointerup", handlePointerUp);
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("pointerup", handlePointerUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [applyPendingIfIdle]);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    function startPolling() {
      if (intervalId) return;
      intervalId = setInterval(poll, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (!intervalId) return;
      clearInterval(intervalId);
      intervalId = null;
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void poll();
        startPolling();
      } else {
        stopPolling();
      }
    }

    if (document.visibilityState === "visible") startPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [poll]);

  const { conversations, metrics } = snapshot;
  const responseRate = metrics.newContacts > 0 ? metrics.responded / metrics.newContacts : null;
  const attendanceRate =
    metrics.completed + metrics.noShow > 0 ? metrics.completed / (metrics.completed + metrics.noShow) : null;

  const byStatus = Object.fromEntries(
    PIPELINE_COLUMNS.map((col) => [col.status, conversations.filter((c) => c.status === col.status)])
  );

  return (
    <>
      {/* Uma única faixa escura (bg-vexo-surface — mesmo tom reaproveitado
          no cabeçalho de cada coluna do board mais abaixo, ver
          PIPELINE_HEADER_BG) dividida em 4 seções por um divisor fino
          (divide-x), não mais 4 cards separados com borda própria cada —
          visual de "barra de status", não "blocos empilhados". Cada seção
          é 1 linha só (nome com destaque "marca-texto" + valor pequeno e
          discreto ao lado) — sem ícone, sem anel, sem texto de fórmula/
          período: a faixa é um resumo mínimo, não um dashboard.
          Estática/não responsiva de propósito (min-w por seção + rolagem
          horizontal em telas estreitas, ver overflow-x-auto), diferente
          do board de colunas logo abaixo. */}
      <div className="overflow-x-auto">
        <div className={`flex divide-x divide-vexo-border/20 overflow-hidden rounded-card border border-vexo-border/20 ${PIPELINE_HEADER_BG} text-vexo-pipelineHeaderFont`}>
          <div className="flex min-w-[160px] flex-1 items-center gap-2 px-3 py-1.5">
            <span className="inline-block max-w-full shrink-0 truncate rounded-sm bg-white/10 px-1.5 py-0.5 text-caption font-normal text-vexo-fg">
              Novos contatos
            </span>
            <span className="truncate text-card font-medium text-vexo-muted">{metrics.newContacts}</span>
          </div>
          <div className="flex min-w-[160px] flex-1 items-center gap-2 px-3 py-1.5">
            <span className="inline-block max-w-full shrink-0 truncate rounded-sm bg-white/10 px-1.5 py-0.5 text-caption font-normal text-vexo-fg">
              Taxa de resposta
            </span>
            <span className="truncate text-card font-medium text-vexo-muted">{formatPercent(responseRate)}</span>
          </div>
          <div className="flex min-w-[160px] flex-1 items-center gap-2 px-3 py-1.5">
            <span className="inline-block max-w-full shrink-0 truncate rounded-sm bg-white/10 px-1.5 py-0.5 text-caption font-normal text-vexo-fg">
              Agendados
            </span>
            <span className="truncate text-card font-medium text-vexo-muted">{metrics.scheduled}</span>
          </div>
          <div className="flex min-w-[160px] flex-1 items-center gap-2 px-3 py-1.5">
            <span className="inline-block max-w-full shrink-0 truncate rounded-sm bg-white/10 px-1.5 py-0.5 text-caption font-normal text-vexo-fg">
              Taxa de comparecimento
            </span>
            <span className="truncate text-card font-medium text-vexo-muted">{formatPercent(attendanceRate)}</span>
          </div>
        </div>
      </div>

      {/* Board com rolagem horizontal própria (arrasta os cards pros
          lados se as 6 colunas não couberem) — cada coluna só cresce em
          altura conforme o conteúdo, sem scroll vertical próprio; quem
          rola verticalmente é a página toda. */}
      <div className="overflow-x-auto pb-2">
        <div className="flex items-start gap-3">
          {PIPELINE_COLUMNS.map((col) => {
            const items = byStatus[col.status] ?? [];
            const tint = columnTint(col.status);
            return (
              <div key={col.status} className="w-64 shrink-0 rounded-card border border-vexo-border/30 bg-vexo-surface2 px-1.5 py-3">
                <div className={`mb-2.5 flex items-center justify-between gap-2 rounded-card ${PIPELINE_HEADER_BG} px-2 py-1`}>
                  <h2 className="truncate text-xs font-semibold text-vexo-fg">{col.label}</h2>
                  <span className="shrink-0 rounded-card bg-black/15 px-1.5 py-0.5 text-caption font-medium text-vexo-fg">
                    {items.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {items.map((conv) => {
                    const { primary, handle } = leadDisplayParts(conv.lead, null);
                    const cardClass = `rounded-card border border-vexo-border/20 ${tint.bg} p-2.5`;

                    if (col.status === "SCHEDULED") {
                      return (
                        <div key={conv.id} className={cardClass}>
                          <Link href={`/crm/conversas/${conv.id}`} className="flex items-start gap-2 transition hover:text-vexo-accent">
                            <LeadAvatar profilePictureUrl={conv.lead.profilePictureUrl} name={primary} size="lg" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 flex-1 truncate text-xs font-normal">{primary}</p>
                                {conv.appointmentScheduledAt && (
                                  <span className="shrink-0 text-caption text-vexo-muted">
                                    {formatDateTime(conv.appointmentScheduledAt)}
                                  </span>
                                )}
                              </div>
                              {handle && <p className="truncate text-caption text-vexo-muted">@{handle}</p>}
                              <span className={`mt-1.5 inline-block rounded-card ${tint.tagBg} px-1.5 py-0.5 text-caption font-medium ${tint.tagText}`}>
                                {col.label}
                              </span>
                            </div>
                          </Link>
                        </div>
                      );
                    }

                    return (
                      <div key={conv.id} className={cardClass}>
                        <Link href={`/crm/conversas/${conv.id}`} className="flex items-start gap-2 transition hover:text-vexo-accent">
                          <LeadAvatar profilePictureUrl={conv.lead.profilePictureUrl} name={primary} size="lg" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="min-w-0 flex-1 truncate text-xs font-normal">{primary}</p>
                              <span className="shrink-0 text-caption text-vexo-muted">
                                {conv.lastMessageAt ? formatDateTime(conv.lastMessageAt) : "—"}
                              </span>
                            </div>
                            {handle && <p className="truncate text-caption text-vexo-muted">@{handle}</p>}
                            <span className={`mt-1.5 inline-block rounded-card ${tint.tagBg} px-1.5 py-0.5 text-caption font-medium ${tint.tagText}`}>
                              {col.label}
                            </span>
                          </div>
                        </Link>
                      </div>
                    );
                  })}

                  {items.length === 0 && (
                    <p className="py-2 text-center text-caption text-vexo-muted">Nenhum lead aqui.</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
