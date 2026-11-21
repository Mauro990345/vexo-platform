"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { isWithinApproachHours, formatApproachWindowLabel, formatApproachEstimateLabel } from "@/lib/approach-queue";
import { copyToClipboard } from "@/lib/clipboard";
import { INSTAGRAM_DM_WINDOW_NAME } from "@/lib/reactivation";
import { InstagramOutlineIcon } from "@/components/BrandIcons";
import {
  getApproachBoardForClinicAction,
  confirmApproachSendAction,
  undoApproachSendAction,
  skipApproachItemAction,
  setApproachPausedAction,
} from "@/app/crm/(global)/abordagem/actions";
import { ClinicQueueCard, firstNameOnly } from "@/app/crm/abordagem/fila/FilaView";
import type { ApproachBoardAccount, ApproachBoardItem, ApproachWindow } from "@/lib/approach-queue-db";

const POLL_INTERVAL_MS = 15_000;
const TICK_INTERVAL_MS = 1_000;
const NOTICE_DURATION_MS = 3_000;

// Fila de UMA clínica só (pedido explícito: operar várias clínicas ao
// mesmo tempo, um perfil do Chrome por clínica — cada aba sempre presa
// na mesma conta, nunca misturando com a de outra clínica). Mesmo
// comportamento da Fila global (FilaView.tsx) — tempos, pausa de lote,
// botão "Enviar" reaproveitando a mesma aba do Instagram (ver
// INSTAGRAM_DM_WINDOW_NAME) — só que SEM depender do toggle "ativa na
// fila" da Preparação (getApproachBoardForClinicAction busca esta conta
// direto, nunca passa pela lista de contas ativas que monta o board
// global) e mostrando só o card desta clínica, nunca o de outra.
//
// Reaproveita ClinicQueueCard de FilaView.tsx (mesmo componente, mesmo
// visual, inclusive o @ do Instagram conectado no topo — ver
// DESIGN.md) em vez de duplicar o card aqui — qualquer ajuste nele (ex.:
// o próprio @ conectado, pedido junto desta tela) vale pras duas telas
// de uma vez, sem precisar lembrar de mudar em dois lugares.
export function ClinicFilaView({
  clinicId,
  clinicName,
  initialAccount,
  initialWindow,
}: {
  clinicId: string;
  clinicName: string;
  initialAccount: ApproachBoardAccount | null;
  initialWindow: ApproachWindow;
}) {
  const [account, setAccount] = useState(initialAccount);
  const [approachWindow, setApproachWindow] = useState(initialWindow);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const [withinHours, setWithinHours] = useState(() => isWithinApproachHours(new Date(), initialWindow.startMinute, initialWindow.endMinute));
  // Mesma trava extra do cliente contra toque duplo da Fila global (ver
  // FilaView.tsx) — aqui só existe UM item possível por vez (1 card), mas
  // o id confere que a confirmação que está voltando é da MESMA tentativa
  // de envio que disparou o toque, não uma resposta atrasada de uma
  // anterior.
  const [sendingItemId, setSendingItemId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function showNotice(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? null : current)), NOTICE_DURATION_MS);
  }

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      setWithinHours(isWithinApproachHours(new Date(), approachWindow.startMinute, approachWindow.endMinute));
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [approachWindow]);

  async function refreshBoard() {
    const board = await getApproachBoardForClinicAction(clinicId);
    setAccount(board.account);
    setApproachWindow(board.window);
    setFetchedAt(Date.now());
  }

  useEffect(() => {
    const id = window.setInterval(() => {
      if (isPending || sendingItemId) return;
      void refreshBoard();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isPending, sendingItemId]);

  // Mesma ordem/motivo de sempre (ver FilaView.tsx/handleSend): copia a
  // mensagem e abre o Instagram ANTES de qualquer espera de rede — no
  // Safari/iOS, window.open só é permitido no mesmo "gesto" do toque.
  function handleSend(item: ApproachBoardItem) {
    if (!item.message || !item.dmLink) {
      showNotice("Cadastre mensagens para esta clínica em Mensagens.");
      return;
    }
    setSendingItemId(item.id);
    void (async () => {
      const copied = await copyToClipboard(item.message!);
      if (!copied) showNotice("Não foi possível copiar — cole a mensagem na mão.");
      window.open(item.dmLink!, INSTAGRAM_DM_WINDOW_NAME, "noopener,noreferrer");

      const result = await confirmApproachSendAction(clinicId, item.id);
      setSendingItemId(null);
      if (!result.ok) showNotice("Não deu pra registrar o envio agora — tente de novo.");
      await refreshBoard();
    })();
  }

  function handleSkip(itemId: string) {
    startTransition(async () => {
      await skipApproachItemAction(clinicId, itemId);
      await refreshBoard();
    });
  }

  function handleUndo() {
    startTransition(async () => {
      await undoApproachSendAction(clinicId);
      await refreshBoard();
    });
  }

  function handlePauseToggle(paused: boolean) {
    startTransition(async () => {
      await setApproachPausedAction(clinicId, paused);
      await refreshBoard();
    });
  }

  // Itens 1..N (tudo que não é o ativo) — só prévia esmaecida, nunca
  // clicável (ver comentário grande de QueuedLeadPreviewRow, abaixo).
  const queuedPreview = (account?.items ?? []).slice(1);

  return (
    <div className="max-w-[520px] space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-1.5">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <h1 className="text-base font-semibold tracking-tight">Abordagem</h1>
          <span aria-hidden="true" className="text-vexo-mutedLight">
            ·
          </span>
          {/* @ do Instagram CONECTADO desta clínica, SEM "@" na frente
              (pedido explícito) — só nesta tela, ao lado do título; a Fila
              global continua com o @ dentro de cada card (ver
              ClinicQueueCard, hideConnectedHandle). Ícone de CONTORNO
              (InstagramOutlineIcon, sem a cor da marca) — já tem bastante
              cor perto (badge do título/sidebar), o contorno evita
              competir visualmente. */}
          <span className="flex items-center gap-1 text-base font-semibold text-vexo-fg">
            <InstagramOutlineIcon className="h-4 w-4 shrink-0" />
            {account?.igUsername ?? "Instagram não conectado"}
          </span>
        </div>
        <Link href="/crm/abordagem/fila" className="shrink-0 text-caption text-vexo-muted underline hover:text-vexo-fg">
          Fila de todas as clínicas
        </Link>
      </div>

      {!withinHours ? (
        <p className="rounded-block bg-vexo-surface p-block text-center text-sm text-vexo-muted">
          Fora do horário ({formatApproachWindowLabel(approachWindow.startMinute, approachWindow.endMinute)})
        </p>
      ) : (
        <>
          {account && account.items.length > 0 ? (
            <div className="space-y-1.5">
              <ClinicQueueCard
                account={account}
                now={now}
                fetchedAt={fetchedAt}
                sendingItemId={sendingItemId}
                onSend={handleSend}
                onSkip={handleSkip}
                onUndo={handleUndo}
                onPauseToggle={handlePauseToggle}
                hideConnectedHandle
              />
              {queuedPreview.map((item) => (
                <QueuedLeadPreviewRow key={item.id} item={item} now={now} fetchedAt={fetchedAt} />
              ))}
            </div>
          ) : (
            <p className="rounded-block bg-vexo-surface p-block text-center text-sm text-vexo-muted">Nenhum lead pronto pra abordar agora.</p>
          )}

          {notice && <p className="text-caption text-vexo-muted">{notice}</p>}
        </>
      )}
    </div>
  );
}

// Prévia dos PRÓXIMOS leads da fila, empilhados atrás do ativo (pedido
// explícito — ver CLINIC_FILA_STACK_SIZE, approach-queue-db.ts). Só
// aparência: nome/@ + uma estimativa de quando devem liberar
// (formatApproachEstimateLabel, ver comentário grande de
// estimateQueuedItemsMsRemaining, approach-queue.ts, pro porquê de NUNCA
// ser uma garantia exata). NUNCA clicável — sem onClick, sem
// href, sem cursor-pointer — só o card ativo (ClinicQueueCard, acima)
// tem o botão "Enviar" de verdade; manter só um envio por vez liberado é
// a MESMA regra de sempre, isto aqui é só visual.
function QueuedLeadPreviewRow({ item, now, fetchedAt }: { item: ApproachBoardItem; now: number; fetchedAt: number }) {
  const estimatedMs = item.estimatedMsRemaining ?? 0;
  const remaining = Math.max(0, fetchedAt + estimatedMs - now);
  return (
    <div className="flex items-center justify-between gap-2 rounded-block border border-vexo-border bg-vexo-surface px-block py-1.5 opacity-50">
      <p className="truncate text-meta text-vexo-muted">{item.name ? `${firstNameOnly(item.name)} · @${item.username}` : `@${item.username}`}</p>
      <span className="shrink-0 whitespace-nowrap text-meta text-vexo-mutedLight">{formatApproachEstimateLabel(remaining)}</span>
    </div>
  );
}
