"use client";

import { useState, useTransition } from "react";
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

// "Limite de envios por dia" do card "Quente" (ver hot-lead-cards.ts) —
// mesmo padrão exato de DailyWhatsappLimitForm acima, só campo/label
// diferentes. AJUSTE (pedido explícito, "unificar os textos... numa
// única tela GLOBAL"): as 9 mensagens (3 por passo, e as 5 da
// Reativação, antigo ReactivationMessageBlockForm/HotLeadConfigForm,
// removidos aqui) saíram desta tela — agora globais, editadas em
// Follow-up → "Cards do Painel" (ver updatePanelCardSettings,
// src/app/crm/(global)/follow-up/actions.ts). Esta função ficou só com o
// que continua POR CLÍNICA.
export function HotLeadDailyLimitForm({ action, dailyLimit }: { action: (formData: FormData) => Promise<void>; dailyLimit: number }) {
  const { isPending, saved, handleSubmit } = useSavableForm(action);

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
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
      <button type="submit" disabled={isPending} className={SAVE_BUTTON_CLASS}>
        {saved ? "Salvo ✓" : "Salvar"}
      </button>
    </form>
  );
}
