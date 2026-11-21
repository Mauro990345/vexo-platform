"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { isWithinApproachHours, formatApproachWindowLabel } from "@/lib/approach-queue";
import { copyToClipboard } from "@/lib/clipboard";
import { INSTAGRAM_DM_WINDOW_NAME } from "@/lib/reactivation";
import {
  getApproachBoardForClinicAction,
  confirmApproachSendAction,
  undoApproachSendAction,
  skipApproachItemAction,
  setApproachPausedAction,
} from "@/app/crm/(global)/abordagem/actions";
import { ClinicQueueCard } from "@/app/crm/abordagem/fila/FilaView";
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

  return (
    <div className="max-w-[520px] space-y-2">
      <div>
        <h1 className="text-base font-semibold tracking-tight">Abordagem</h1>
        <p className="mt-0.5 text-xs text-vexo-muted">
          Fila só desta clínica — {clinicName}.{" "}
          <Link href="/crm/abordagem/fila" className="underline hover:text-vexo-fg">
            Ver a Fila de todas as clínicas
          </Link>
          .
        </p>
      </div>

      {!withinHours ? (
        <p className="rounded-block bg-vexo-surface p-block text-center text-sm text-vexo-muted">
          Fora do horário ({formatApproachWindowLabel(approachWindow.startMinute, approachWindow.endMinute)})
        </p>
      ) : (
        <>
          {account && account.items.length > 0 ? (
            <ClinicQueueCard
              account={account}
              now={now}
              fetchedAt={fetchedAt}
              sendingItemId={sendingItemId}
              onSend={handleSend}
              onSkip={handleSkip}
              onUndo={handleUndo}
              onPauseToggle={handlePauseToggle}
            />
          ) : (
            <p className="rounded-block bg-vexo-surface p-block text-center text-sm text-vexo-muted">Nenhum lead pronto pra abordar agora.</p>
          )}

          {notice && <p className="text-caption text-vexo-muted">{notice}</p>}
        </>
      )}
    </div>
  );
}
