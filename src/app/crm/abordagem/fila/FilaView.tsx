"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { isWithinApproachHours, formatApproachCountdown, formatApproachPauseCountdown, formatApproachWindowLabel } from "@/lib/approach-queue";
import { copyToClipboard } from "@/lib/clipboard";
import { ClinicAvatar } from "@/components/ClinicAvatar";
import {
  getApproachBoardAction,
  confirmApproachSendAction,
  undoApproachSendAction,
  skipApproachItemAction,
  setApproachPausedAction,
} from "../../(global)/abordagem/actions";
import type { ApproachBoardAccount, ApproachBoardItem, ApproachWindow } from "@/lib/approach-queue-db";

const POLL_INTERVAL_MS = 15_000;
const TICK_INTERVAL_MS = 1_000;
const NOTICE_DURATION_MS = 3_000;

function firstNameOnly(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// Cada clínica participante tem sempre só 1 lead ativo — até 5 cards de
// clínicas DIFERENTES na mesma tela, sem precisar trocar de conta clicando
// (ver DESIGN.md "Fila de abordagem — rodada 6"). A ordem e a escolha de
// QUAIS 3 clínicas aparecem já vêm prontas do servidor (getApproachBoard —
// liberadas primeiro, depois por quem volta mais cedo); o cliente só
// precisa confiar nessa ordem e reconsultar o board inteiro depois de
// qualquer ação, pra reorganizar a tela sozinha (um card descer/sumir e o
// próximo subir no lugar).
export function FilaView({ initialAccounts, initialWindow }: { initialAccounts: ApproachBoardAccount[]; initialWindow: ApproachWindow }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [approachWindow, setApproachWindow] = useState(initialWindow);
  const [fetchedAtByClinic, setFetchedAtByClinic] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialAccounts.map((a) => [a.clinicId, Date.now()]))
  );
  const [now, setNow] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const [withinHours, setWithinHours] = useState(() => isWithinApproachHours(new Date(), initialWindow.startMinute, initialWindow.endMinute));
  // Item com um envio em andamento (copiar/abrir já aconteceram, falta só
  // a confirmação do servidor) — trava extra no cliente contra toque
  // duplo, além do claim atômico que o servidor já garante. Guardado por
  // id de item (não por clínica), já que cada card tem o seu próprio.
  const [sendingItemId, setSendingItemId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function showNotice(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? null : current)), NOTICE_DURATION_MS);
  }

  // Tick de 1s só pra recalcular as contagens regressivas exibidas — nunca
  // refaz a busca no servidor sozinho (ver poll abaixo, que é quem de fato
  // sincroniza entre aparelhos).
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      setWithinHours(isWithinApproachHours(new Date(), approachWindow.startMinute, approachWindow.endMinute));
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [approachWindow]);

  async function refreshBoard() {
    const board = await getApproachBoardAction();
    setAccounts(board.accounts);
    setApproachWindow(board.window);
    setFetchedAtByClinic(Object.fromEntries(board.accounts.map((a) => [a.clinicId, Date.now()])));
  }

  // Sincroniza com o servidor periodicamente — pega mudanças feitas em
  // outro aparelho (trocar de celular pro computador), upload novo de
  // leads e o horário/tempos permitidos (se o admin salvar algo novo na
  // tela de Preparação enquanto a Fila está aberta). Pulado enquanto uma
  // ação local está em andamento, pra não sobrescrever um estado otimista
  // no meio do caminho.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (isPending || sendingItemId) return;
      void refreshBoard();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isPending, sendingItemId]);

  // UM TOQUE, nesta ordem exata (mesmo padrão de InstagramDmButton.tsx,
  // Reativação): copia a mensagem JÁ PRONTA (veio no item, nunca sorteada
  // aqui) e abre o Instagram ANTES de qualquer espera de rede — no Safari/
  // iOS, window.open só é permitido no mesmo "gesto" do toque; esperar uma
  // resposta do servidor antes bloqueia a abertura. Só DEPOIS disso (sem
  // bloquear o que já aconteceu) o servidor é avisado pra registrar o
  // envio de verdade — se ele recusar (corrida, limite batido no meio do
  // caminho), desfaz só o lado do cliente (mostra aviso, não conta). Com 3
  // cards na tela ao mesmo tempo, cada toque mexe só no seu próprio item —
  // os outros 2 cards continuam normais.
  function handleSend(clinicId: string, item: ApproachBoardItem) {
    if (!item.message || !item.dmLink) {
      showNotice("Cadastre mensagens para esta clínica em Mensagens.");
      return;
    }
    setSendingItemId(item.id);
    void (async () => {
      const copied = await copyToClipboard(item.message!);
      if (!copied) showNotice("Não foi possível copiar — cole a mensagem na mão.");
      window.open(item.dmLink!, "_blank", "noopener,noreferrer");

      const result = await confirmApproachSendAction(clinicId, item.id);
      setSendingItemId(null);
      if (!result.ok) showNotice("Não deu pra registrar o envio agora — tente de novo.");
      await refreshBoard();
    })();
  }

  function handleSkip(clinicId: string, itemId: string) {
    startTransition(async () => {
      await skipApproachItemAction(clinicId, itemId);
      await refreshBoard();
    });
  }

  function handleUndo(clinicId: string) {
    startTransition(async () => {
      await undoApproachSendAction(clinicId);
      await refreshBoard();
    });
  }

  function handlePauseToggle(clinicId: string, paused: boolean) {
    startTransition(async () => {
      await setApproachPausedAction(clinicId, paused);
      await refreshBoard();
    });
  }

  return (
    <div className="mx-auto max-w-[520px] px-4 py-2 sm:px-0">
      <Link href="/crm/abordagem" className="text-caption text-vexo-muted hover:text-vexo-accent">
        ← Preparação
      </Link>
      <h1 className="text-base font-semibold tracking-tight text-vexo-fg">Abordagem</h1>

      {!withinHours ? (
        <p className="mt-4 rounded-block bg-vexo-surface p-block text-center text-sm text-vexo-muted">
          Fora do horário ({formatApproachWindowLabel(approachWindow.startMinute, approachWindow.endMinute)})
        </p>
      ) : (
        <>
          <div className="mt-2 space-y-2">
            {accounts.map((account) => (
              <ClinicQueueCard
                key={account.clinicId}
                account={account}
                now={now}
                fetchedAt={fetchedAtByClinic[account.clinicId] ?? now}
                sendingItemId={sendingItemId}
                onSend={(item) => handleSend(account.clinicId, item)}
                onSkip={(itemId) => handleSkip(account.clinicId, itemId)}
                onUndo={() => handleUndo(account.clinicId)}
                onPauseToggle={(paused) => handlePauseToggle(account.clinicId, paused)}
              />
            ))}
            {accounts.length === 0 && <p className="rounded-block bg-vexo-surface p-block text-center text-sm text-vexo-muted">Nenhum lead pronto pra abordar agora.</p>}
          </div>

          {notice && <p className="mt-2 text-caption text-vexo-muted">{notice}</p>}
        </>
      )}
    </div>
  );
}

