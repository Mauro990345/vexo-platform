"use client";

import { useState, useTransition } from "react";
import { TemplateMessageField } from "@/components/TemplateMessageField";
import { REACTIVATION_THRESHOLD_OPTIONS, TEST_PERIOD_DAYS } from "@/lib/reactivation";

const SAVED_LABEL_DURATION_MS = 2000;

// Classe do botão "Salvar" pequeno, mesmo estilo já usado em "Salvar
// lembretes"/"Salvar configuração" — compartilhada pelos dois forms deste
// arquivo pra ficarem idênticos.
const SAVE_BUTTON_CLASS =
  "shrink-0 rounded-lg border border-vexo-accent px-2.5 py-1 text-caption font-medium text-vexo-accent transition hover:bg-vexo-accent/10 disabled:cursor-not-allowed disabled:opacity-50";

// Intercepta o submit pra poder mostrar "Salvo ✓" por 2s depois que a
// server action volta — um <form action={fn}> puro não dá esse gancho
// (não tem callback de sucesso), então chama a action manualmente com o
// FormData do form (preventDefault), mesmo dado que o navio enviaria.
function useSavableForm(action: (formData: FormData) => Promise<void>) {
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await action(formData);
      setSaved(true);
      window.setTimeout(() => setSaved(false), SAVED_LABEL_DURATION_MS);
    });
  }

  return { isPending, saved, handleSubmit };
}

// Bloco "Prazos sem retorno" — chips de período + botão "Salvar períodos"
// NA MESMA LINHA, à direita (pedido explícito). Ação própria: grava só
// thresholdDaysList, nunca toca nas mensagens.
export function ReactivationThresholdsForm({
  action,
  defaultSelected,
}: {
  action: (formData: FormData) => Promise<void>;
  defaultSelected: Set<number>;
}) {
  const { isPending, saved, handleSubmit } = useSavableForm(action);

  return (
    <form onSubmit={handleSubmit}>
      <p className="mb-1.5 text-xs text-vexo-muted">Prazos sem retorno</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {REACTIVATION_THRESHOLD_OPTIONS.map((days) => (
          <label key={days} className="cursor-pointer">
            <input
              type="checkbox"
              name="thresholdDays"
              value={days}
              defaultChecked={defaultSelected.has(days)}
              className="peer sr-only"
            />
            <span className="inline-flex items-center gap-1 rounded-full border border-vexo-border px-2.5 py-1 text-caption font-medium text-vexo-muted transition peer-checked:border-vexo-accent peer-checked:bg-vexo-accent/15 peer-checked:text-vexo-accent">
              {days} dias
              {(TEST_PERIOD_DAYS as readonly number[]).includes(days) && <span className="opacity-70">(teste)</span>}
            </span>
          </label>
        ))}
        <button type="submit" disabled={isPending} className={SAVE_BUTTON_CLASS}>
          {saved ? "Salvo ✓" : "Salvar períodos"}
        </button>
      </div>
    </form>
  );
}

// Bloco de 5 mensagens (WhatsApp OU Instagram — mesmo formato, só o nome
// dos campos e a ação mudam) — <details> recolhido mostra o resumo,
// clique abre pra editar, "Salvar" fecha de volta pro resumo (pedido
// explícito). <details> controlado (open/onToggle) só pra poder fechar
// programaticamente depois do save — clicar no <summary> continua
// abrindo/fechando normalmente, onToggle só sincroniza o estado React de
// volta com o que o navegador já fez.
export function ReactivationMessageBlockForm({
  action,
  title,
  summary,
  fieldNamePrefix,
  defaultValues,
}: {
  action: (formData: FormData) => Promise<void>;
  title: string;
  summary: string;
  fieldNamePrefix: "message" | "instagramMessage";
  defaultValues: (string | null | undefined)[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Mostra "Salvo ✓" por 2s ANTES de recolher — se fechasse na hora, o
  // aviso nunca apareceria (o botão fica dentro do <details>, some junto).
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await action(formData);
      setSaved(true);
      window.setTimeout(() => {
        setSaved(false);
        setOpen(false);
      }, SAVED_LABEL_DURATION_MS);
    });
  }

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group rounded-lg border border-vexo-border bg-vexo-surface2"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 text-card text-vexo-muted">{title}</span>
          <span className="truncate text-xs">{summary}</span>
        </div>
        <span className="shrink-0 text-card text-vexo-muted transition group-open:rotate-180">▾</span>
      </summary>
      <form onSubmit={handleSubmit} className="space-y-2 border-t border-vexo-border px-3 pb-3 pt-2.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <TemplateMessageField
            key={n}
            name={`${fieldNamePrefix}${n}`}
            label={`Mensagem ${n}`}
            required={false}
            rows={2}
            variables={[]}
            defaultValue={defaultValues[n - 1] ?? ""}
            placeholder="Vazio usa um texto padrão de acompanhamento, sem citar serviço/procedimento."
          />
        ))}
        <button type="submit" disabled={isPending} className={SAVE_BUTTON_CLASS}>
          {saved ? "Salvo ✓" : "Salvar"}
        </button>
      </form>
    </details>
  );
}

// Config do card "Quente" (ver hot-lead-cards.ts) — limite diário + as
// mesmas 5 mensagens de ReactivationMessageBlockForm (campos "message1"..
// "message5", MESMO fieldNamePrefix), só que num form próprio, com o
// limite diário junto (updateClinicHotLeadConfig lê os dois do mesmo
// FormData) — por isso não reaproveita ReactivationMessageBlockForm
// diretamente (ela não tem onde encaixar o campo extra).
export function HotLeadConfigForm({
  action,
  summary,
  dailyLimit,
  defaultValues,
}: {
  action: (formData: FormData) => Promise<void>;
  summary: string;
  dailyLimit: number;
  defaultValues: (string | null | undefined)[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  // Mesmo padrão de ReactivationMessageBlockForm acima: mostra "Salvo ✓"
  // por 2s ANTES de recolher.
  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      await action(formData);
      setSaved(true);
      window.setTimeout(() => {
        setSaved(false);
        setOpen(false);
      }, SAVED_LABEL_DURATION_MS);
    });
  }

  return (
    <details
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group rounded-lg border border-vexo-border bg-vexo-surface2"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 text-card text-vexo-muted">Mensagens Quente</span>
          <span className="truncate text-xs">{summary}</span>
        </div>
        <span className="shrink-0 text-card text-vexo-muted transition group-open:rotate-180">▾</span>
      </summary>
      <form onSubmit={handleSubmit} className="space-y-2.5 border-t border-vexo-border px-3 pb-3 pt-2.5">
        <div>
          <label className="mb-1 block text-xs text-vexo-muted" htmlFor="dailyLimit">
            Limite de envios por dia
          </label>
          <input
            id="dailyLimit"
            name="dailyLimit"
            type="number"
            min={1}
            required
            defaultValue={dailyLimit}
            className="w-20 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
          />
        </div>
        {[1, 2, 3, 4, 5].map((n) => (
          <TemplateMessageField
            key={n}
            name={`message${n}`}
            label={`Mensagem ${n}`}
            required={false}
            rows={2}
            variables={[{ token: "{{primeiro_nome}}", label: "+ Nome do lead" }]}
            defaultValue={defaultValues[n - 1] ?? ""}
            placeholder="Vazio usa um texto padrão de acompanhamento."
          />
        ))}
        <button type="submit" disabled={isPending} className={SAVE_BUTTON_CLASS}>
          {saved ? "Salvo ✓" : "Salvar"}
        </button>
      </form>
    </details>
  );
}
