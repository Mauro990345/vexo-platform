"use client";

import { useState } from "react";
import type { BriefingRevenueRange, BriefingVexoGoal } from "@prisma/client";
import { submitBriefing, type BriefingFormInput } from "@/app/briefing/[token]/actions";

type InitialBriefing = {
  flagshipService: string;
  currentlyAdvertises: boolean;
  advertisingMonthlySpend: string;
  revenueRange: BriefingRevenueRange;
  whatTried: string;
  hasSecretary: boolean;
  aiPersonaName: string;
  competitorInstagram1: string;
  competitorInstagram2: string;
  vexoGoal: BriefingVexoGoal;
  vexoGoalOther: string;
  averageTicket: string;
} | null;

const REVENUE_RANGE_OPTIONS: { value: BriefingRevenueRange; label: string }[] = [
  { value: "UNDER_20K", label: "Até R$ 20 mil" },
  { value: "FROM_20K_TO_50K", label: "R$ 20 mil – R$ 50 mil" },
  { value: "FROM_50K_TO_100K", label: "R$ 50 mil – R$ 100 mil" },
  { value: "OVER_100K", label: "Acima de R$ 100 mil" },
];

const VEXO_GOAL_OPTIONS: { value: BriefingVexoGoal; label: string }[] = [
  { value: "SCHEDULE_MORE_EVALUATIONS", label: "Agendar mais avaliações" },
  { value: "REDUCE_NO_SHOW", label: "Reduzir falta em consulta" },
  { value: "STOP_DEPENDING_ON_PAID_ADS", label: "Parar de depender de anúncio pago" },
  { value: "OTHER", label: "Outro" },
];

