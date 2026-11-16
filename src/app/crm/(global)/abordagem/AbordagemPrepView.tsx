"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { toggleActiveInQueueAction, updateDailyLimitAction, uploadApproachLeadsAction, updateApproachWindowAction } from "./actions";
import type { ApproachWindow } from "@/lib/approach-queue-db";

type PrepClinic = {
  id: string;
  name: string;
  igUsername: string | null;
  dailyLimit: number;
  activeInQueue: boolean;
  paused: boolean;
  hasMessages: boolean;
};

export function AbordagemPrepView({ clinics, window }: { clinics: PrepClinic[]; window: ApproachWindow }) {
  const selectedCount = clinics.filter((c) => c.activeInQueue).length;

  return (
    <div className="mx-auto max-w-[520px] px-4 py-6 sm:px-0">
      <h1 className="text-base font-semibold tracking-tight text-vexo-fg">Abordagem</h1>
      <p className="mt-1 text-xs text-vexo-muted">
        Preparação da fila — escolha quais contas entram agora, ajuste o limite por dia e envie a lista de leads de cada
        clínica.
      </p>

      <div className="mt-4">
        <WindowForm window={window} />
      </div>

      <div className="mt-3">
        <UploadForm clinics={clinics} />
      </div>

      <ul className="mt-4 space-y-1.5">
        {clinics.map((clinic) => (
          <ClinicRow key={clinic.id} clinic={clinic} />
        ))}
        {clinics.length === 0 && <li className="rounded-block bg-vexo-surface p-block text-xs text-vexo-muted">Nenhuma clínica ativa.</li>}
      </ul>

      <div className="mt-5">
        <Link
          href="/crm/abordagem/fila"
          className="block rounded-control bg-vexo-accent px-control-x py-2 text-center text-sm font-medium text-vexo-accentFg transition hover:opacity-90"
        >
          Começar {selectedCount > 0 ? `(${selectedCount})` : ""}
        </Link>
      </div>
    </div>
  );
}

function ClinicRow({ clinic }: { clinic: PrepClinic }) {
  const [isPending, startTransition] = useTransition();
  const [active, setActive] = useState(clinic.activeInQueue);

  function toggle() {
    const next = !active;
    setActive(next);
    startTransition(async () => {
      await toggleActiveInQueueAction(clinic.id, next);
    });
  }

  return (
    <li className="rounded-control border border-vexo-border bg-vexo-surface px-3 py-2">
      <div className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={active}
          onChange={toggle}
          disabled={isPending}
          aria-label={`Abordar ${clinic.name} agora`}
          className="h-4 w-4 shrink-0 rounded border-vexo-border bg-vexo-bg text-vexo-accent accent-vexo-accent"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-vexo-fg">{clinic.name}</p>
          <p className="truncate text-caption text-vexo-muted">{clinic.igUsername ? `@${clinic.igUsername}` : "sem Instagram conectado"}</p>
        </div>
        <DailyLimitField clinicId={clinic.id} dailyLimit={clinic.dailyLimit} />
        <Link
          href={`/crm/abordagem/${clinic.id}/mensagens`}
          className={`shrink-0 text-caption font-medium underline-offset-2 hover:underline ${clinic.hasMessages ? "text-vexo-accent" : "text-vexo-warning"}`}
        >
          Mensagens
        </Link>
      </div>
    </li>
  );
}

function DailyLimitField({ clinicId, dailyLimit }: { clinicId: string; dailyLimit: number }) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
    const formData = new FormData();
    formData.set("dailyLimit", e.target.value);
    startTransition(async () => {
      await updateDailyLimitAction(clinicId, formData);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <input
        type="number"
        min={1}
        defaultValue={dailyLimit}
        onBlur={handleBlur}
        disabled={isPending}
        aria-label="Limite por dia"
        className="w-14 rounded-control border border-vexo-border bg-vexo-bg px-1.5 py-1 text-center text-caption text-vexo-fg outline-none focus:border-vexo-accent"
      />
      {saved && (
        <span className="text-caption text-vexo-success" aria-live="polite">
          ✓
        </span>
      )}
    </div>
  );
}

