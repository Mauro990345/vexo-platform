"use client";

import { useState, useTransition } from "react";
import { TemplateMessageField } from "@/components/TemplateMessageField";
import { RETURN_PERIOD_OPTIONS } from "@/lib/reactivation";

const SAVED_LABEL_DURATION_MS = 2000;

// Classe do botão "Salvar" pequeno, mesmo estilo já usado em "Salvar
// lembretes"/"Salvar configuração" — compartilhada pelos forms deste
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

// Grupo de chips de prazo — reaproveitado pelos dois blocos do item 1 do
// pedido ("Prazos disponíveis para a secretária" e "Padrão quando ela não
// marcar"), cada um com seu PRÓPRIO fieldName/action (gravam campos
// diferentes de ReactivationConfig — availablePeriods/defaultPeriods — ver
// updateClinicReturnPeriods, crm/clinicas/actions.ts). Marcado = chip
// preenchido (bg-vexo-accent/15 + borda/texto accent); desmarcado = só
// contorno (border-vexo-border, texto muted) — pedido explícito, mesmo
// visual escuro já usado no resto de Automações.
export function ReturnPeriodChipsForm({
  action,
  label,
  fieldName,
  defaultSelected,
}: {
  action: (formData: FormData) => Promise<void>;
  label: string;
  fieldName: string;
  defaultSelected: Set<number>;
}) {
  const { isPending, saved, handleSubmit } = useSavableForm(action);

  return (
    <form onSubmit={handleSubmit}>
      <p className="mb-1.5 text-xs text-vexo-muted">{label}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {RETURN_PERIOD_OPTIONS.map((days) => (
          <label key={days} className="cursor-pointer">
            <input type="checkbox" name={fieldName} value={days} defaultChecked={defaultSelected.has(days)} className="peer sr-only" />
            <span className="inline-flex items-center gap-1 rounded-full border border-vexo-border px-2.5 py-1 text-caption font-medium text-vexo-muted transition peer-checked:border-vexo-accent peer-checked:bg-vexo-accent/15 peer-checked:text-vexo-accent">
              {days} dias
            </span>
          </label>
        ))}
        <button type="submit" disabled={isPending} className={SAVE_BUTTON_CLASS}>
          {saved ? "Salvo ✓" : "Salvar"}
        </button>
      </div>
    </form>
  );
}

// "Limite diário de envios por WhatsApp (Reativação + Faltou)" — item 1 do
// pedido, número único por clínica (ver ReactivationConfig.
// dailyWhatsappLimit/countTodaysWhatsappSends, reactivation.ts).
export function DailyWhatsappLimitForm({ action, dailyLimit }: { action: (formData: FormData) => Promise<void>; dailyLimit: number }) {
  const { isPending, saved, handleSubmit } = useSavableForm(action);

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-xs text-vexo-muted" htmlFor="dailyWhatsappLimit">
          Limite diário de envios por WhatsApp (Reativação + Faltou)
        </label>
        <input
          id="dailyWhatsappLimit"
          name="dailyWhatsappLimit"
          type="number"
          min={1}
          required
          defaultValue={dailyLimit}
          className="w-20 rounded-lg border border-vexo-border bg-vexo-bg px-2.5 py-1.5 text-xs outline-none focus:border-vexo-accent"
        />
      </div>
      <button type="submit" disabled={isPending} className={SAVE_BUTTON_CLASS}>
        {saved ? "Salvo ✓" : "Salvar"}
      </button>
    </form>
  );
}

// Bloco de até 5 mensagens da Reativação — <details> recolhido mostra o
// resumo, clique abre pra editar, "Salvar" fecha de volta pro resumo
// (pedido explícito). Conjunto ÚNICO agora (usado tanto no envio de
// WhatsApp quanto no fallback de Instagram, pedido explícito — antes havia
// dois conjuntos separados, um por canal). <details> controlado (open/
// onToggle) só pra poder fechar programaticamente depois do save — clicar
// no <summary> continua abrindo/fechando normalmente, onToggle só
// sincroniza o estado React de volta com o que o navegador já fez.
export function ReactivationMessageBlockForm({
  action,
  summary,
  defaultValues,
}: {
  action: (formData: FormData) => Promise<void>;
  summary: string;
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
          <span className="shrink-0 text-card text-vexo-muted">Mensagens</span>
          <span className="truncate text-xs">{summary}</span>
        </div>
        <span className="shrink-0 text-card text-vexo-muted transition group-open:rotate-180">▾</span>
      </summary>
      <form onSubmit={handleSubmit} className="space-y-2 border-t border-vexo-border px-3 pb-3 pt-2.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <TemplateMessageField
            key={n}
            name={`message${n}`}
            label={`Mensagem ${n}`}
            required={false}
            rows={2}
            variables={[{ token: "{{primeiro_nome}}", label: "+ Nome do lead" }]}
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

const HOT_LEAD_STEP_LABELS: readonly string[] = ["Passo 1 · 2 dias", "Passo 2 · 4 dias", "Passo 3 · 30 dias"];

// Config do card "Quente" (ver hot-lead-cards.ts) — limite diário + até 3
// variações de texto POR PASSO (3 passos fixos, pedido explícito) — um só
// form/botão "Salvar" pra tudo junto (dailyLimit + os 3 grupos), mesmo
// mecanismo de texto de sempre (reaproveita TemplateMessageField, mesmo
// componente usado pela Reativação acima).
export function HotLeadConfigForm({
  action,
  summary,
  dailyLimit,
  stepDefaultValues,
}: {
  action: (formData: FormData) => Promise<void>;
  summary: string;
  dailyLimit: number;
  // Uma entrada por passo (3), cada uma com até 3 valores.
  stepDefaultValues: (string | null | undefined)[][];
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
      <form onSubmit={handleSubmit} className="space-y-3 border-t border-vexo-border px-3 pb-3 pt-2.5">
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
        {[1, 2, 3].map((step) => (
          <div key={step} className="space-y-2 border-t border-vexo-border pt-2.5">
            <p className="text-xs font-medium text-vexo-fg">{HOT_LEAD_STEP_LABELS[step - 1]}</p>
            {[1, 2, 3].map((n) => (
              <TemplateMessageField
                key={n}
                name={`step${step}Message${n}`}
                label={`Mensagem ${n}`}
                required={false}
                rows={2}
                variables={[{ token: "{{primeiro_nome}}", label: "+ Nome do lead" }]}
                defaultValue={stepDefaultValues[step - 1]?.[n - 1] ?? ""}
                placeholder="Vazio usa um texto padrão de acompanhamento."
              />
            ))}
          </div>
        ))}
        <button type="submit" disabled={isPending} className={SAVE_BUTTON_CLASS}>
          {saved ? "Salvo ✓" : "Salvar"}
        </button>
      </form>
    </details>
  );
}