// Formulário de briefing de onboarding — sem login, chamado direto da
// página pública /briefing/[token] (ver page.tsx e actions.ts). Estado
// controlado local (não FormData) porque várias perguntas têm um campo
// condicional que só aparece dependendo da resposta anterior (valor de
// publicidade só quando "Sim", texto do "Outro" só quando esse objetivo é
// escolhido) — mais simples de expressar com useState do que lendo
// FormData espalhado.
//
// `initial` vem preenchido quando a clínica já respondeu antes (reabriu o
// mesmo link) — reenviar SOBRESCREVE a resposta anterior, sem histórico
// (ver comentário no schema, model Briefing).
export function BriefingForm({ token, initial }: { token: string; initial: InitialBriefing }) {
  const [flagshipService, setFlagshipService] = useState(initial?.flagshipService ?? "");
  const [currentlyAdvertises, setCurrentlyAdvertises] = useState<boolean | null>(
    initial?.currentlyAdvertises ?? null
  );
  const [advertisingMonthlySpend, setAdvertisingMonthlySpend] = useState(initial?.advertisingMonthlySpend ?? "");
  const [revenueRange, setRevenueRange] = useState<BriefingRevenueRange | null>(initial?.revenueRange ?? null);
  const [whatTried, setWhatTried] = useState(initial?.whatTried ?? "");
  const [hasSecretary, setHasSecretary] = useState<boolean | null>(initial?.hasSecretary ?? null);
  const [aiPersonaName, setAiPersonaName] = useState(initial?.aiPersonaName ?? "");
  const [competitorInstagram1, setCompetitorInstagram1] = useState(initial?.competitorInstagram1 ?? "");
  const [competitorInstagram2, setCompetitorInstagram2] = useState(initial?.competitorInstagram2 ?? "");
  const [vexoGoal, setVexoGoal] = useState<BriefingVexoGoal | null>(initial?.vexoGoal ?? null);
  const [vexoGoalOther, setVexoGoalOther] = useState(initial?.vexoGoalOther ?? "");
  const [averageTicket, setAverageTicket] = useState(initial?.averageTicket ?? "");

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (currentlyAdvertises === null || revenueRange === null || hasSecretary === null || vexoGoal === null) {
      setError("Preencha todas as perguntas obrigatórias antes de enviar.");
      return;
    }

    setPending(true);
    setError(null);
    try {
      const input: BriefingFormInput = {
        flagshipService,
        currentlyAdvertises,
        advertisingMonthlySpend,
        revenueRange,
        whatTried,
        hasSecretary,
        aiPersonaName,
        competitorInstagram1,
        competitorInstagram2,
        vexoGoal,
        vexoGoalOther,
        averageTicket,
      };
      const result = await submitBriefing(token, input);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDone(true);
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="text-center">
        <h2 className="text-base font-semibold">Respostas enviadas!</h2>
        <p className="mt-2 text-sm text-vexo-muted">
          Obrigado por preencher. Já pode fechar esta página — a equipe da VEXO vai usar essas
          respostas pra configurar tudo.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 text-left">
      <Field label="Qual o principal procedimento/serviço oferecido pela clínica?">
        <input
          type="text"
          value={flagshipService}
          onChange={(e) => setFlagshipService(e.target.value)}
          required
          className={inputClass}
        />
      </Field>

      <Field label="Qual o ticket médio dos procedimentos?">
        <input
          type="text"
          value={averageTicket}
          onChange={(e) => setAverageTicket(e.target.value)}
          placeholder="Valor aproximado"
          required
          className={inputClass}
        />
      </Field>

      <Field label="Você investe atualmente em publicidade?">
        <YesNo value={currentlyAdvertises} onChange={setCurrentlyAdvertises} name="currentlyAdvertises" />
        {currentlyAdvertises && (
          <input
            type="text"
            value={advertisingMonthlySpend}
            onChange={(e) => setAdvertisingMonthlySpend(e.target.value)}
            placeholder="Quanto por mês, aproximadamente?"
            className={`${inputClass} mt-2`}
          />
        )}
      </Field>

      <Field label="Qual a faixa de faturamento atual da clínica/empresa?">
        <div className="space-y-1.5">
          {REVENUE_RANGE_OPTIONS.map((opt) => (
            <RadioOption
              key={opt.value}
              name="revenueRange"
              label={opt.label}
              checked={revenueRange === opt.value}
              onChange={() => setRevenueRange(opt.value)}
            />
          ))}
        </div>
      </Field>

      <Field label="O que você já tentou pra atrair clientes que não deu certo?">
        <input
          type="text"
          value={whatTried}
          onChange={(e) => setWhatTried(e.target.value)}
          required
          className={inputClass}
        />
      </Field>

      <Field label="Você tem secretária?">
        <YesNo value={hasSecretary} onChange={setHasSecretary} name="hasSecretary" />
      </Field>

      <Field label="Que nome você quer que a IA use ao falar com seus seguidores?">
        <input
          type="text"
          value={aiPersonaName}
          onChange={(e) => setAiPersonaName(e.target.value)}
          required
          className={inputClass}
        />
      </Field>

      <Field label="@ do Instagram de dois concorrentes seus">
        <div className="space-y-1.5">
          <input
            type="text"
            value={competitorInstagram1}
            onChange={(e) => setCompetitorInstagram1(e.target.value)}
            placeholder="@primeiro concorrente"
            className={inputClass}
          />
          <input
            type="text"
            value={competitorInstagram2}
            onChange={(e) => setCompetitorInstagram2(e.target.value)}
            placeholder="@segundo concorrente"
            className={inputClass}
          />
        </div>
      </Field>

      <Field label="Qual o objetivo principal com a VEXO?">
        <div className="space-y-1.5">
          {VEXO_GOAL_OPTIONS.map((opt) => (
            <RadioOption
              key={opt.value}
              name="vexoGoal"
              label={opt.label}
              checked={vexoGoal === opt.value}
              onChange={() => setVexoGoal(opt.value)}
            />
          ))}
        </div>
        {vexoGoal === "OTHER" && (
          <input
            type="text"
            value={vexoGoalOther}
            onChange={(e) => setVexoGoalOther(e.target.value)}
            placeholder="Qual?"
            className={`${inputClass} mt-2`}
          />
        )}
      </Field>

      {error && (
        <p className="rounded-lg border border-vexo-error/30 bg-vexo-error/10 p-2 text-xs text-vexo-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-vexo-accent px-3 py-2.5 text-sm font-medium text-vexo-accentFg transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Enviando..." : initial ? "Reenviar respostas" : "Enviar respostas"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-vexo-border bg-vexo-bg px-3 py-2 text-sm outline-none focus:border-vexo-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-vexo-fg">{label}</label>
      {children}
    </div>
  );
}

function RadioOption({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-vexo-border px-3 py-2 text-sm hover:bg-vexo-surface2">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="shrink-0" />
      {label}
    </label>
  );
}

function YesNo({
  value,
  onChange,
  name,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  name: string;
}) {
  return (
    <div className="flex gap-2">
      <RadioOption name={name} label="Sim" checked={value === true} onChange={() => onChange(true)} />
      <RadioOption name={name} label="Não" checked={value === false} onChange={() => onChange(false)} />
    </div>
  );
}