// ms restante "ao vivo" — o snapshot do servidor (msRemaining) fica velho
// assim que o relógio local anda; recalcula a partir do instante em que
// aquele snapshot foi buscado (fetchedAt), pra contagem regressiva correr
// suave sem precisar reconsultar o servidor a cada segundo. Vale tanto pra
// espera comum (WAITING) quanto pra pausa de lote (BATCH_PAUSED) — as duas
// trazem msRemaining do mesmo jeito.
function liveRemainingMs(account: ApproachBoardAccount, now: number, fetchedAt: number): number {
  if (account.state.kind !== "WAITING" && account.state.kind !== "BATCH_PAUSED") return 0;
  const readyAt = fetchedAt + account.state.msRemaining;
  return Math.max(0, readyAt - now);
}

export function ClinicQueueCard({
  account,
  now,
  fetchedAt,
  sendingItemId,
  onSend,
  onSkip,
  onUndo,
  onPauseToggle,
}: {
  account: ApproachBoardAccount;
  now: number;
  fetchedAt: number;
  sendingItemId: string | null;
  onSend: (item: ApproachBoardItem) => void;
  onSkip: (itemId: string) => void;
  onUndo: () => void;
  onPauseToggle: (paused: boolean) => void;
}) {
  const item = account.items[0];
  if (!item) return null;

  const remaining = liveRemainingMs(account, now, fetchedAt);
  const effectivelyWaiting = account.state.kind === "WAITING" && remaining > 0;
  const effectivelyBatchPaused = account.state.kind === "BATCH_PAUSED" && remaining > 0;
  const sending = sendingItemId === item.id;
  const timedStateExpired = (account.state.kind === "WAITING" || account.state.kind === "BATCH_PAUSED") && remaining <= 0;
  const ready = !sending && !effectivelyWaiting && !effectivelyBatchPaused && (account.state.kind === "READY" || timedStateExpired);

  const reasonLabel = account.state.kind === "LIMIT_REACHED" ? "Limite de hoje" : account.state.kind === "PAUSED" ? "Pausada" : account.state.kind === "OUTSIDE_HOURS" ? "Fora do horário" : null;

  const { name, username } = item;

  // Área de toque maior que o desenho visual do botão (pedido explícito:
  // "pelo menos 44px de altura, sem mudar o desenho") — um ::before
  // absoluto, centralizado verticalmente, com no mínimo `min-h-11` (44px,
  // escala padrão do Tailwind) e a largura toda do botão. Só aumenta a
  // área que recebe o toque; o fundo azul/cinza visível continua do
  // tamanho normal (padding da própria label). Mesmo truque reaproveitável
  // em qualquer botão pequeno demais pro próprio desenho.
  const tapTargetClass = "relative before:absolute before:inset-x-0 before:top-1/2 before:min-h-11 before:-translate-y-1/2 before:content-['']";

  // Links pequenos (Pular/Pausar conta/Desfazer) — mesmo truque de área de
  // toque, só que mais discreto (padding pequeno + margem negativa igual,
  // pra não deslocar o texto visualmente nem encostar um link no outro).
  const smallLinkClass = "-mx-1 -my-1 px-1 py-1 text-meta text-vexo-mutedLight hover:text-vexo-accent";

  return (
    <div className="flex items-center gap-2.5 rounded-block border border-vexo-border bg-vexo-surface px-block py-block-y" data-clinic-queue-card>
      <ClinicAvatar name={account.name} profilePictureUrl={account.profilePictureUrl} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-medium text-vexo-fg">
          {account.name} <span className="text-meta font-normal text-vexo-mutedLight">· {account.leadsRemaining}</span>
        </p>
        {name ? (
          <p className="truncate text-meta text-vexo-muted">
            {firstNameOnly(name)} · @{username}
          </p>
        ) : (
          <p className="truncate text-meta text-vexo-muted">@{username}</p>
        )}
        <div className="flex flex-wrap items-center gap-x-3">
          <button type="button" onClick={() => onSkip(item.id)} className={smallLinkClass}>
            Pular
          </button>
          {account.state.kind === "PAUSED" ? (
            <button type="button" onClick={() => onPauseToggle(false)} className={smallLinkClass}>
              Retomar conta
            </button>
          ) : (
            <button type="button" onClick={() => onPauseToggle(true)} className={smallLinkClass}>
              Pausar conta
            </button>
          )}
          {effectivelyWaiting && (
            <button type="button" onClick={onUndo} className={smallLinkClass}>
              Não enviei · Desfazer
            </button>
          )}
        </div>
      </div>

      {ready ? (
        <button
          type="button"
          onClick={() => onSend(item)}
          className={`shrink-0 whitespace-nowrap rounded-control bg-vexo-accent px-5 py-2 text-center text-body-sm font-medium text-vexo-accentFg transition hover:opacity-90 ${tapTargetClass}`}
        >
          Enviar
        </button>
      ) : (
        <button
          type="button"
          disabled
          className="shrink-0 cursor-not-allowed whitespace-nowrap rounded-control bg-vexo-surface2 px-5 py-2 text-center text-body-sm font-medium text-vexo-muted"
        >
          {reasonLabel ?? (effectivelyBatchPaused ? `Pausa ${formatApproachPauseCountdown(remaining)}` : `Aguarde ${formatApproachCountdown(remaining)}`)}
        </button>
      )}
    </div>
  );
}
