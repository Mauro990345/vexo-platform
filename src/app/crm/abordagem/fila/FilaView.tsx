"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { isWithinApproachHours, formatApproachCountdown, formatApproachWindowLabel } from "@/lib/approach-queue";
import { copyToClipboard } from "@/lib/clipboard";
import {
  getApproachBoardAction,
  sendApproachMessageAction,
  undoApproachSendAction,
  skipApproachItemAction,
  setApproachPausedAction,
  type SendApproachMessageActionResult,
} from "../../(global)/abordagem/actions";
import type { ApproachBoardAccount, ApproachWindow } from "@/lib/approach-queue-db";

const POLL_INTERVAL_MS = 15_000;
const TICK_INTERVAL_MS = 1_000;

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function firstNameOnly(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function FilaView({ initialAccounts, initialWindow }: { initialAccounts: ApproachBoardAccount[]; initialWindow: ApproachWindow }) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [approachWindow, setApproachWindow] = useState(initialWindow);
  const [fetchedAtByClinic, setFetchedAtByClinic] = useState<Record<string, number>>(() =>
    Object.fromEntries(initialAccounts.map((a) => [a.clinicId, Date.now()]))
  );
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(initialAccounts[0]?.clinicId ?? null);
  const [now, setNow] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();
  const [withinHours, setWithinHours] = useState(() => isWithinApproachHours(new Date(), initialWindow.startMinute, initialWindow.endMinute));

  // Tick de 1s só pra recalcular o "Aguarde m:ss" exibido — nunca refaz a
  // busca no servidor sozinho (ver poll abaixo, que é quem de fato
  // sincroniza entre aparelhos).
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
      setWithinHours(isWithinApproachHours(new Date(), approachWindow.startMinute, approachWindow.endMinute));
    }, TICK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [approachWindow]);

  // Sincroniza com o servidor periodicamente — pega mudanças feitas em
  // outro aparelho (trocar de celular pro computador, pedido explícito),
  // upload novo de leads e o horário permitido (se o admin salvar um novo
  // na tela de Preparação enquanto a Fila está aberta). Pulado enquanto uma
  // ação local está em andamento, pra não sobrescrever um estado otimista
  // no meio do caminho.
  useEffect(() => {
    const id = window.setInterval(async () => {
      if (isPending) return;
      const board = await getApproachBoardAction();
      setAccounts(board.accounts);
      setApproachWindow(board.window);
      setFetchedAtByClinic(Object.fromEntries(board.accounts.map((a) => [a.clinicId, Date.now()])));
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [isPending]);

  function patchAccount(account: ApproachBoardAccount) {
    setAccounts((prev) => prev.map((a) => (a.clinicId === account.clinicId ? account : a)));
    setFetchedAtByClinic((prev) => ({ ...prev, [account.clinicId]: Date.now() }));
  }

  const selected = accounts.find((a) => a.clinicId === selectedClinicId) ?? null;

  function handleSend(clinicId: string) {
    startTransition(async () => {
      const result: SendApproachMessageActionResult = await sendApproachMessageAction(clinicId);
      if (!result.ok) return; // trava checada de novo no servidor (ex.: corrida) — botão só reflete no próximo poll
      patchAccount(result.account);
      await copyToClipboard(result.message);
      window.open(result.dmLink, "_blank", "noopener,noreferrer");
    });
  }

  function handleSkip(clinicId: string, itemId: string) {
    startTransition(async () => {
      const account = await skipApproachItemAction(clinicId, itemId);
      if (account) patchAccount(account);
    });
  }

  function handleUndo(clinicId: string) {
    startTransition(async () => {
      const account = await undoApproachSendAction(clinicId);
      if (account) patchAccount(account);
    });
  }

  function handlePauseToggle(clinicId: string, paused: boolean) {
    startTransition(async () => {
      const account = await setApproachPausedAction(clinicId, paused);
      if (account) patchAccount(account);
    });
  }

  return (
    <div className="mx-auto max-w-[520px] px-4 py-4 sm:px-0">
      <Link href="/crm/abordagem" className="text-caption text-vexo-muted hover:text-vexo-accent">
        ← Preparação
      </Link>
      <h1 className="mt-1 text-base font-semibold tracking-tight text-vexo-fg">Abordagem</h1>

      {!withinHours ? (
        <p className="mt-4 rounded-block bg-vexo-surface p-block text-center text-sm text-vexo-muted">
          Fora do horário ({formatApproachWindowLabel(approachWindow.startMinute, approachWindow.endMinute)})
        </p>
      ) : (
        <>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {accounts.map((account) => (
              <AccountChip
                key={account.clinicId}
                account={account}
                now={now}
                fetchedAt={fetchedAtByClinic[account.clinicId] ?? now}
                selected={account.clinicId === selectedClinicId}
                onSelect={() => setSelectedClinicId(account.clinicId)}
              />
            ))}
            {accounts.length === 0 && <p className="text-xs text-vexo-muted">Nenhuma conta marcada em Abordagem.</p>}
          </div>

          {selected && (
            <SelectedAccountPanel
              account={selected}
              now={now}
              fetchedAt={fetchedAtByClinic[selected.clinicId] ?? now}
              onSend={() => handleSend(selected.clinicId)}
              onSkip={(itemId) => handleSkip(selected.clinicId, itemId)}
              onUndo={() => handleUndo(selected.clinicId)}
              onPauseToggle={(paused) => handlePauseToggle(selected.clinicId, paused)}
            />
          )}
        </>
      )}
    </div>
  );
}

function liveRemainingMs(account: ApproachBoardAccount, now: number, fetchedAt: number): number {
  if (account.state.kind !== "WAITING") return 0;
  const readyAt = fetchedAt + account.state.msRemaining;
  return Math.max(0, readyAt - now);
}

function AccountChip({
  account,
  now,
  fetchedAt,
  selected,
  onSelect,
}: {
  account: ApproachBoardAccount;
  now: number;
  fetchedAt: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const remaining = liveRemainingMs(account, now, fetchedAt);
  const effectivelyWaiting = account.state.kind === "WAITING" && remaining > 0;

  const circleClass =
    account.state.kind === "PAUSED"
      ? "bg-vexo-border text-vexo-muted"
      : account.state.kind === "LIMIT_REACHED"
        ? "bg-vexo-warning/25 text-vexo-warning"
        : effectivelyWaiting
          ? "bg-vexo-muted/20 text-vexo-muted"
          : "bg-vexo-success/25 text-vexo-success";

  const subLabel =
    account.state.kind === "PAUSED"
      ? "Pausada"
      : account.state.kind === "LIMIT_REACHED"
        ? "Limite de hoje"
        : effectivelyWaiting
          ? formatApproachCountdown(remaining)
          : `${account.sentToday}/${account.dailyLimit}`;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex shrink-0 flex-col items-center gap-1 rounded-control px-2 py-1.5 text-center transition ${selected ? "bg-vexo-surface2" : ""}`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold ${circleClass}`}>{initialsOf(account.name)}</span>
      <span className="max-w-[72px] truncate text-caption text-vexo-fg">{account.name}</span>
      <span className="text-caption text-vexo-muted">{subLabel}</span>
    </button>
  );
}

function SelectedAccountPanel({
  account,
  now,
  fetchedAt,
  onSend,
  onSkip,
  onUndo,
  onPauseToggle,
}: {
  account: ApproachBoardAccount;
  now: number;
  fetchedAt: number;
  onSend: () => void;
  onSkip: (itemId: string) => void;
  onUndo: () => void;
  onPauseToggle: (paused: boolean) => void;
}) {
  const remaining = liveRemainingMs(account, now, fetchedAt);
  const effectivelyWaiting = account.state.kind === "WAITING" && remaining > 0;
  const ready = account.state.kind === "READY" || (account.state.kind === "WAITING" && remaining <= 0);

  return (
    <div className="mt-4">
      <p className="text-sm font-medium text-vexo-fg">{account.name}</p>
      <p className="text-caption text-vexo-muted">{account.igUsername ? `@${account.igUsername}` : "sem Instagram conectado"}</p>

      {account.state.kind === "PAUSED" ? (
        <div className="mt-3 rounded-block bg-vexo-surface p-block text-center">
          <p className="text-sm text-vexo-muted">Pausada</p>
          <button type="button" onClick={() => onPauseToggle(false)} className="mt-2 text-caption font-medium text-vexo-accent hover:underline">
            Retomar conta
          </button>
        </div>
      ) : account.state.kind === "LIMIT_REACHED" ? (
        <div className="mt-3 rounded-block bg-vexo-surface p-block text-center text-sm text-vexo-muted">Limite de hoje</div>
      ) : (
        <div className="mt-3 space-y-1.5">
          {account.items.length === 0 && <p className="rounded-block bg-vexo-surface p-block text-center text-sm text-vexo-muted">Fila vazia</p>}
          {account.items.map((item, idx) => (
            <LeadCard
              key={item.id}
              name={item.name}
              username={item.username}
              active={idx === 0}
              ready={idx === 0 && ready}
              waiting={idx === 0 && effectivelyWaiting}
              countdown={formatApproachCountdown(remaining)}
              onSend={onSend}
              onSkip={() => onSkip(item.id)}
            />
          ))}
        </div>
      )}

      {effectivelyWaiting && (
        <button type="button" onClick={onUndo} className="mt-1.5 text-caption text-vexo-muted hover:text-vexo-accent">
          Não enviei · Desfazer
        </button>
      )}

      {account.state.kind !== "PAUSED" && (
        <button type="button" onClick={() => onPauseToggle(true)} className="mt-3 block text-caption text-vexo-muted hover:text-vexo-accent">
          Pausar esta conta
        </button>
      )}
    </div>
  );
}

// Sem nome (caso comum — a lista só traz o @), mostra SÓ o @ em destaque,
// sem repetir numa 2ª linha embaixo (bug relatado: o card duplicava o
// mesmo @ duas vezes). Com nome, primeiro nome em destaque + @ embaixo.
export function LeadCard({
  name,
  username,
  active,
  ready,
  waiting,
  countdown,
  onSend,
  onSkip,
}: {
  name: string | null;
  username: string;
  active: boolean;
  ready: boolean;
  waiting: boolean;
  countdown: string;
  onSend: () => void;
  onSkip: () => void;
}) {
  if (!active) {
    return (
      <div className="rounded-control border border-vexo-border bg-vexo-surface px-3 py-2 opacity-50" data-lead-card>
        {name ? (
          <>
            <p className="truncate text-caption text-vexo-fg">{name}</p>
            <p className="truncate text-caption text-vexo-muted">@{username}</p>
          </>
        ) : (
          <p className="truncate text-caption text-vexo-fg">@{username}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-block border border-vexo-border bg-vexo-surface p-block" data-lead-card>
      {name ? (
        <>
          <p className="text-base font-semibold text-vexo-fg">{firstNameOnly(name)}</p>
          <p className="text-caption text-vexo-muted">@{username}</p>
        </>
      ) : (
        <p className="text-base font-semibold text-vexo-fg">@{username}</p>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        {ready ? (
          <>
            <button
              type="button"
              onClick={onSend}
              className="flex-1 rounded-control bg-vexo-accent px-control-x py-2 text-sm font-medium text-vexo-accentFg transition hover:opacity-90"
            >
              Enviar mensagem
            </button>
            <button
              type="button"
              onClick={onSkip}
              className="shrink-0 rounded-control border border-vexo-border px-2.5 py-2 text-caption text-vexo-muted transition hover:border-vexo-accent hover:text-vexo-accent"
            >
              Pular
            </button>
          </>
        ) : (
          <button type="button" disabled className="flex-1 cursor-not-allowed rounded-control bg-vexo-surface2 px-control-x py-2 text-sm font-medium text-vexo-muted">
            {waiting ? `Aguarde ${countdown}` : "Aguarde"}
          </button>
        )}
      </div>
    </div>
  );
}
