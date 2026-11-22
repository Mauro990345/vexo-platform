"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { copyToClipboard } from "@/lib/clipboard";
import { FOLLOWER_TOOL_DEFAULT_LIMIT, FOLLOWER_TOOL_MIN_LIMIT, FOLLOWER_TOOL_MAX_LIMIT } from "@/lib/follower-tool";
import { generateFollowerToolScriptAction } from "../actions";
import { UploadForm } from "../AbordagemPrepView";

type SeguidoresClinic = { id: string; name: string; igUsername: string | null };

// Ferramenta interna (ver DESIGN.md/follower-tool.ts) — entrega o script
// pronto pra copiar e colar no Console do instagram.com; o VEXO nunca
// executa nada do Instagram sozinho. Mesmo estilo compacto da tela de
// Preparação (AbordagemPrepView.tsx) — Card/Button/rounded-control, nada
// de cor/tamanho solto.
export function SeguidoresView({ clinics }: { clinics: SeguidoresClinic[] }) {
  return (
    <div className="mx-auto max-w-[520px] px-4 py-6 sm:px-0">
      <Link href="/crm/abordagem" className="text-caption text-vexo-muted hover:text-vexo-accent">
        ← Preparação
      </Link>
      <h1 className="mt-1 text-page-title tracking-tight text-vexo-fg">Buscar seguidores</h1>
      <p className="mt-1 text-xs text-vexo-muted">Uso interno. Roda no seu navegador, na conta da clínica logada no instagram.com.</p>

      <div className="mt-4">
        <ScriptForm clinics={clinics} />
      </div>

      <div className="mt-3">
        <Steps />
      </div>

      <div className="mt-3">
        <Cuidados />
      </div>

      <div className="mt-3">
        <UploadForm clinics={clinics} />
      </div>
    </div>
  );
}

function ScriptForm({ clinics }: { clinics: SeguidoresClinic[] }) {
  const [isPending, startTransition] = useTransition();
  const [clinicId, setClinicId] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedClinic = clinics.find((c) => c.id === clinicId) ?? null;

  function handleCopy(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    setCopied(false);
    startTransition(async () => {
      try {
        const script = await generateFollowerToolScriptAction(formData);
        const ok = await copyToClipboard(script);
        if (!ok) {
          setError("Não foi possível copiar.");
          return;
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Não foi possível gerar o script.");
      }
    });
  }

  return (
    <Card as="form" onSubmit={handleCopy} className="space-y-2">
      <div>
        <label className="mb-1 block text-caption text-vexo-muted" htmlFor="clinicId">
          Clínica
        </label>
        <select
          id="clinicId"
          name="clinicId"
          required
          value={clinicId}
          onChange={(e) => setClinicId(e.target.value)}
          className="w-full rounded-control border border-vexo-border bg-vexo-bg px-2 py-1.5 text-xs text-vexo-fg outline-none focus:border-vexo-accent"
        >
          <option value="">Clínica...</option>
          {clinics.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-caption text-vexo-muted">
          {selectedClinic?.igUsername ? `@${selectedClinic.igUsername} · ` : ""}Confira que a conta logada no instagram.com é a desta clínica.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-1 block text-caption text-vexo-muted" htmlFor="limit">
            Quantidade por rodada
          </label>
          <input
            id="limit"
            name="limit"
            type="number"
            min={FOLLOWER_TOOL_MIN_LIMIT}
            max={FOLLOWER_TOOL_MAX_LIMIT}
            step={1}
            required
            defaultValue={FOLLOWER_TOOL_DEFAULT_LIMIT}
            className="w-24 rounded-control border border-vexo-border bg-vexo-bg px-2 py-1.5 text-xs text-vexo-fg outline-none focus:border-vexo-accent"
          />
        </div>
        <label className="flex items-center gap-1.5 pb-1.5 text-caption text-vexo-muted">
          <input type="checkbox" name="restart" className="h-4 w-4 rounded border-vexo-border bg-vexo-bg accent-vexo-accent" />
          Começar do zero
        </label>
      </div>
      <p className="text-caption text-vexo-muted">
        Entre {FOLLOWER_TOOL_MIN_LIMIT} e {FOLLOWER_TOOL_MAX_LIMIT}.
      </p>

      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        {copied ? "Copiado ✓" : "Copiar script"}
      </Button>
      {error && <p className="text-caption text-vexo-error">{error}</p>}
    </Card>
  );
}

function Steps() {
  const steps = [
    "Abra o instagram.com no Chrome, logado na conta da clínica.",
    "Aperte F12 e abra a aba Console.",
    'Digite "permitir colar" e Enter (só na primeira vez).',
    "Cole o script e aperte Enter; espere.",
    "O arquivo CSV baixa sozinho; suba abaixo.",
  ];
  return (
    <Card className="space-y-1.5">
      <p className="text-xs font-medium text-vexo-fg">Passo a passo</p>
      <ol className="list-decimal space-y-1 pl-4 text-caption text-vexo-muted">
        {steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </Card>
  );
}

function Cuidados() {
  return (
    <Card className="space-y-1.5">
      <p className="text-xs font-medium text-vexo-fg">Cuidados</p>
      <ul className="list-disc space-y-1 pl-4 text-caption text-vexo-muted">
        <li>No máximo 1 ou 2 rodadas por dia por conta.</li>
        <li>Se aparecer erro 400, 403 ou 429, pare e espere algumas horas.</li>
        <li>O script continua de onde parou na rodada seguinte.</li>
      </ul>
    </Card>
  );
}