function minutesToTimeInputValue(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Mesmo modelo do "Horário inicial/final" do Follow-up
// (updateFollowUpWindow, crm/(global)/follow-up/actions.ts) — horário com
// minutos, valida início < fim. Vale pra TODAS as clínicas (um horário só,
// pedido explícito) — padrão 7h-20h até salvar outro aqui.
function WindowForm({ window: approachWindow }: { window: ApproachWindow }) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateApproachWindowAction(formData);
        setSaved(true);
        window.setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível salvar o horário.");
      }
    });
  }

  return (
    <Card as="form" onSubmit={handleSubmit} className="space-y-2">
      <p className="text-xs font-medium text-vexo-fg">Horário permitido</p>
      <p className="text-caption text-vexo-muted">Vale para todas as clínicas. Fora dele, a Fila fica bloqueada.</p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-caption text-vexo-muted" htmlFor="windowStart">
            Das
          </label>
          <input
            id="windowStart"
            name="windowStart"
            type="time"
            required
            defaultValue={minutesToTimeInputValue(approachWindow.startMinute)}
            className="rounded-control border border-vexo-border bg-vexo-bg px-2 py-1.5 text-xs text-vexo-fg outline-none focus:border-vexo-accent"
          />
        </div>
        <div>
          <label className="mb-1 block text-caption text-vexo-muted" htmlFor="windowEnd">
            às
          </label>
          <input
            id="windowEnd"
            name="windowEnd"
            type="time"
            required
            defaultValue={minutesToTimeInputValue(approachWindow.endMinute)}
            className="rounded-control border border-vexo-border bg-vexo-bg px-2 py-1.5 text-xs text-vexo-fg outline-none focus:border-vexo-accent"
          />
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          {saved ? "Salvo ✓" : "Salvar"}
        </Button>
      </div>
      <p className="text-caption text-vexo-muted">Horário de São Paulo.</p>
      {error && <p className="text-caption text-vexo-error">{error}</p>}
    </Card>
  );
}

function UploadForm({ clinics }: { clinics: PrepClinic[] }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ added: number; discarded: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const formData = new FormData(formEl);
    setError(null);
    setResult(null);
    startTransition(async () => {
      try {
        const res = await uploadApproachLeadsAction(formData);
        setResult(res);
        formEl.reset();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível enviar a lista.");
      }
    });
  }

  return (
    <Card as="form" onSubmit={handleSubmit} className="space-y-2">
      <p className="text-xs font-medium text-vexo-fg">Enviar lista de leads</p>
      <div className="flex flex-wrap gap-2">
        <select
          name="clinicId"
          required
          className="min-w-0 flex-1 rounded-control border border-vexo-border bg-vexo-bg px-2 py-1.5 text-xs text-vexo-fg outline-none focus:border-vexo-accent"
        >
          <option value="">Clínica...</option>
          {clinics.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="file"
          name="file"
          accept=".csv,.txt,text/csv,text/plain"
          required
          className="min-w-0 flex-1 text-xs text-vexo-muted file:mr-2 file:rounded-control file:border file:border-vexo-border file:bg-vexo-surface2 file:px-2 file:py-1 file:text-caption file:text-vexo-fg"
        />
      </div>
      <p className="text-caption text-vexo-muted">CSV ou TXT (um @ por linha). Coluna de nome é opcional.</p>
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {isPending ? "Enviando..." : "Enviar lista"}
      </Button>
      {result && (
        <p className="text-caption text-vexo-success">
          {result.added} lead(s) entraram na fila{result.discarded > 0 ? ` · ${result.discarded} descartado(s) (duplicado, já enviado ou já em conversa)` : ""}.
        </p>
      )}
      {error && <p className="text-caption text-vexo-error">{error}</p>}
    </Card>
  );
}
